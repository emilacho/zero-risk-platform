/**
 * ¿QUEDA CRÉDITO DE APIFY ESTE MES? (10-nov · Lenovo por Emilio: «sí, construye el arreglo»). La pregunta que el flujo de Apify hace en su puerta ANTES de llamar a Apify.
 * Sin crédito, Apify rechaza toda corrida (403 «monthly usage limit») y cada pedido quedaba como una falla en Riesgos. Ahora la puerta contesta enseguida «sin crédito»,
 * el empleado lo declara («datos sin actualizar: crédito de Apify agotado») y la ejecución NO es una falla: la alarma es UNA, la línea de saldo de Riesgos (`saldo:apify`).
 * El criterio es el de Apify (crédito del mes agotado), NO el 90 % del portero: la firma de Emilio deja raspar a lo que no es el raspado diario mientras haya crédito.
 * Si la cuenta no se puede leer, la puerta deja pasar (como hasta hoy) y lo dice: una lectura caída no apaga el raspado.
 * EL TOPE (CC7 · 10-nov): Apify bloquea por el LÍMITE DE GASTO DEL MES (`limits.maxMonthlyUsageUsd`), que puede ser mayor que el crédito del plan. Se usa primero ese
 * límite y, solo si falta, el crédito del plan. Lector propio: el del portero (`leerUsoDelPlan`, que mide su 90 % sobre el crédito del plan) NO se toca.
 */

export const DATOS_SIN_ACTUALIZAR = 'datos sin actualizar: crédito de Apify agotado'

export interface RespuestaDeCredito {
  hay_credito: boolean
  leido: boolean
  usado_usd: number | null
  credito_usd: number | null
  /** de dónde salió `credito_usd`: el límite de gasto del mes (lo que bloquea) o, si falta, el crédito del plan */
  tope_de?: 'limite_del_mes' | 'credito_del_plan'
  hasta: string | null
  mensaje: string | null
  detalle?: string
}

/** lo que se lee de la cuenta: lo usado en el ciclo, el tope que bloquea y de dónde salió */
export interface UsoDelMes { usado_usd: number; credito_usd: number; ciclo_hasta: string | null; tope_de?: 'limite_del_mes' | 'credito_del_plan' }

const num = (x: unknown): number | null => (typeof x === 'number' && Number.isFinite(x) ? x : null)
const obj = (x: unknown): Record<string, unknown> => (typeof x === 'object' && x !== null && !Array.isArray(x) ? (x as Record<string, unknown>) : {})

/** el tope que bloquea: primero el límite de gasto del mes; solo si falta (o no es > 0), el crédito del plan */
export function topeDelMes(limiteDelMes: unknown, creditoDelPlan: unknown): { usd: number; de: 'limite_del_mes' | 'credito_del_plan' } | null {
  const l = num(limiteDelMes)
  if (l !== null && l > 0) return { usd: l, de: 'limite_del_mes' }
  const c = num(creditoDelPlan)
  return c !== null && c > 0 ? { usd: c, de: 'credito_del_plan' } : null
}

/** lee `/v2/users/me` (crédito del plan) y `/v2/users/me/limits` (límite, uso y ciclo): solo lectura, US$ 0 */
export async function leerUsoDelMes(o: { token?: string; fetchImpl?: (u: string, i?: RequestInit) => Promise<Response> } = {}): Promise<{ ok: true; uso: UsoDelMes } | { ok: false; detalle: string }> {
  const token = o.token ?? process.env.APIFY_API_TOKEN ?? process.env.APIFY_TOKEN ?? ''
  if (!token) return { ok: false, detalle: 'sin token de Apify' }
  const f = o.fetchImpl ?? ((u: string, i?: RequestInit) => fetch(u, i))
  try {
    const cab = { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15_000) }
    const [a, b] = await Promise.all([f('https://api.apify.com/v2/users/me', cab), f('https://api.apify.com/v2/users/me/limits', cab)])
    if (!a.ok || !b.ok) return { ok: false, detalle: `Apify respondió ${a.ok ? b.status : a.status}` }
    const me = obj(obj(await a.json()).data), lim = obj(obj(await b.json()).data)
    const tope = topeDelMes(obj(lim.limits).maxMonthlyUsageUsd, obj(me.plan).monthlyUsageCreditsUsd)
    const usado = num(obj(lim.current).monthlyUsageUsd)
    if (!tope || usado === null) return { ok: false, detalle: 'la cuenta no trae límite, crédito mensual o uso' }
    const ciclo = obj(lim.monthlyUsageCycle)
    return { ok: true, uso: { usado_usd: usado, credito_usd: tope.usd, tope_de: tope.de, ciclo_hasta: typeof ciclo.endAt === 'string' ? ciclo.endAt : null } }
  } catch (e) { return { ok: false, detalle: e instanceof Error ? e.message : String(e) } }
}

/** sin crédito = lo usado alcanzó el tope del mes (lo que hace que Apify bloquee) */
export function creditoDeApify(uso: UsoDelMes): RespuestaDeCredito {
  const hasta = uso.ciclo_hasta ? uso.ciclo_hasta.slice(0, 10) : null
  const hay = uso.usado_usd < uso.credito_usd
  return {
    hay_credito: hay,
    leido: true,
    usado_usd: uso.usado_usd,
    credito_usd: uso.credito_usd,
    ...(uso.tope_de ? { tope_de: uso.tope_de } : {}),
    hasta,
    mensaje: hay ? null : `${DATOS_SIN_ACTUALIZAR}${hasta ? ` hasta el ${hasta}` : ''}. No se llamó a Apify (US$ 0). Usa lo que ya sabes o lo guardado, y dilo en tu aporte.`,
  }
}

/** la cuenta no se pudo leer: se deja pasar, declarado */
export const creditoSinLeer = (detalle: string): RespuestaDeCredito => ({ hay_credito: true, leido: false, usado_usd: null, credito_usd: null, hasta: null, mensaje: null, detalle })
