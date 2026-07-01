/**
 * §150 spend gate · REAL brake on the agent hot path.
 *
 * Diagnosis (CC#3 2026-06-30 · P0): the §150 cap only existed at the
 * sala-router-consumer dispatch (`dispatch.ts:234`) and as Slack alerts
 * (`cost-monitor-alert.ts`). `/api/agents/run-sdk` — the path EVERY agent
 * invocation flows through — had NO cap check, so spend ran past the cap
 * (today $19.43 · $10.30 Náufrago · cap $5) with only post-hoc alerts.
 *
 * This helper closes that gap: before invoking the model, sum the client's
 * cumulative cost in a wall-clock window and block when it crosses the cap.
 *
 * Canon alignment ·
 *   - Reuses the §150 cap machinery: `evaluateNaufragoRunCap` +
 *     `NAUFRAGO_TENANT_IDS` + `isNaufragoCapEnforced()` (the single canon
 *     switch · default-OFF until Emilio flips SALA_NAUFRAGO_RUN_CAP_ENFORCE).
 *   - Spend = SUM(cost_usd) by client_id over a 24h window · mirrors the
 *     cap-spend-query Strategy B (`tenant_window`). journey_id is never
 *     populated so per-journey scoping is impossible (see PR #216) ·
 *     cumulative-window is the realistic computable spend.
 *
 * §148 safety-net · a query failure NEVER blocks legit traffic (returns
 * not-blocked) · the cap is a backstop, not a single point of failure.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  evaluateNaufragoRunCap,
  isNaufragoCapEnforced,
  NAUFRAGO_TENANT_IDS,
} from '@/lib/sala-journey-dispatch'

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

/**
 * Evaluate the §150 spend cap for a run-sdk invocation. Returns
 * `{ blocked: true }` only when enforce is live AND the client is the
 * Náufrago tenant AND cumulative spend >= cap.
 */
export async function checkRunSdkSpendCap(
  supabase: SupabaseClient,
  clientId: string | null | undefined,
  nowMs: number = Date.now(),
): Promise<SpendGateResult> {
  // Canon switch · default-OFF (shadow) until Emilio flips the flag (§144).
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
    // §148 safety-net · query error must not block legit traffic.
    if (error) return { blocked: false, reason: 'query_error' }
    const spent = (data ?? []).reduce((acc, r) => {
      const v = (r as { cost_usd?: number | string | null }).cost_usd
      const n = typeof v === 'string' ? Number(v) : (v ?? 0)
      return acc + (Number.isFinite(n) ? Number(n) : 0)
    }, 0)

    // FIX 2026-07-01 (CC#4) · el cap ahora es CONFIGURABLE vía env var
    // SALA_NAUFRAGO_CAP_USD (antes hardcode $5 · ignoraba el env). Setear la
    // variable a N → cap $N. Si no está seteada o es inválida, fallback al
    // hardcode NAUFRAGO_PHASE1_RUN_CAP_USD (5.0) vía evaluateNaufragoRunCap.
    const capEnv = Number(process.env.SALA_NAUFRAGO_CAP_USD)
    const capOverride = Number.isFinite(capEnv) && capEnv > 0 ? capEnv : undefined
    const verdict = evaluateNaufragoRunCap({
      tenant_id: String(clientId),
      spent_usd: spent,
      enforce: true,
      cap_usd: capOverride,
    })
    if (verdict.verdict === 'block') {
      return {
        blocked: true,
        reason: 'over_cap',
        cap_usd: verdict.cap_usd,
        spent_usd: verdict.spent_usd,
      }
    }
    return { blocked: false, reason: 'under_cap', spent_usd: spent }
  } catch {
    return { blocked: false, reason: 'query_error' }
  }
}
