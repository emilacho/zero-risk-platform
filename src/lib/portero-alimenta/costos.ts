/**
 * COSTO POR CLIENTE Y UMBRAL GLOBAL EN PROPORCIÓN A LOS CLIENTES ACTIVOS (P4) · agnóstico.
 * Cada cliente cuesta ≈ US$ 0,6 al día (medido 16-oct); un umbral global fijo (US$ 5–10 al día) se pasa con ~10–17 clientes sin que nadie falle. El umbral global es
 * `base + por_cliente × clientes_activos` (DATO: `PORTERO_COSTO_GLOBAL_BASE_USD` y `PORTERO_COSTO_GLOBAL_POR_CLIENTE_USD`). Los umbrales POR cliente firmados (aviso > US$ 3, apaga > US$ 10) NO cambian.
 * El informe dice cuánto costó cada cliente hoy (Apify y modelo) y si pasó sus umbrales. Solo LEE. US$ 0, sin modelo.
 */
import type { Db } from './alimentar'
import { clientesActivos } from './clientes'
import { umbralesDeGastoDelEntorno } from './datos'
import { gastoDeHoy, type Respuesta } from './rutas'

export const COSTO_GLOBAL_BASE_POR_OMISION_USD = 5
export const COSTO_GLOBAL_POR_CLIENTE_POR_OMISION_USD = 1

const dato = (env: Record<string, string | undefined>, k: string, defecto: number): number => { const t = String(env[k] ?? '').trim().replace(',', '.'); const n = t === '' ? NaN : Number(t); return Number.isFinite(n) && n >= 0 && n <= 1000 ? n : defecto }
export const r2 = (n: number): number => Math.round(n * 100) / 100

/** el umbral global de hoy según cuántos clientes están activos */
export function umbralGlobalUsd(activos: number, env: Record<string, string | undefined> = process.env): { base_usd: number; por_cliente_usd: number; activos: number; umbral_usd: number } {
  const base = dato(env, 'PORTERO_COSTO_GLOBAL_BASE_USD', COSTO_GLOBAL_BASE_POR_OMISION_USD)
  const por = dato(env, 'PORTERO_COSTO_GLOBAL_POR_CLIENTE_USD', COSTO_GLOBAL_POR_CLIENTE_POR_OMISION_USD)
  return { base_usd: base, por_cliente_usd: por, activos, umbral_usd: r2(base + por * Math.max(0, activos)) }
}

export async function rutaCostos(deps: { db: Db; ahora?: Date; env?: Record<string, string | undefined> }): Promise<Respuesta> {
  const ahora = deps.ahora ?? new Date()
  const env = deps.env ?? process.env
  const act = await clientesActivos(deps.db)
  if (!act.ok) return { status: 502, body: { error: 'lectura_fallida', detalle: act.detalle } }
  const u = umbralesDeGastoDelEntorno(env)
  const clientes: Array<Record<string, unknown>> = []
  const fallas: string[] = []
  let total = 0
  for (const c of act.datos.clientes) {
    const g = await gastoDeHoy(deps.db, c.client_id, ahora)
    if (!g.ok) { fallas.push(`${c.nombre ?? c.client_id.slice(0, 8)}: ${g.detalle}`); clientes.push({ client_id: c.client_id, nombre: c.nombre, gasto_usd: null, estado: 'no_pude_leer' }); continue }
    const t = g.gasto.total_usd
    total += t
    clientes.push({ client_id: c.client_id, nombre: c.nombre, gasto_usd: r2(t), apify_usd: r2(g.gasto.apify_usd), modelo_usd: r2(g.gasto.modelo_usd), estado: t > u.apagar_usd ? 'pasa_el_umbral_de_apagado' : t > u.aviso_usd ? 'pasa_el_umbral_de_aviso' : 'normal' })
  }
  const g = umbralGlobalUsd(act.datos.clientes.length, env)
  clientes.sort((a, b) => (Number(b.gasto_usd) || 0) - (Number(a.gasto_usd) || 0))
  // los pedidos libres de hoy, anotados por la OFICINA que pidió (el gasto ya cuenta en cada cliente; esto dice quién lo pidió). Una falla de lectura se dice; no cambia nada de lo demás.
  const dia0 = new Date(ahora); dia0.setUTCHours(0, 0, 0, 0)
  const pe = await deps.db.from('cerebro_pedidos').select('pedido_por_oficina, costo_usd, estado').gte('creado_en', dia0.toISOString()).limit(1000)
  const porOficina = new Map<string, { pedidos: number; costo_usd: number }>()
  if (!pe.error) for (const p of (Array.isArray(pe.data) ? pe.data : []) as Array<Record<string, unknown>>) { const k = String(p.pedido_por_oficina ?? 'sin oficina'); const a = porOficina.get(k) ?? { pedidos: 0, costo_usd: 0 }; a.pedidos++; a.costo_usd += Number(p.costo_usd) || 0; porOficina.set(k, a) }
  const pedidosPorOficina = [...porOficina].map(([oficina, v]) => ({ oficina, pedidos: v.pedidos, costo_usd: Math.round(v.costo_usd * 1e6) / 1e6 })).sort((a, b) => b.costo_usd - a.costo_usd)
  return { status: fallas.length ? 502 : 200, body: { ok: fallas.length === 0, dia: ahora.toISOString().slice(0, 10), clientes_activos: act.datos.clientes.length, umbral_global: g, umbrales_por_cliente: u, total_del_portero_usd: r2(total), promedio_por_cliente_usd: act.datos.clientes.length ? r2(total / act.datos.clientes.length) : 0, sobre_el_umbral_global: total > g.umbral_usd, clientes, pedidos_por_oficina: pe.error ? null : pedidosPorOficina, ...(pe.error ? { pedidos_por_oficina_error: String(pe.error.message).slice(0, 120) } : {}), ...(fallas.length ? { fallas } : {}), modelos_llamados: 0 } }
}
