/**
 * §150 G6 gate · checkRateLimit
 *
 * Adapts v1 `checkRateLimitBuckets` middleware to the v2 GateDecision shape.
 * The DB schema (`rate_limit_buckets` + `rate_limit_bucket_hits` + RPC
 * `increment_bucket_atomic`) is unchanged from v1 · only the wrapper is new.
 *
 * Spec ·
 *   v1 body · SPEC-PR-128-ADR-008-EXTENDED-SHADOW-MODE.md §3.1
 *   v2 wrapper · SPEC-PR-128-ADR-008-EXTENDED-SHADOW-MODE-v2.md §2.3
 *
 * IMPLEMENTATION STATUS · 🟡 STUB · contract + signature locked · body
 * pending PR build phase. Real impl lifts v1 §3.1 verbatim + maps the
 * BucketCheckResult shape to GateDecision.
 *
 * Env toggle · feature flag global only ·
 *   RATE_LIMIT_BUCKETS_ENABLED=false → middleware fully disabled (fail-open)
 *
 * Per-bucket shadow mode is read from DB column `rate_limit_buckets.shadow_mode`.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { GateDecision, InvocationContext } from './types'

export async function checkRateLimit(
  ctx: InvocationContext,
  _supabase: SupabaseClient,
): Promise<GateDecision> {
  const enabled = process.env.RATE_LIMIT_BUCKETS_ENABLED !== 'false'
  if (!enabled) {
    return {
      gate: 'check_rate_limit',
      shadow_mode: true,
      would_reject: false,
      enforced: false,
      metadata: { feature_disabled: true },
    }
  }

  // STUB · spec §2.3 / v1 §3.1 body pending build phase.
  // Real implementation will:
  //   1. fetchApplicableBuckets(ctx)
  //   2. Sort by priority (per_tool > per_agent > per_workflow > per_client > global)
  //   3. For each bucket · atomic increment + exhausted check via RPC
  //   4. If exhausted AND !bucket.shadow_mode → enforced=true · execute abort_action
  //   5. If exhausted AND bucket.shadow_mode → would_reject=true, enforced=false
  //   6. Log to rate_limit_bucket_hits + audit row
  return {
    gate: 'check_rate_limit',
    shadow_mode: true,
    would_reject: false,
    enforced: false,
    metadata: { stub: true, ctx_agent_id: ctx.agent_id, ctx_workflow_id: ctx.workflow_id },
  }
}
