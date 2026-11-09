/**
 * LA PAUSA DEL RASPADO PROGRAMADO (09-nov · firma de Emilio): «lo importante es que el cerebro con el portero funcionen óptimo para las llamadas del sistema; lo único que queda
 * pausado es el raspado diario o intradía. No importa si se generan informes iguales. Dejar funcionando el resto.»
 * La fecha vive en la configuración (`PORTERO_RASPADO_PAUSADO_HASTA`, ver `modo.ts`): se reanuda sola. Aquí, lo que la pausa decide fuera del modo:
 *  · `descubrir` (lo que el portero le pide a Apify): en la ventana de la corrida del HORARIO vacía todo pedido a Apify de un cliente que ya está completo. Un cliente en ALTA
 *    (pausa «hasta la alta» abierta, o que nunca tuvo una corrida hecha) raspa igual. Fuera de esa ventana (pedidos del sistema, completar huecos) todo raspa igual.
 *  · la línea visible: UN incidente en `cerebro_alertas` («raspado diario en pausa hasta …»), que se repite sin publicar otro mensaje y se cierra solo al vencer la pausa.
 * NO toca `cerebro_portero_pausas`: nadie queda «pausado». US$ 0.
 */
import type { Db } from './alimentar'
import { corridaQueSeRevisa, modoDelEntorno, pausaDelRaspadoDelEntorno, raspadoEnPausa } from './modo'
import { vaciarPedidosAApify } from './plan-apify'

type Fila = Record<string, unknown>
type Env = Record<string, string | undefined>
const lista = (x: unknown): Fila[] => (Array.isArray(x) ? (x as Fila[]) : [])

/** minutos después de la hora programada en que una llamada a `descubrir` se toma como parte de la corrida del horario (la cadena, sus tandas y el reintento de la misma mañana) */
export const VENTANA_DE_LA_CORRIDA_PROGRAMADA_MIN = 180

/** el día legible del regreso: «25-nov» (las 00:00 UTC de ese día) */
export const diaDelRegreso = (hasta: string): string => {
  const d = new Date(hasta)
  const meses = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
  return `${String(d.getUTCDate()).padStart(2, '0')}-${meses[d.getUTCMonth()]}`
}
export const claveDeLaPausaDelRaspado = (hasta: string): string => `raspado-en-pausa:${hasta.slice(0, 10)}`
/** el texto fijo (sin horas ni cifras: así cada repetición cuenta y no publica otro mensaje) */
export const lineaDeLaPausaDelRaspado = (hasta: string): string =>
  `⏸️ Portero del cerebro · raspado diario en pausa hasta el ${diaDelRegreso(hasta)} (firma de Emilio 09-nov: el crédito de Apify del mes se agotó). El cerebro, el portero, las altas y los pedidos del sistema siguen funcionando; la corrida diaria sigue como mantenimiento sin Apify. Vuelve sola, sin tocar nada.`
export const motivoDeLaPausa = (hasta: string): string => `raspado diario en pausa hasta el ${diaDelRegreso(hasta)}`

/** ¿esta hora cae dentro de la corrida del horario (0 a 180 min después de una hora programada del modo, en un día con corrida)? */
export function enLaCorridaProgramada(ahora: Date, env: Env = process.env): boolean {
  return corridaQueSeRevisa(modoDelEntorno(env).modo, ahora, 0, VENTANA_DE_LA_CORRIDA_PROGRAMADA_MIN, env) !== null
}

/** ¿el cliente está en ALTA? pausa «hasta la alta» abierta, o nunca tuvo una corrida hecha (cliente nuevo). Una lectura fallida se DICE */
export async function clienteEnAlta(db: Db, clientId: string): Promise<{ ok: true; en_alta: boolean; por_que: string } | { ok: false; detalle: string }> {
  const p = await db.from('cerebro_portero_pausas').select('id').eq('client_id', clientId).eq('termina_con', 'alta_terminada').is('levantada_en', null).limit(1)
  if (p.error) return { ok: false, detalle: `cerebro_portero_pausas: ${p.error.message}` }
  if (lista(p.data).length) return { ok: true, en_alta: true, por_que: 'tiene una pausa «hasta la alta» abierta' }
  const c = await db.from('cerebro_portero_corridas').select('id').eq('client_id', clientId).eq('estado', 'hecha').limit(1)
  if (c.error) return { ok: false, detalle: `cerebro_portero_corridas: ${c.error.message}` }
  if (!lista(c.data).length) return { ok: true, en_alta: true, por_que: 'todavía no tiene una corrida hecha (cliente nuevo)' }
  return { ok: true, en_alta: false, por_que: 'ya está completo' }
}

export type DecisionDeLaPausa =
  | { frena: false; por_que: string; hasta: string | null }
  | { frena: true; por_que: string; hasta: string }

/**
 * ¿`descubrir` debe vaciar lo que le pide a Apify? Solo si: la pausa está vigente, la llamada cae en la corrida del horario, no es la fase «clientes» (que no pide nada)
 * y el cliente no está en alta. Si no se puede saber si está en alta, NO se frena (un alta nunca se queda sin raspar por una lectura fallida) y se dice.
 */
export async function decidirPausaDelDescubrir(d: { db: Db; ahora: Date; env?: Env; clientId: string; fase?: unknown }): Promise<DecisionDeLaPausa> {
  const env = d.env ?? process.env
  const { hasta } = pausaDelRaspadoDelEntorno(env)
  if (hasta === null || !raspadoEnPausa(d.ahora, env)) return { frena: false, por_que: 'el raspado no está en pausa', hasta: null }
  if (d.fase === 'clientes') return { frena: false, por_que: 'la fase «clientes» no le pide nada a Apify', hasta }
  if (!enLaCorridaProgramada(d.ahora, env)) return { frena: false, por_que: 'fuera de la corrida del horario: un pedido del sistema raspa igual', hasta }
  const a = await clienteEnAlta(d.db, d.clientId)
  if (!a.ok) return { frena: false, por_que: `no se pudo saber si el cliente está en alta (${a.detalle}): no se frena`, hasta }
  if (a.en_alta) return { frena: false, por_que: `el cliente está en alta: ${a.por_que}`, hasta }
  return { frena: true, por_que: motivoDeLaPausa(hasta), hasta }
}

/** el cuerpo de `descubrir` con la pausa aplicada: nada para Apify, y la razón a la vista */
export function frenarPorLaPausa(body: Fila, decision: DecisionDeLaPausa): Fila {
  const meta = { raspado_en_pausa: { frena: decision.frena, hasta: decision.hasta, por_que: decision.por_que } }
  if (!decision.frena) return decision.hasta ? { ...body, ...meta } : body
  return { ...vaciarPedidosAApify(body, decision.por_que), ...meta }
}

/**
 * La línea visible: mientras la pausa esté vigente, UN incidente en `cerebro_alertas` (repetirlo solo cuenta: el texto es fijo y la vigía de 24 h no lo cierra porque `/modo` lo
 * repite en cada disparo del horario). Al vencer, se cierra en su hilo. Nunca lanza: lo que falla se devuelve.
 */
export async function sostenerLaLineaDeLaPausa(d: { ahora: Date; env?: Env; avisar?: (texto: string, clave: string) => Promise<{ ok: boolean; detalle: string }>; resolver?: (clave: string, nota: string) => Promise<{ ok: boolean; detalle: string }> }): Promise<{ accion: 'avisada' | 'cerrada' | 'nada'; detalle: string }> {
  const env = d.env ?? process.env
  const { hasta } = pausaDelRaspadoDelEntorno(env)
  if (hasta === null) return { accion: 'nada', detalle: 'sin pausa configurada' }
  const clave = claveDeLaPausaDelRaspado(hasta)
  try {
    if (raspadoEnPausa(d.ahora, env)) {
      if (!d.avisar) return { accion: 'nada', detalle: 'sin canal de avisos' }
      const r = await d.avisar(lineaDeLaPausaDelRaspado(hasta), clave)
      return { accion: 'avisada', detalle: r.detalle }
    }
    if (!d.resolver) return { accion: 'nada', detalle: 'sin canal de avisos' }
    const r = await d.resolver(clave, `el raspado diario volvió solo el ${diaDelRegreso(hasta)}`)
    return { accion: 'cerrada', detalle: r.detalle }
  } catch (e) { return { accion: 'nada', detalle: e instanceof Error ? e.message : String(e) } }
}
