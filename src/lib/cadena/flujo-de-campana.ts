/**
 * EL BOTÓN «FLUJO DE LA CAMPAÑA» (GO de Lenovo 18-nov · boceto aprobado por Emilio 13:43 Zúrich) · la parte de la cadena.
 *
 * Un solo botón con 3 estados, que se LEEN de la campaña (nada pintado a mano):
 *   · verde  «EN MARCHA»             · la campaña está viva y avanzando (abierta · estrategia · calendario · activa) → tocarlo la PARA
 *   · dorado «PARADO POR TI · <hito>» · la pausó una persona desde el tablero; el hito dice dónde quedó → tocarlo la REANUDA desde ahí
 *   · rojo   «DETENIDO · <motivo>»    · se paró sola (`necesita_humano`, o la pausa del reloj tras 7 días) → tocarlo INTENTA reanudar
 *
 * Reglas (asesoría de CC3 en el GO, 12:46Z):
 *   · es una acción HUMANA del tablero (`{ humano: true }` solo aquí; `abrir` · `avanzar` · `cerrada` siguen cerradas al tablero) y la compuerta sigue aplicando;
 *   · se puede parar también mientras se planifica, y al reanudar se vuelve al MISMO estado (no se salta la planificación);
 *   · el dorado solo es dorado si la pausa la puso el tablero: la pausa del reloj (7 días en `necesita_humano`) es roja;
 *   · el rojo revisa la causa conocida ANTES de cambiar nada (la bolsa de planificación): si sigue, no cambia nada y lo dice, y la alerta abierta sigue siendo una;
 *   · pedir el estado en que ya está contesta «ya estaba», sin transición ni alerta nueva (el doble toque).
 *
 * Quién pausó, a qué estado se vuelve y el hito viajan en `estado_motivo` con un prefijo fijo (sin migración). El tablero lee el MISMO texto: el prefijo es contrato.
 */
import type { Almacen, Campana, EstadoCampana } from './almacen'
import { autorizarLlamada, cadena, compuerta, err, type Respuesta } from './autorizar'
import { arrancarAlActivar } from './arranque'
import { medidaDeCampana, topeDelPaso } from './constantes'
import { diasEntre, esFechaIso, lunesDe } from './fechas'
import { abrirEsperaDe, bolsaDelPaso, resolverEsperas } from './nucleo'
import { transicionValida } from './campanas'

/** los estados en que la campaña está viva y avanzando: el botón está verde y se puede parar */
export const ESTADOS_EN_MARCHA = ['abierta', 'estrategia', 'calendario', 'activa'] as const satisfies readonly EstadoCampana[]
type EnMarcha = (typeof ESTADOS_EN_MARCHA)[number]
const enMarcha = (e: EstadoCampana): e is EnMarcha => (ESTADOS_EN_MARCHA as readonly string[]).includes(e)

/** 🔴 CONTRATO con el tablero (lo lee `lib/flujo-de-campana.ts` del tablero): no se cambia sin cambiar los dos y sus pruebas */
export const PREFIJO_DE_PAUSA_DEL_TABLERO = 'pausada desde el tablero'
const SEPARADOR = ' · '

export function motivoDePausaDelTablero(vuelveA: EnMarcha, hito: string): string {
  return `${PREFIJO_DE_PAUSA_DEL_TABLERO}${SEPARADOR}vuelve a: ${vuelveA}${SEPARADOR}${hito}`
}

/** lee la pausa del tablero de un `estado_motivo`; cualquier otro texto (la pausa del reloj, un motivo viejo) → null */
export function leerPausaDelTablero(motivo: string | null | undefined): { vuelve_a: EnMarcha; hito: string } | null {
  const m = new RegExp(`^${PREFIJO_DE_PAUSA_DEL_TABLERO}${SEPARADOR}vuelve a: (\\w+)${SEPARADOR}(.+)$`).exec(String(motivo ?? ''))
  if (!m || !enMarcha(m[1] as EstadoCampana)) return null
  return { vuelve_a: m[1] as EnMarcha, hito: m[2] }
}

/**
 * dónde está la campaña: con el calendario en marcha, su semana; planificando, la etapa.
 * La semana se cuenta como las filas del calendario (`fechaDeFila`): desde el LUNES de la semana del día 1, y nunca pasa de la última.
 */
export function hitoDeLaCampana(c: Pick<Campana, 'estado' | 'fecha_inicio' | 'fecha_fin'> & Partial<Pick<Campana, 'semanas_de_tanda'>>, ahora: string): string {
  if (c.estado === 'abierta' || c.estado === 'estrategia') return 'en la etapa de estrategia'
  if (c.estado === 'calendario') return 'armando el calendario'
  const hoy = ahora.slice(0, 10)
  if (!esFechaIso(c.fecha_inicio) || !esFechaIso(hoy)) return 'en el calendario'
  if (diasEntre(c.fecha_inicio, hoy) < 0) return 'antes de la semana 1 del calendario'
  const semana = Math.floor(diasEntre(lunesDe(c.fecha_inicio), hoy) / 7) + 1
  return `en la semana ${Math.min(medidaDeCampana(c).totalSemanas, semana)} del calendario`
}

/** el motivo en pocas palabras, para la línea roja (el detalle va en las alertas) */
export function motivoBreve(motivo: string | null | undefined): string {
  const t = String(motivo ?? '').trim()
  if (/presupuesto de planificación se agotó/i.test(t)) return 'se acabó la bolsa de planificación'
  if (/presupuesto del lector/i.test(t)) return 'se acabó la bolsa del lector'
  if (/pasaron 7 días en necesita_humano/i.test(t)) return 'lleva 7 días esperándote'
  if (!t) return 'necesita que lo mires'
  const corto = t.split(/[(:·]/)[0].trim()
  return corto.length > 60 ? `${corto.slice(0, 57).trimEnd()}…` : corto
}

export type ColorDelFlujo = 'verde' | 'dorado' | 'rojo'
export interface FlujoDeCampana { color: ColorDelFlujo; linea: string; estado: EstadoCampana }

/** el botón, leído de la campaña · null = no hay flujo que mostrar (cerrada o reemplazada) */
export function flujoDeCampana(c: Pick<Campana, 'estado' | 'estado_motivo'>): FlujoDeCampana | null {
  if (enMarcha(c.estado)) return { color: 'verde', linea: 'EN MARCHA', estado: c.estado }
  if (c.estado === 'pausada') {
    const p = leerPausaDelTablero(c.estado_motivo)
    if (p) return { color: 'dorado', linea: `PARADO POR TI · ${p.hito}`, estado: c.estado }
  }
  if (c.estado === 'pausada' || c.estado === 'necesita_humano') return { color: 'rojo', linea: `DETENIDO · ${motivoBreve(c.estado_motivo)}`, estado: c.estado }
  return null
}

/**
 * Un paso que ya estaba corriendo cuando el tablero pausó TERMINA (el boceto: «el paso en curso termina; el siguiente no arranca»), pero no despausa la campaña:
 * en vez de moverla a `a`, deja anotado que al reanudar vuelve a `a` (con su hito). Devuelve la campaña así anotada, o null si no estaba pausada por el tablero
 * (y entonces quien llama sigue como siempre). Lo llaman los 3 lugares que mueven la campaña al terminar un paso: guardar la estrategia, guardar la primera tanda y que la jefatura pase.
 */
export async function anotarSiPausadaPorElTablero(al: Almacen, c: Campana, a: EnMarcha, ahora: string): Promise<Campana | null> {
  const actual = (await al.campana(c.id)) ?? c
  if (actual.estado !== 'pausada' || !leerPausaDelTablero(actual.estado_motivo)) return null
  return al.actualizarCampana(c.id, { estado_motivo: motivoDePausaDelTablero(a, hitoDeLaCampana({ ...actual, estado: a }, ahora)) })
}

/** la causa conocida que SIGUE impidiendo reanudar (hoy: la bolsa de planificación) · null = no se conoce ninguna que siga */
export async function causaQueSigue(al: Almacen, c: Campana): Promise<string | null> {
  if (/presupuesto de planificación se agotó/i.test(String(c.estado_motivo ?? ''))) {
    const { gastado, presupuesto } = await bolsaDelPaso(al, c, 'calendario')
    if (gastado + topeDelPaso('calendario') > presupuesto) return `la bolsa de planificación sigue sin alcanzar (US$ ${gastado.toFixed(2)} de ${presupuesto})`
  }
  return null
}

/** tras una detención, a qué estado se vuelve: lo que falte de la planificación, o `activa` si el calendario ya existe */
async function destinoTrasDetencion(al: Almacen, c: Campana): Promise<EnMarcha> {
  if ((await al.ultimaEstrategia(c.id))?.estado !== 'validada') return 'estrategia'
  const v = await al.ultimaVersionDeCalendario(c.id)
  if (v < 1 || !(await al.filas(c.id, v)).some((f) => f.estado !== 'esquema')) return 'calendario'
  return 'activa'
}

/** pasa la campaña a un estado en marcha: resuelve las esperas de la detención y, al quedar `activa`, el arranque corre como en `avanzar` */
async function ponerEnMarcha(al: Almacen, c: Campana, a: EnMarcha, ahora: string) {
  if (!transicionValida(c.estado, a)) throw new Error(`una campaña ${c.estado} no puede pasar a ${a}`)
  if (c.estado === 'necesita_humano') await resolverEsperas(al, c.id, 'necesita_humano')
  if (c.estado === 'pausada') await resolverEsperas(al, c.id, 'campana_pausada')
  const n = await al.actualizarCampana(c.id, { estado: a, estado_motivo: null })
  const arranque = a === 'activa' ? await arrancarAlActivar(al, n, ahora) : null
  return { campana: n, ...(arranque && arranque.arranque !== 'apagado' ? { arranque } : {}) }
}

/**
 * POST /api/cadena/campanas `{ accion: 'flujo', campana_id, quiero: 'parar' | 'reanudar' }` · desde el tablero (`workflow_id: 'tablero'`).
 * La respuesta trae siempre `flujo` (el botón como queda) para que la pantalla no tenga que adivinar.
 */
export async function flujoCampana(al: Almacen, cuerpo: Record<string, unknown>, ahora: string): Promise<Respuesta> {
  const id = cadena(cuerpo.campana_id), quiero = cadena(cuerpo.quiero)
  if (!id || (quiero !== 'parar' && quiero !== 'reanudar')) return err(400, 'E-CAMPOS', 'faltan campana_id o quiero («parar» o «reanudar»)')
  const c = await al.campana(id)
  if (!c) return err(404, 'E-CAMPANA', 'la campaña no existe')
  const noAut = await autorizarLlamada(al, cuerpo, c.client_id, { humano: true })
  if (noAut) return noAut
  const cerrada = await compuerta(al, c.client_id, c.seco)
  if (cerrada) return cerrada
  const antes = flujoDeCampana(c)
  if (!antes) return err(409, 'E-SIN-FLUJO', `una campaña ${c.estado} no tiene flujo que parar ni reanudar`)

  if (quiero === 'parar') {
    if (antes.color !== 'verde') return { status: 200, cuerpo: { ya_estaba: true, campana: c, flujo: antes } }
    if (!transicionValida(c.estado, 'pausada')) return err(409, 'E-TRANSICION', `una campaña ${c.estado} no puede pasar a pausada`)
    const n = await al.actualizarCampana(c.id, { estado: 'pausada', estado_motivo: motivoDePausaDelTablero(c.estado as EnMarcha, hitoDeLaCampana(c, ahora)) })
    await abrirEsperaDe(al, n, 'campana_pausada', n.id, 'campaña pausada desde el tablero', ahora, {}, `pausa:${n.id}:${ahora.slice(0, 10)}`)
    return { status: 200, cuerpo: { campana: n, flujo: flujoDeCampana(n) } }
  }

  if (antes.color === 'verde') return { status: 200, cuerpo: { ya_estaba: true, campana: c, flujo: antes } }
  if (antes.color === 'dorado') {
    const r = await ponerEnMarcha(al, c, leerPausaDelTablero(c.estado_motivo)!.vuelve_a, ahora)
    return { status: 200, cuerpo: { ...r, flujo: flujoDeCampana(r.campana) } }
  }
  // rojo: la causa conocida se revisa ANTES de tocar nada
  const causa = await causaQueSigue(al, c)
  if (causa) return err(409, 'E-CAUSA-SIGUE', causa, { campana: c, flujo: antes })
  const r = await ponerEnMarcha(al, c, await destinoTrasDetencion(al, c), ahora)
  return { status: 200, cuerpo: { ...r, flujo: flujoDeCampana(r.campana) } }
}
