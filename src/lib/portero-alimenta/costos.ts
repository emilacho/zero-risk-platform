/**
 * COSTO POR CLIENTE Y UMBRAL GLOBAL EN PROPORCIÓN A LOS CLIENTES ACTIVOS (P4) · agnóstico.
 * Cada cliente cuesta ≈ US$ 0,6 al día (medido 16-oct); un umbral global fijo (US$ 5–10 al día) se pasa con ~10–17 clientes sin que nadie falle. El umbral global es
 * `base + por_cliente × clientes_activos` (DATO: `PORTERO_COSTO_GLOBAL_BASE_USD` y `PORTERO_COSTO_GLOBAL_POR_CLIENTE_USD`). Los umbrales POR cliente firmados (aviso > US$ 3, apaga > US$ 10) NO cambian.
 * El informe dice cuánto costó cada cliente hoy (Apify y modelo) y si pasó sus umbrales. Solo LEE. US$ 0, sin modelo.
 */
import type { Db } from './alimentar'
import { clientesActivos } from './clientes'
import { TOPE_DEL_PORTERO_USD, TOPE_DEL_PULIDO_APARTE_USD, umbralesDeGastoDelEntorno } from './datos'
import { TOPE_DIARIO_POR_CLIENTE_USD } from '../cerebro/diario/topes'
import { TOPE_DIARIO_DE_BRAZOS_USD } from './brazos'
import { TOPE_POR_OFICINA_Y_DIA_USD, TOPE_POR_PEDIDO_USD } from './pedidos'
import { TOPE_DE_GASTO_POR_FOTO_USD } from '../cerebro/portero/etiquetar'
import { gastoDeHoy, type Respuesta } from './rutas'

export const COSTO_GLOBAL_BASE_POR_OMISION_USD = 5
export const COSTO_GLOBAL_POR_CLIENTE_POR_OMISION_USD = 1

const dato = (env: Record<string, string | undefined>, k: string, defecto: number): number => { const t = String(env[k] ?? '').trim().replace(',', '.'); const n = t === '' ? NaN : Number(t); return Number.isFinite(n) && n >= 0 && n <= 1000 ? n : defecto }
export const r2 = (n: number): number => Math.round(n * 100) / 100

/** TODOS los topes de gasto vigentes, con lo que mide cada uno: ninguno escondido. Los firmados por Emilio son el aviso y el apagado del portero (por cliente y día); el resto son topes de una pieza o de otro módulo y NO se suman a esos */
export function topesVigentes(u: { aviso_usd: number; apagar_usd: number }): Array<{ tope: string; usd: number; mide: string; firma: string; frena: boolean }> {
  return [
    { tope: 'portero · aviso', usd: u.aviso_usd, mide: 'gasto total del día del cliente en lo del portero (Apify + modelo)', firma: 'firmado (aviso > 3)', frena: false },
    { tope: 'portero · apagado', usd: u.apagar_usd, mide: 'el mismo gasto del día; pasarlo apaga el portero de ese cliente', firma: 'firmado (apaga > 10)', frena: true },
    { tope: 'portero · una corrida', usd: TOPE_DEL_PORTERO_USD, mide: 'antes de llamar a un modelo: el gasto de hoy + lo que va a costar no puede pasar de esto; si pasa, el paso se omite y se dice', firma: 'de la pieza', frena: true },
    { tope: 'pulido del resumen', usd: TOPE_DEL_PULIDO_APARTE_USD, mide: 'una llamada de pulido (una por día y cliente)', firma: 'de la pieza (calidad sobre precio, 16-oct)', frena: true },
    { tope: 'brazos por código', usd: TOPE_DIARIO_DE_BRAZOS_USD, mide: 'el modelo que usan los brazos de competencia por sede', firma: 'de la pieza', frena: true },
    { tope: 'diario · por cliente y día', usd: TOPE_DIARIO_POR_CLIENTE_USD, mide: 'SOLO el diario (raspado de la mañana + ampliación): se mide con estimaciones por función, NO con el gasto total del día del portero', firma: 'firmado (D-4)', frena: true },
    { tope: 'pedido libre de una oficina', usd: TOPE_POR_PEDIDO_USD, mide: 'un pedido (etiquetar fotos, pulido, cadena)', firma: 'firmado (encargo de pedidos)', frena: true },
    { tope: 'oficina por día', usd: TOPE_POR_OFICINA_Y_DIA_USD, mide: 'todos los pedidos de una oficina en el día', firma: 'de la pieza', frena: true },
    { tope: 'etiquetado de una foto', usd: TOPE_DE_GASTO_POR_FOTO_USD, mide: 'una llamada de etiquetado (cuesta ~0,008)', firma: 'de la pieza', frena: true },
  ]
}

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
  return { status: fallas.length ? 502 : 200, body: { ok: fallas.length === 0, dia: ahora.toISOString().slice(0, 10), clientes_activos: act.datos.clientes.length, umbral_global: g, umbrales_por_cliente: u, topes_vigentes: topesVigentes(u), total_del_portero_usd: r2(total), promedio_por_cliente_usd: act.datos.clientes.length ? r2(total / act.datos.clientes.length) : 0, sobre_el_umbral_global: total > g.umbral_usd, clientes, pedidos_por_oficina: pe.error ? null : pedidosPorOficina, ...(pe.error ? { pedidos_por_oficina_error: String(pe.error.message).slice(0, 120) } : {}), ...(fallas.length ? { fallas } : {}), modelos_llamados: 0 } }
}
