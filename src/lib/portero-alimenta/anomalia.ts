/**
 * EL FRENO ANTE ANOMALÍA (28-oct · Emilio): en construcción el gasto normal NUNCA frena (el umbral de apagado pasa a ser solo aviso); lo que sí pausa a UN cliente es un ERROR, no el ahorro:
 *  · mucho gasto en poco tiempo (por omisión > US$ 10 en la última hora),
 *  · la misma llamada (mismo actor + misma entrada) repetida muchas veces seguidas (por omisión ≥ 8 en la última hora: un bucle de reintentos).
 * Los umbrales son DATO (`PORTERO_ANOMALIA_USD_HORA`, `PORTERO_ANOMALIA_REPETIDAS`). Solo lectura, US$ 0. En campaña no se usa (todo queda como estaba).
 */
import { COSTO_MAXIMO_POR_FUNCION } from './gasto'
import type { Db } from './clientes'

export interface UmbralesDeAnomalia { usd_por_hora: number; repetidas_por_hora: number }
export const ANOMALIA_POR_OMISION: UmbralesDeAnomalia = { usd_por_hora: 10, repetidas_por_hora: 8 }

const num = (t: string | undefined, min: number, defecto: number): number => { const n = Number(String(t ?? '').trim().replace(',', '.')); return t !== undefined && String(t).trim() !== '' && Number.isFinite(n) && n >= min ? n : defecto }
export const umbralesDeAnomaliaDelEntorno = (env: Record<string, string | undefined> = process.env): UmbralesDeAnomalia => ({
  usd_por_hora: num(env.PORTERO_ANOMALIA_USD_HORA, 0.01, ANOMALIA_POR_OMISION.usd_por_hora),
  repetidas_por_hora: Math.floor(num(env.PORTERO_ANOMALIA_REPETIDAS, 2, ANOMALIA_POR_OMISION.repetidas_por_hora)),
})

const estable = (x: unknown): string => {
  if (Array.isArray(x)) return `[${x.map(estable).join(',')}]`
  if (x && typeof x === 'object') return `{${Object.keys(x as object).sort().map((k) => `${JSON.stringify(k)}:${estable((x as Record<string, unknown>)[k])}`).join(',')}}`
  return JSON.stringify(x) ?? 'null'
}

type Fila = Record<string, unknown>
export interface Anomalia { motivo: string; tipo: 'gasto_por_hora' | 'llamada_repetida' }

/** PURO: de las llamadas a Apify y del modelo de la última hora, ¿hay anomalía? */
export function detectarAnomalia(o: { apify: Fila[]; modelo_usd: number }, u: UmbralesDeAnomalia): Anomalia | null {
  const cuentas = new Map<string, number>()
  let usd = o.modelo_usd
  for (const f of o.apify) {
    const fn = String(f.apify_function ?? '?')
    usd += COSTO_MAXIMO_POR_FUNCION[fn]?.usd ?? 0.05
    const k = `${fn}|${estable(f.params ?? null)}`
    cuentas.set(k, (cuentas.get(k) ?? 0) + 1)
  }
  for (const [k, n] of cuentas) if (n >= u.repetidas_por_hora) return { tipo: 'llamada_repetida', motivo: `la misma llamada a Apify (${k.split('|')[0]}, misma entrada) se repitió ${n} veces en la última hora (umbral ${u.repetidas_por_hora})` }
  if (usd > u.usd_por_hora) return { tipo: 'gasto_por_hora', motivo: `US$ ${usd.toFixed(2)} en la última hora (umbral US$ ${u.usd_por_hora.toFixed(2)})` }
  return null
}

/** lee la última hora de un cliente (solo lectura) y decide; un error de lectura se DICE (no se lee como «todo bien») */
export async function anomaliaDelCliente(db: Db, clientId: string, ahora: Date, u: UmbralesDeAnomalia): Promise<{ ok: true; anomalia: Anomalia | null } | { ok: false; detalle: string }> {
  const desde = new Date(ahora.getTime() - 3_600_000).toISOString()
  const a = await db.from('apify_raw').select('apify_function, params, created_at').eq('client_id', clientId).eq('ensayo', false).gte('created_at', desde).limit(1000)
  if (a.error) return { ok: false, detalle: `apify_raw: ${a.error.message}` }
  const m = await db.from('agent_invocations').select('cost_usd, created_at').eq('client_id', clientId).gte('created_at', desde).limit(1000)
  if (m.error) return { ok: false, detalle: `agent_invocations: ${m.error.message}` }
  const modelo = ((m.data ?? []) as Fila[]).reduce((s, f) => s + (Number(f.cost_usd) || 0), 0)
  return { ok: true, anomalia: detectarAnomalia({ apify: (a.data ?? []) as Fila[], modelo_usd: modelo }, u) }
}
