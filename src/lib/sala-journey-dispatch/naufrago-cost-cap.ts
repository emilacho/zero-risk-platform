/**
 * Canon canonical · Náufrago Phase 1 cost cap · Emilio §144 2026-06-05.
 *
 * Per-run cost ceiling for the Náufrago piloto's first ONBOARD
 * execution. Conservative on purpose · adjustable after we MEASURE
 * the real cost of the first run (canon §148 honest · no inventamos
 * el costo, lo medimos).
 *
 * Hierarchy of cost controls ·
 *   - G5 (this) · per-run cap · default USD 5.00 · alarm + halt
 *   - G5 (canon) · per-day alarm · USD 10.00 · alarm only (existing)
 *   - G6 frena-proof live · per-bucket cap atomic (existing · PR #159)
 *
 * §148 honest · this cap is SHADOW/READY · NOT enforced until §144
 * Emilio flips `SALA_NAUFRAGO_RUN_CAP_ENFORCE` to `"true"`. With the
 * flag OFF the cap value is observable (queryable for the dashboard +
 * audit) but NEVER blocks. Tests inject the enforce flag explicitly
 * to exercise both modes.
 *
 * Reversibility · flag flip off → cap inert · run executes regardless
 * of cost (subject to G6 bucket caps which stay enforce-live).
 */

/** Canon canonical · per-run cap for Náufrago piloto · USD 5.00.
 *  Decision Emilio §144 2026-06-05 · conservative for first run ·
 *  adjustable post-measurement. */
export const NAUFRAGO_PHASE1_RUN_CAP_USD = 5.0

/** Canon canonical · per-day alarm threshold · matches G5 canon (CLAUDE.md §150).
 *  This is INFORMATIONAL only · the actual G5 cron alert is in n8n
 *  Cost Alerts Cron 30min (workflow uw5Dri5S1XtcsKGm). */
export const NAUFRAGO_DAILY_ALERT_USD = 10.0

/** Canon canonical · the Náufrago tenant_id (single-tenant per canon V4 §2).
 *  Used by call-sites to decide whether the cap applies to a given
 *  decision/event. */
export const NAUFRAGO_TENANT_ID_HINT = 'naufrago'

export interface NaufragoCostCapInput {
  /** Force the enforce flag · overrides env. Tests use this. */
  readonly enforce?: boolean
  /** Override the cap value (USD) · tests use this. */
  readonly cap_usd?: number
  /** The tenant_id this evaluation applies to · the cap only enforces
   *  on the Náufrago tenant (other tenants pass through). */
  readonly tenant_id: string
  /** The cumulative cost spent so far in this run (USD). */
  readonly spent_usd: number
}

export type NaufragoCostCapResult =
  | { readonly verdict: 'pass'; readonly reason: 'flag_off' | 'other_tenant' | 'under_cap' }
  | {
      readonly verdict: 'block'
      readonly reason: 'over_cap'
      readonly cap_usd: number
      readonly spent_usd: number
    }

/** Canon canonical · whether the cap is enforce-live in this process.
 *  Default-OFF until §144 flip · canon §144 escalón 6 sibling. */
export function isNaufragoCapEnforced(input: { enforce?: boolean } = {}): boolean {
  if (input.enforce !== undefined) return input.enforce
  return process.env.SALA_NAUFRAGO_RUN_CAP_ENFORCE === 'true'
}

/** Canon canonical · evaluate the cap for a given run. Returns a
 *  typed result · callers map `block` to a budget_blocked decision
 *  OR a halt signal · `pass` means proceed. */
export function evaluateNaufragoRunCap(
  input: NaufragoCostCapInput,
): NaufragoCostCapResult {
  if (!isNaufragoCapEnforced({ enforce: input.enforce })) {
    return { verdict: 'pass', reason: 'flag_off' }
  }
  if (input.tenant_id !== NAUFRAGO_TENANT_ID_HINT) {
    return { verdict: 'pass', reason: 'other_tenant' }
  }
  const cap = input.cap_usd ?? NAUFRAGO_PHASE1_RUN_CAP_USD
  if (input.spent_usd >= cap) {
    return {
      verdict: 'block',
      reason: 'over_cap',
      cap_usd: cap,
      spent_usd: input.spent_usd,
    }
  }
  return { verdict: 'pass', reason: 'under_cap' }
}

/** Canon canonical · introspection helper · returns the current cap
 *  config snapshot · used by the dashboard + audit + the contract doc
 *  to confirm the value is wired. */
export function getNaufragoCapSnapshot() {
  return {
    cap_usd: NAUFRAGO_PHASE1_RUN_CAP_USD,
    daily_alert_usd: NAUFRAGO_DAILY_ALERT_USD,
    tenant_id_hint: NAUFRAGO_TENANT_ID_HINT,
    enforced: isNaufragoCapEnforced(),
    enforce_env_var: 'SALA_NAUFRAGO_RUN_CAP_ENFORCE',
    canon_source:
      'SEAM-CLOSE-modelb-shadow-2026-06-05.md · Tope de costo Náufrago',
  }
}
