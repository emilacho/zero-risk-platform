/**
 * §150 spend gate · agent-runner (Railway) native /run-sdk handler.
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
 * `@/lib/sala-journey-dispatch`, so the §150 canon is REPLICATED here. Keep
 * in sync with `src/lib/sala-journey-dispatch/naufrago-cost-cap.ts`:
 *   - tenant set · Náufrago UUID + legacy 'naufrago' alias
 *   - enforce flag · SALA_NAUFRAGO_RUN_CAP_ENFORCE === 'true' (default-OFF)
 *   - cap · SALA_NAUFRAGO_CAP_USD env (positive number) else $5 default
 *   - spend · SUM(cost_usd) by client_id over a 24h wall-clock window
 *
 * §148 safety-net · a query failure NEVER blocks legit traffic.
 */

// Keep in sync with NAUFRAGO_TENANT_ID_UUID / NAUFRAGO_TENANT_ID_HINT.
const NAUFRAGO_TENANT_IDS = new Set<string>([
  'd69100b5-8ad7-4bb0-908c-68b5544065dc',
  'naufrago',
])
const NAUFRAGO_CAP_USD_DEFAULT = 5.0
const WINDOW_MS = 24 * 60 * 60 * 1000

export interface SpendGateResult {
  readonly blocked: boolean
  readonly reason:
    | 'flag_off'
    | 'no_client'
    | 'other_tenant'
    | 'under_cap'
    | 'over_cap'
    | 'query_error'
  readonly cap_usd?: number
  readonly spent_usd?: number
}

export function isNaufragoCapEnforced(): boolean {
  return process.env.SALA_NAUFRAGO_RUN_CAP_ENFORCE === 'true'
}

export function resolveNaufragoCapUsd(): number {
  const raw = process.env.SALA_NAUFRAGO_CAP_USD
  const n = raw != null && raw !== '' ? Number(raw) : NaN
  return Number.isFinite(n) && n > 0 ? n : NAUFRAGO_CAP_USD_DEFAULT
}

// Minimal structural type · matches supabase-js .from().select().eq().gte().
// `gte` is typed PromiseLike (not Promise) so the real Supabase client is
// structurally assignable · supabase-js returns a PostgrestFilterBuilder which
// is a thenable but NOT a full Promise (no catch/finally). `await` only needs
// `.then()`. Same pattern as agent-invocations-log.ts.
type SupabaseLike = {
  from(table: string): {
    select(cols: string): {
      eq(
        col: string,
        val: string,
      ): {
        gte(
          col: string,
          val: string,
        ): PromiseLike<{ data: Array<{ cost_usd?: number | string | null }> | null; error: unknown }>
      }
    }
  }
}

/**
 * Evaluate the §150 spend cap. Returns `{ blocked: true }` only when enforce
 * is live AND the client is the Náufrago tenant AND cumulative 24h spend >= cap.
 */
export async function checkSpendCap(
  supabase: SupabaseLike,
  clientId: string | null | undefined,
  nowMs: number = Date.now(),
): Promise<SpendGateResult> {
  if (!isNaufragoCapEnforced()) return { blocked: false, reason: 'flag_off' }
  if (!clientId) return { blocked: false, reason: 'no_client' }
  if (!NAUFRAGO_TENANT_IDS.has(String(clientId)))
    return { blocked: false, reason: 'other_tenant' }

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
    const cap = resolveNaufragoCapUsd()
    if (spent >= cap)
      return { blocked: true, reason: 'over_cap', cap_usd: cap, spent_usd: spent }
    return { blocked: false, reason: 'under_cap', spent_usd: spent }
  } catch {
    return { blocked: false, reason: 'query_error' }
  }
}
