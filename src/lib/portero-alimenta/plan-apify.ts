/**
 * EL PLAN DE APIFY (28-oct · firma de Emilio): el plan (~US$ 29 al mes) se usa muy por debajo; hay que aprovecharlo SIN pasarse. Cada día el portero lee de la cuenta (solo lectura, US$ 0)
 * el crédito del mes y lo usado, y NO pasa de ~90 % del crédito (DATO: `PORTERO_APIFY_PLAN_MAX_PCT`). Si va a pasarse, frena el raspado y avisa UNA vez a #alertas (por ciclo). PURO salvo el lector.
 */
export const PCT_MAX_DEL_PLAN_POR_OMISION = 90

export interface UsoDelPlan { plan: string; credito_usd: number; usado_usd: number; ciclo_desde: string | null; ciclo_hasta: string | null }

const num = (x: unknown): number | null => (typeof x === 'number' && Number.isFinite(x) ? x : null)
const obj = (x: unknown): Record<string, unknown> => (typeof x === 'object' && x !== null && !Array.isArray(x) ? (x as Record<string, unknown>) : {})

/** porcentaje máximo del crédito del mes; un valor roto vuelve al 90 */
export function pctMaximoDelPlan(env: Record<string, string | undefined> = process.env): number {
  const t = String(env.PORTERO_APIFY_PLAN_MAX_PCT ?? '').trim().replace(',', '.')
  const n = t === '' ? NaN : Number(t)
  return Number.isFinite(n) && n >= 10 && n <= 100 ? n : PCT_MAX_DEL_PLAN_POR_OMISION
}

/** lee `/v2/users/me` (plan y crédito) y `/v2/users/me/limits` (uso y ciclo): solo lectura, no cuesta */
export async function leerUsoDelPlan(o: { token?: string; fetchImpl?: (u: string, i?: RequestInit) => Promise<Response> } = {}): Promise<{ ok: true; uso: UsoDelPlan } | { ok: false; detalle: string }> {
  const token = o.token ?? process.env.APIFY_API_TOKEN ?? process.env.APIFY_TOKEN ?? ''
  if (!token) return { ok: false, detalle: 'sin token de Apify' }
  const f = o.fetchImpl ?? ((u: string, i?: RequestInit) => fetch(u, i))
  try {
    const cab = { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15_000) }
    const [a, b] = await Promise.all([f('https://api.apify.com/v2/users/me', cab), f('https://api.apify.com/v2/users/me/limits', cab)])
    if (!a.ok || !b.ok) return { ok: false, detalle: `Apify respondió ${a.ok ? b.status : a.status}` }
    const me = obj(obj(await a.json()).data), lim = obj(obj(await b.json()).data)
    const plan = obj(me.plan), ciclo = obj(lim.monthlyUsageCycle), cur = obj(lim.current), lims = obj(lim.limits)
    const credito = num(plan.monthlyUsageCreditsUsd) ?? num(lims.maxMonthlyUsageUsd)
    const usado = num(cur.monthlyUsageUsd)
    if (credito === null || credito <= 0 || usado === null) return { ok: false, detalle: 'la cuenta no trae crédito mensual o uso' }
    return { ok: true, uso: { plan: String(plan.id ?? 'desconocido'), credito_usd: credito, usado_usd: usado, ciclo_desde: typeof ciclo.startAt === 'string' ? ciclo.startAt : null, ciclo_hasta: typeof ciclo.endAt === 'string' ? ciclo.endAt : null } }
  } catch (e) { return { ok: false, detalle: e instanceof Error ? e.message : String(e) } }
}

export interface DecisionDelPlan { permitido: boolean; pct_usado: number; pct_max: number; tope_usd: number; restante_usd: number; motivo: string | null }

/** ¿se puede seguir raspando? `proximoMaxUsd` = lo máximo que costaría lo que se va a pedir ahora (0 = solo mirar) */
export function decidirPlanApify(uso: UsoDelPlan, pctMax: number, proximoMaxUsd = 0): DecisionDelPlan {
  const tope = Math.round(uso.credito_usd * (pctMax / 100) * 100) / 100
  const restante = Math.round(Math.max(0, tope - uso.usado_usd) * 1e4) / 1e4
  const pct = Math.round((uso.usado_usd / uso.credito_usd) * 1000) / 10
  if (uso.usado_usd + Math.max(0, proximoMaxUsd) > tope) {
    return { permitido: false, pct_usado: pct, pct_max: pctMax, tope_usd: tope, restante_usd: restante, motivo: `el plan de Apify (${uso.plan}) lleva US$ ${uso.usado_usd.toFixed(2)} de US$ ${uso.credito_usd.toFixed(2)} (${pct} %): no cabe en el ${pctMax} % (US$ ${tope.toFixed(2)})${proximoMaxUsd > 0 ? ` con lo que se iba a pedir (hasta US$ ${proximoMaxUsd.toFixed(2)})` : ''}` }
  }
  return { permitido: true, pct_usado: pct, pct_max: pctMax, tope_usd: tope, restante_usd: restante, motivo: null }
}

/** la línea de #alertas: UNA por ciclo de facturación (la clave la fija el inicio del ciclo) */
export const lineaDePlanApify = (d: DecisionDelPlan, uso: UsoDelPlan): string =>
  `🟠 Portero del cerebro · plan de Apify al ${d.pct_usado} % del crédito del mes (US$ ${uso.usado_usd.toFixed(2)} de ${uso.credito_usd.toFixed(2)}; tope ${d.pct_max} %): el raspado se detuvo hasta el próximo ciclo${uso.ciclo_hasta ? ` (corta el ${uso.ciclo_hasta.slice(0, 10)})` : ''} · lo que ya está guardado sigue sirviendo`
export const claveDeAvisoDelPlan = (uso: UsoDelPlan): string => `plan-apify:${(uso.ciclo_desde ?? 'sin-ciclo').slice(0, 10)}`

type Fila = Record<string, unknown>
const vacia = (p: unknown, por_que: string): unknown => {
  if (!p || typeof p !== 'object' || Array.isArray(p)) return p
  const q = p as Fila
  const hechas = Array.isArray(q.hacer) ? (q.hacer as Fila[]) : []
  return { ...q, hacer: [], costo_maximo_del_plan_usd: 0, omitidas: [...(Array.isArray(q.omitidas) ? q.omitidas : []), ...hechas.map((a) => ({ fuente: String(a.fuente ?? a.funcion ?? 'accion'), por_que }))] }
}

/**
 * Si el plan de Apify no deja seguir, VACÍA todo lo que el cuerpo pediría a Apify (el plan del día, las acciones de la 2.ª tanda y de los artículos, el plan del diario por cliente) y lo DICE
 * en `omitidas` y en `plan_apify`. Lo que no pide Apify (modelo, lectura) no se toca. Devuelve el cuerpo igual si se puede seguir.
 */
export function frenarCuerpoPorPlan(body: Fila, decision: DecisionDelPlan): Fila {
  const meta = { plan_apify: { permitido: decision.permitido, pct_usado: decision.pct_usado, pct_max: decision.pct_max, tope_usd: decision.tope_usd, restante_usd: decision.restante_usd, motivo: decision.motivo } }
  if (decision.permitido) return { ...body, ...meta }
  const por_que = String(decision.motivo)
  const out: Fila = { ...body, ...meta }
  if ('plan' in body) out.plan = vacia(body.plan, por_que)
  if (Array.isArray(body.acciones)) { out.omitidas = [...(Array.isArray(body.omitidas) ? body.omitidas : []), ...(body.acciones as Fila[]).map((a) => ({ fuente: String(a.fuente ?? a.funcion ?? 'accion'), por_que }))]; out.acciones = [] }
  if (Array.isArray(body.clientes)) out.clientes = (body.clientes as Fila[]).map((c) => (c && typeof c === 'object' && 'plan' in c ? { ...c, plan: vacia(c.plan, por_que) } : c))
  return out
}

export interface DepsDelPlan {
  leer?: () => Promise<{ ok: true; uso: UsoDelPlan } | { ok: false; detalle: string }>
  env?: Record<string, string | undefined>
  /** UNA línea a #alertas con su clave (una por ciclo); ok solo si el canal confirmó */
  avisar?: (texto: string, clave?: string) => Promise<{ ok: boolean; detalle: string }>
  dry_run?: boolean
}

/**
 * La guarda de cada día: lee el plan, decide y, si hay que frenar, avisa UNA vez por ciclo (en seco no avisa). Si la cuenta no se puede leer NO frena (los demás topes siguen) pero lo DICE:
 * `{ leido: false }`. Devuelve la decisión (o null si no se pudo leer) y el uso.
 */
export async function revisarPlanApify(d: DepsDelPlan = {}): Promise<{ leido: true; uso: UsoDelPlan; decision: DecisionDelPlan; aviso?: { ok: boolean; detalle: string } } | { leido: false; detalle: string }> {
  const r = await (d.leer ?? (() => leerUsoDelPlan()))()
  if (!r.ok) return { leido: false, detalle: r.detalle }
  const decision = decidirPlanApify(r.uso, pctMaximoDelPlan(d.env ?? process.env))
  if (decision.permitido || d.dry_run === true || !d.avisar) return { leido: true, uso: r.uso, decision }
  const aviso = await d.avisar(lineaDePlanApify(decision, r.uso), claveDeAvisoDelPlan(r.uso)).catch((e: unknown) => ({ ok: false, detalle: e instanceof Error ? e.message : String(e) }))
  return { leido: true, uso: r.uso, decision, aviso }
}
