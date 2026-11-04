/**
 * LA VIGÍA DE ALERTAS DEL PORTERO (04-nov · firma de Emilio): toda alerta del portero se cierra SOLA cuando su causa se resuelve, con hora y motivo (una respuesta en su hilo de #alertas), para cualquier cliente.
 * Corre en el cron de cada 5 minutos junto a la vigía de pausas (solo lee la base y pregunta a n8n si el flujo está activo; US$ 0). Una alerta cuya causa NO se puede comprobar se deja abierta y se DICE.
 *  · `pausa-alta:<pausa>:<3h|24h>` → se cierra cuando esa pausa tiene `levantada_en`;
 *  · `pausa:<cliente>[+<cliente>]` → se cierra cuando ninguno de esos clientes tiene una pausa abierta;
 *  · `despertar-apagado:<flujo>` y `apagado:<flujo>` → se cierran cuando n8n dice que el flujo está ACTIVO;
 *  · `despertar-sin-pausa:<cliente>` → se cierra cuando la última corrida del cliente tiene el vigilante en paz.
 * Las demás claves (rechazos del índice, pasos abandonados, raspador…) siguen sus propias reglas: aquí no se tocan.
 */
import type { Db } from './alimentar'

type Fila = Record<string, unknown>
const lista = (x: unknown): Fila[] => (Array.isArray(x) ? (x as Fila[]) : [])
const txt = (x: unknown): string => (typeof x === 'string' ? x : '')
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export interface DepsDeLaVigiaDeAlertas {
  db: Db
  ahora: Date
  /** ¿está activo el flujo en n8n? (`estadoDelFlujoDelPortero`) */
  estadoDelFlujo?: (workflowId: string) => Promise<{ ok: true; activo: boolean } | { ok: false; detalle: string }>
  /** cierra el incidente con una respuesta en su hilo (`resolverIncidente`) */
  resolver: (clave: string, nota: string) => Promise<{ ok: boolean; detalle: string }>
}
export interface ResultadoDeLaVigiaDeAlertas { abiertas: number; cerradas: string[]; sostenidas: Array<{ clave: string; porque: string }>; errores: string[] }

/** devuelve el motivo de cierre si la causa ya se resolvió; `null` si sigue (con el porqué en `sostiene`); lanza si no se pudo comprobar */
async function causaResuelta(d: DepsDeLaVigiaDeAlertas, clave: string): Promise<{ cerrar: string } | { sostiene: string } | null> {
  const [tipo, ...resto] = clave.split(':')
  const arg = resto.join(':')
  if (tipo === 'pausa-alta') {
    const id = arg.split(':')[0]
    if (!UUID.test(id)) return null
    const q = await d.db.from('cerebro_portero_pausas').select('id, levantada_en').eq('id', id).limit(1)
    if (q.error) throw new Error(`cerebro_portero_pausas: ${q.error.message}`)
    const p = lista(q.data)[0]
    if (!p) return { cerrar: 'la pausa ya no existe' }
    return p.levantada_en ? { cerrar: `la pausa se cerró el ${txt(p.levantada_en).slice(0, 16)}` } : { sostiene: 'la pausa sigue abierta' }
  }
  if (tipo === 'pausa') {
    const ids = arg.split('+').filter((x) => UUID.test(x))
    if (!ids.length) return null
    const q = await d.db.from('cerebro_portero_pausas').select('client_id').in('client_id', ids).is('levantada_en', null).limit(20)
    if (q.error) throw new Error(`cerebro_portero_pausas: ${q.error.message}`)
    return lista(q.data).length ? { sostiene: 'hay una pausa abierta' } : { cerrar: 'ya no hay ninguna pausa abierta para ese cliente' }
  }
  if (tipo === 'despertar-apagado' || tipo === 'apagado') {
    if (!d.estadoDelFlujo) throw new Error('sin forma de preguntar a n8n por el flujo')
    const e = await d.estadoDelFlujo(arg)
    if (!e.ok) throw new Error(e.detalle)
    return e.activo ? { cerrar: `el flujo ${arg} está encendido` } : { sostiene: `el flujo ${arg} sigue apagado` }
  }
  if (tipo === 'despertar-sin-pausa') {
    if (!UUID.test(arg)) return null
    const q = await d.db.from('cerebro_portero_corridas').select('resumen, creado_en').eq('client_id', arg).order('creado_en', { ascending: false }).limit(1)
    if (q.error) throw new Error(`cerebro_portero_corridas: ${q.error.message}`)
    const r = lista(q.data)[0]?.resumen as { vigilante?: { ok?: boolean } } | undefined
    return r?.vigilante?.ok === true ? { cerrar: 'la última corrida del cliente tiene el vigilante en paz' } : { sostiene: 'el vigilante del cliente sigue con problemas' }
  }
  return null
}

export async function vigiarAlertasDelPortero(d: DepsDeLaVigiaDeAlertas): Promise<ResultadoDeLaVigiaDeAlertas> {
  const out: ResultadoDeLaVigiaDeAlertas = { abiertas: 0, cerradas: [], sostenidas: [], errores: [] }
  try {
    const q = await d.db.from('cerebro_alertas').select('clave').is('cerrado_en', null).limit(200)
    if (q.error) { out.errores.push(`cerebro_alertas: ${q.error.message}`); return out }
    const claves = lista(q.data).map((f) => txt(f.clave)).filter((c) => /^(pausa-alta|pausa|despertar-apagado|apagado|despertar-sin-pausa):/.test(c))
    out.abiertas = claves.length
    for (const clave of claves) {
      try {
        const v = await causaResuelta(d, clave)
        if (!v) continue
        if ('sostiene' in v) { out.sostenidas.push({ clave, porque: v.sostiene }); continue }
        const r = await d.resolver(clave, `${d.ahora.toISOString().slice(0, 16)}Z · causa resuelta: ${v.cerrar} (cerrada sola por la vigía)`)
        if (r.ok) out.cerradas.push(clave); else out.errores.push(`cerrar ${clave}: ${r.detalle}`)
      } catch (e) { out.errores.push(`${clave}: no pude comprobar la causa (${e instanceof Error ? e.message : String(e)}); queda abierta`) }
    }
  } catch (e) { out.errores.push(e instanceof Error ? e.message : String(e)) }
  return out
}
