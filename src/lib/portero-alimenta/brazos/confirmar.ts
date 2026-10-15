/**
 * CONFIRMAR LOS COMPETIDORES (una vez) · el dueño decide a quién se vigila. PURO + una función con base.
 * Escribe `clients.config.apify.competidores_confirmados = { en, por, nombres[] }` SIN pisar nada más de la config, y solo con nombres que ya están en `competitor_list`
 * (la lista del análisis del alta, que puede estar equivocada): un nombre que no está se rechaza y se dice. Vaciar la lista = dejar de vigilar. Máximo 5.
 */
import { normalizar } from '../../manual/texto'
import type { Db } from '../alimentar'
import { MAX_COMPETIDORES_VIGILADOS } from './competencia'

const obj = (x: unknown): Record<string, unknown> => (x && typeof x === 'object' && !Array.isArray(x) ? (x as Record<string, unknown>) : {})

export interface ResultadoDeConfirmar { config: Record<string, unknown>; confirmados: string[]; rechazados: Array<{ nombre: string; por_que: string }> }
export function confirmarCompetidores(config: unknown, pedidos: unknown, o: { ahora: Date; por: string }): ResultadoDeConfirmar {
  const cfg = obj(config)
  const ap = obj(cfg.apify)
  const lista = Array.isArray(ap.competitor_list) ? (ap.competitor_list as unknown[]).map(obj) : []
  const porNombre = new Map<string, string>()
  for (const c of lista) { const k = normalizar(c.name); if (k) porNombre.set(k, String(c.name)) }
  const confirmados: string[] = []
  const rechazados: ResultadoDeConfirmar['rechazados'] = []
  for (const n of Array.isArray(pedidos) ? pedidos : []) {
    const nombre = typeof n === 'string' ? n.trim() : ''
    if (!nombre) { rechazados.push({ nombre: String(n ?? '').slice(0, 60), por_que: 'no es un nombre' }); continue }
    const real = porNombre.get(normalizar(nombre))
    if (!real) { rechazados.push({ nombre: nombre.slice(0, 60), por_que: 'no está en la lista de competidores de la ficha (competitor_list)' }); continue }
    if (confirmados.includes(real)) continue
    if (confirmados.length >= MAX_COMPETIDORES_VIGILADOS) { rechazados.push({ nombre: nombre.slice(0, 60), por_que: `el máximo es ${MAX_COMPETIDORES_VIGILADOS} competidores vigilados` }); continue }
    confirmados.push(real)
  }
  return { config: { ...cfg, apify: { ...ap, competidores_confirmados: { en: o.ahora.toISOString(), por: o.por, nombres: confirmados } } }, confirmados, rechazados }
}

export async function guardarCompetidoresConfirmados(db: Db, clientId: string, pedidos: unknown, o: { ahora: Date; por: string; dry_run: boolean }): Promise<{ ok: boolean; estado: number; body: Record<string, unknown> }> {
  const l = await db.from('clients').select('id, config').eq('id', clientId).limit(1)
  if (l.error) return { ok: false, estado: 502, body: { error: 'lectura_fallida', detalle: `clients: ${l.error.message}` } }
  const fila = (Array.isArray(l.data) ? l.data : [])[0] as { config?: unknown } | undefined
  if (!fila) return { ok: false, estado: 404, body: { error: 'cliente_inexistente' } }
  const r = confirmarCompetidores(fila.config, pedidos, { ahora: o.ahora, por: o.por })
  if (!o.dry_run) {
    const w = await db.from('clients').update({ config: r.config }).eq('id', clientId)
    if (w.error) return { ok: false, estado: 502, body: { error: 'escritura_fallida', detalle: `clients: ${w.error.message}` } }
  }
  return { ok: true, estado: 200, body: { dry_run: o.dry_run, confirmados: r.confirmados, rechazados: r.rechazados, nota: r.confirmados.length ? 'desde la próxima corrida el brazo de competencia (si está encendido) los vigila, uno por día hábil' : 'lista vacía: ningún competidor se vigila' } }
}
