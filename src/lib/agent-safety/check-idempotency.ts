/**
 * §150 G3 gate · checkIdempotency
 *
 * Dedupes replays of the same agent invocation within a configurable window.
 * Protects against n8n's transient-error retries charging the customer twice
 * for the same task.
 *
 * Spec · SPEC-PR-128-ADR-008-EXTENDED-SHADOW-MODE-v2.md §2.2
 *
 * IMPLEMENTATION STATUS · 🟡 STUB · contract + signature locked · body
 * pending PR build phase (post §144 sign-off). The stub returns
 * `would_reject=false` always so the spec can be merged + skeleton lands in
 * the repo without affecting prod behavior. Real implementation lifts the
 * pseudocode from the spec.
 *
 * Env toggles ·
 *   AGENT_SAFETY_IDEMPOTENCY_ENFORCE=1 → enforce (default "0" = shadow)
 *   AGENT_SAFETY_IDEMPOTENCY_WINDOW_SECONDS=600 → window (default 10 min)
 *
 * Required DB · `agent_safety_idempotency_seen` (migration spec §7.2).
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { GateDecision, InvocationContext } from './types'

export async function checkIdempotency(
  ctx: InvocationContext,
  _supabase: SupabaseClient,
): Promise<GateDecision> {
  const enforce = process.env.AGENT_SAFETY_IDEMPOTENCY_ENFORCE === '1'

  // STUB · spec §2.2 body pending build phase.
  // Real implementation will:
  //   1. Compute idempotency key (prefer ctx.request_id · fallback execution_id+agent+task hash)
  //   2. Atomic INSERT into agent_safety_idempotency_seen with ON CONFLICT DO NOTHING
  //   3. If conflict + within window → would_reject=true
  //   4. Else → would_reject=false (insert succeeded OR outside window → update seen_at)
  return {
    gate: 'check_idempotency',
    shadow_mode: !enforce,
    would_reject: false,
    enforced: false,
    metadata: {
      stub: true,
      ctx_request_id: ctx.request_id ?? null,
      ctx_execution_id: ctx.workflow_execution_id,
    },
  }
}
