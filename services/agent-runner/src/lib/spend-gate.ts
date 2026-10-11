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
 *   - cap · `RUN_SPEND_CAP_USD` (número > 0) o $8 general; la ficha del cliente (`clients.config.spend_cap_usd`) puede BAJARLO, nunca subirlo
 *   - spend · SUM(cost_usd) by client_id over a 24h wall-clock window
 *
 * §148 safety-net · a query failure NEVER blocks legit traffic.
 */

const CAP_USD_DEFAULT = 8.0
const WINDOW_MS = 24 * 60 * 60 * 1000

export interface SpendGateResult {
  readonly blocked: boolean
  readonly reason: 'flag_off' | 'no_client' | 'under_cap' | 'over_cap' | 'query_error'
  readonly cap_usd?: number
  readonly spent_usd?: number
  /** el techo de la ficha, si bajó el general */
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
      eq(col: string, val: string): Filas<{ cost_usd?: number | string | null; config?: unknown }> & {
        gte(col: string, val: string): Filas<{ cost_usd?: number | string | null }>
      }
    }
  }
}

/**
 * Evaluate the §150 spend cap. Returns `{ blocked: true }` only when enforce is live
 * AND cumulative 24h spend of the client >= its cap (the general one, or its ficha's if lower).
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
    try {
      const f = await supabase.from('clients').select('config').eq('id', String(clientId))
      const delaFicha = f.error ? null : capDeLaFicha((f.data ?? [])[0]?.config)
      if (delaFicha !== null && delaFicha < cap) { cap = delaFicha; capFicha = delaFicha }
    } catch {
      // sin dato de la ficha rige el techo general
    }
    if (spent >= cap) return { blocked: true, reason: 'over_cap', cap_usd: cap, spent_usd: spent, ...(capFicha !== undefined ? { cap_ficha_usd: capFicha } : {}) }
    return { blocked: false, reason: 'under_cap', spent_usd: spent }
  } catch {
    return { blocked: false, reason: 'query_error' }
  }
}
