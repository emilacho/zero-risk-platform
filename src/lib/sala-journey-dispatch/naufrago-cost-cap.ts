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

/** Canon canonical · per-run cap DEFAULT for Náufrago piloto · USD 5.00.
 *  Decision Emilio §144 2026-06-05 · conservative for first run.
 *  This is the FALLBACK · the live value is env-tunable via
 *  `SALA_NAUFRAGO_CAP_USD` (no redeploy of code to retune · §144 GO
 *  2026-06-30 raised effective cap to $30). */
export const NAUFRAGO_PHASE1_RUN_CAP_USD = 5.0

/** Canon canonical · resolve the live cap · `SALA_NAUFRAGO_CAP_USD` env
 *  override (positive finite number) else the default constant. Single
 *  source of truth read by both enforcement points (run-sdk gate +
 *  sala-router dispatch). */
export function resolveNaufragoCapUsd(): number {
  const raw = process.env.SALA_NAUFRAGO_CAP_USD
  const n = raw != null && raw !== '' ? Number(raw) : NaN
  return Number.isFinite(n) && n > 0 ? n : NAUFRAGO_PHASE1_RUN_CAP_USD
}

/** Canon canonical · per-day alarm threshold · matches G5 canon (CLAUDE.md §150).
 *  This is INFORMATIONAL only · the actual G5 cron alert is in n8n
 *  Cost Alerts Cron 30min (workflow uw5Dri5S1XtcsKGm). */
export const NAUFRAGO_DAILY_ALERT_USD = 10.0

/** Canon canonical · the Náufrago tenant_id (single-tenant per canon V4 §2).
 *  Used by call-sites to decide whether the cap applies to a given
 *  decision/event.
 *
 *  Phase 1.1 (2026-06-05 first-fire gap #2 fix · MANDATORY) ·
 *  the value is now the canonical UUID rather than the string
 *  literal `'naufrago'` · this matches `sala_event_log.tenant_id`
 *  (UUID column) so the cap actually engages when intake events
 *  carry the UUID tenant_id. The string `'naufrago'` is kept as an
 *  ALIAS for backwards-compat (admin scripts · ground-truth queries
 *  that filter by label) · canon §148 single source of truth.
 *
 *  Why client_id UUID == tenant_id UUID? · Náufrago is a single-tenant
 *  piloto (canon V4 §2 single-tenant explicit) · the client's UUID
 *  doubles as the tenant identifier. Future multi-tenant promotion
 *  swaps this constant for a dedicated tenant UUID. */
export const NAUFRAGO_TENANT_ID_UUID = 'd69100b5-8ad7-4bb0-908c-68b5544065dc'

/** Canon canonical · ALIAS for the legacy string label. Used by ground-
 *  truth queries + admin scripts. NOT used in runtime evaluation
 *  (evaluateNaufragoRunCap accepts both via the alias set below). */
export const NAUFRAGO_TENANT_ID_HINT = 'naufrago'

/** Canon canonical · the set of values that identify "this is the
 *  Náufrago piloto tenant" · the cap matches if `input.tenant_id`
 *  appears here. Allows both the canonical UUID AND the legacy
 *  string alias to engage the cap. */
export const NAUFRAGO_TENANT_IDS: ReadonlySet<string> = new Set([
  NAUFRAGO_TENANT_ID_UUID,
  NAUFRAGO_TENANT_ID_HINT,
])

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
  if (!NAUFRAGO_TENANT_IDS.has(input.tenant_id)) {
    return { verdict: 'pass', reason: 'other_tenant' }
  }
  const cap = input.cap_usd ?? resolveNaufragoCapUsd()
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
    cap_usd: resolveNaufragoCapUsd(),
    cap_usd_default: NAUFRAGO_PHASE1_RUN_CAP_USD,
    cap_env_var: 'SALA_NAUFRAGO_CAP_USD',
    daily_alert_usd: NAUFRAGO_DAILY_ALERT_USD,
    tenant_id_uuid: NAUFRAGO_TENANT_ID_UUID,
    tenant_id_hint: NAUFRAGO_TENANT_ID_HINT,
    tenant_ids_accepted: Array.from(NAUFRAGO_TENANT_IDS),
    enforced: isNaufragoCapEnforced(),
    enforce_env_var: 'SALA_NAUFRAGO_RUN_CAP_ENFORCE',
    canon_source:
      'SEAM-CLOSE-modelb-shadow-2026-06-05.md · Tope de costo Náufrago · Phase 1.1 (gap #2 fix) tenant UUID canon',
  }
}
