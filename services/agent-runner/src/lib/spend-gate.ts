/**
 * §150 spend gate · agent-runner (Railway) native /run-sdk handler · POR CLIENTE, sin ningún cliente nombrado.
 *
 * This is the THIRD (and deepest) agent-invocation door. The Vercel routes
 * `/api/agents/run-sdk` (#240) and `/api/agents/run` (#244) each got the gate,
 * but n8n workflows that hit the Railway agent-runner DIRECTLY (JOURNEY B
 * `RwUo7G2PmZNqyMbe` · smoke `y6H7nG3FGrmCGccP`) bypass both Vercel doors.
 * Gating here is the only place that covers EVERY caller (Vercel proxy AND
 * direct n8n) · mirrors the existing Sprint 8D workflow_id enforcement that
 * also lives server-side here for the same reason.
 *
 * The agent-runner is a separate package · it cannot import the Next app's
 * `@/lib/run-sdk-spend-gate`, so the rule is REPLICATED here. Keep in sync with it:
 *   - applies to EVERY client (no tenant list)
 *   - enforce · ON por omisión · se apaga SOLO con el interruptor explícito `RUN_SPEND_CAP_ENFORCE=false`
 *   - cap · `RUN_SPEND_CAP_USD` (número > 0) o $8 general; la ficha del cliente (`clients.config.spend_cap_usd`) MANDA: es el techo de ese cliente, sube o baja (30-oct)
 *   - CUPO DE ARRANQUE (opción A firmada por Emilio 20-oct): ficha `onboarding` dentro de sus primeros `RUN_ONBOARDING_DIAS` días (7) ⇒ el techo de 24 h es el MAYOR entre el general y `RUN_ONBOARDING_CAP_USD` (13); al pasar a `active` vuelve al general. Espejo de `techoGenericoDeArranque` en `src/lib/run-sdk-spend-gate.ts`
 *   - spend · SUM(cost_usd) by client_id over a 24h wall-clock window
 *
 * §148 safety-net · a query failure NEVER blocks legit traffic.
 */

const CAP_USD_DEFAULT = 8.0
const ONBOARDING_CAP_USD_DEFAULT = 13.0
const ONBOARDING_DIAS_DEFAULT = 7
const WINDOW_MS = 24 * 60 * 60 * 1000

export interface SpendGateResult {
  readonly blocked: boolean
  readonly reason: 'flag_off' | 'no_client' | 'under_cap' | 'over_cap' | 'query_error'
  readonly cap_usd?: number
  /** el techo de 24 h fue el CUPO DE ARRANQUE (ficha `onboarding` en sus primeros días) */
  readonly cupo_de_arranque?: boolean
  readonly spent_usd?: number
  /** el techo de la ficha, si difiere del general/arranque */
  readonly cap_ficha_usd?: number
}

/** ON salvo el interruptor explícito `RUN_SPEND_CAP_ENFORCE=false` */
export function isCapEnforced(): boolean {
  return process.env.RUN_SPEND_CAP_ENFORCE !== 'false'
}

export function resolveCapUsd(): number {
  const raw = process.env.RUN_SPEND_CAP_USD
  const n = raw != null && raw !== '' ? Number(raw) : NaN
  return Number.isFinite(n) && n > 0 ? n : CAP_USD_DEFAULT
}

/** Cupo de arranque · env `RUN_ONBOARDING_CAP_USD` (número > 0) > $13 */
export function resolveOnboardingCapUsd(): number {
  const raw = process.env.RUN_ONBOARDING_CAP_USD
  const n = raw != null && raw !== '' ? Number(raw) : NaN
  return Number.isFinite(n) && n > 0 ? n : ONBOARDING_CAP_USD_DEFAULT
}

/** Días desde la creación de la ficha en que rige el cupo · env `RUN_ONBOARDING_DIAS` (número > 0) > 7 */
export function resolveOnboardingDias(): number {
  const raw = process.env.RUN_ONBOARDING_DIAS
  const n = raw != null && raw !== '' ? Number(raw) : NaN
  return Number.isFinite(n) && n > 0 ? n : ONBOARDING_DIAS_DEFAULT
}

/** el techo de 24 h SIN contar el tope de la ficha: el general, o el cupo de arranque si la ficha está `onboarding` y dentro de sus primeros días. Nunca baja del general; sin dato ⇒ el general. */
export function techoDeArranque(o: { status: unknown; createdAt: unknown; nowMs: number; generico: number }): { cap: number; arranque: boolean } {
  if (o.status !== 'onboarding') return { cap: o.generico, arranque: false }
  const creada = typeof o.createdAt === 'string' ? Date.parse(o.createdAt) : NaN
  if (!Number.isFinite(creada)) return { cap: o.generico, arranque: false }
  const edad = o.nowMs - creada
  if (edad < 0 || edad > resolveOnboardingDias() * 24 * 60 * 60 * 1000) return { cap: o.generico, arranque: false }
  const cupo = resolveOnboardingCapUsd()
  return cupo > o.generico ? { cap: cupo, arranque: true } : { cap: o.generico, arranque: false }
}

/** el tope de la ficha (`config.spend_cap_usd`) si es un número > 0; si no, null */
export function capDeLaFicha(config: unknown): number | null {
  const v = config && typeof config === 'object' && !Array.isArray(config) ? (config as Record<string, unknown>).spend_cap_usd : undefined
  const n = typeof v === 'string' ? Number(v) : v
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : null
}

// Minimal structural type · matches supabase-js .from().select().eq() (thenable) and .eq().gte().
// `PromiseLike` (not Promise) so the real Supabase client is structurally assignable · supabase-js returns a
// PostgrestFilterBuilder which is a thenable but NOT a full Promise. `await` only needs `.then()`.
type Filas<T> = PromiseLike<{ data: T[] | null; error: unknown }>
export interface SupabaseLike {
  from(table: string): {
    select(cols: string): {
      eq(col: string, val: string): Filas<{ cost_usd?: number | string | null; config?: unknown; status?: unknown; created_at?: unknown }> & {
        gte(col: string, val: string): Filas<{ cost_usd?: number | string | null }>
      }
    }
  }
}

/**
 * Evaluate the §150 spend cap. Returns `{ blocked: true }` only when enforce is live
 * AND cumulative 24h spend of the client >= its cap (its ficha's when it has one, up or down; else the general one).
 */
export async function checkSpendCap(
  supabase: SupabaseLike,
  clientId: string | null | undefined,
  nowMs: number = Date.now(),
): Promise<SpendGateResult> {
  if (!isCapEnforced()) return { blocked: false, reason: 'flag_off' }
  if (!clientId) return { blocked: false, reason: 'no_client' }

  try {
    const floor = new Date(nowMs - WINDOW_MS).toISOString()
    const { data, error } = await supabase
      .from('agent_invocations')
      .select('cost_usd')
      .eq('client_id', String(clientId))
      .gte('started_at', floor)
    if (error) return { blocked: false, reason: 'query_error' }
    const spent = (data ?? []).reduce((acc, r) => {
      const v = r.cost_usd
      const n = typeof v === 'string' ? Number(v) : (v ?? 0)
      return acc + (Number.isFinite(n) ? Number(n) : 0)
    }, 0)
    let cap = resolveCapUsd()
    let capFicha: number | undefined
    let arranque = false
    try {
      const f = await supabase.from('clients').select('config,status,created_at').eq('id', String(clientId))
      const fila = f.error ? undefined : (f.data ?? [])[0]
      if (fila) {
        const t = techoDeArranque({ status: fila.status, createdAt: fila.created_at, nowMs, generico: cap })
        cap = t.cap; arranque = t.arranque
      }
      const delaFicha = f.error ? null : capDeLaFicha(fila?.config)
      if (delaFicha !== null && delaFicha !== cap) { cap = delaFicha; capFicha = delaFicha } // 30-oct · la ficha MANDA (sube o baja), mismo criterio que `techoDelCliente` de la plataforma
    } catch {
      // sin dato de la ficha rige el techo general
    }
    if (spent >= cap) return { blocked: true, reason: 'over_cap', cap_usd: cap, spent_usd: spent, ...(capFicha !== undefined ? { cap_ficha_usd: capFicha } : {}), ...(arranque && capFicha === undefined ? { cupo_de_arranque: true } : {}) }
    return { blocked: false, reason: 'under_cap', spent_usd: spent, ...(arranque ? { cupo_de_arranque: true } : {}) }
  } catch {
    return { blocked: false, reason: 'query_error' }
  }
}
