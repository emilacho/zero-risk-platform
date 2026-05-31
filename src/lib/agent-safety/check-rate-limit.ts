/**
 * §150 G6 gate · checkRateLimit
 *
 * Multi-grain rate-limit buckets (per_tool · per_agent · per_workflow ·
 * per_client · global). Each bucket has its own DB-driven shadow_mode flip
 * (column `rate_limit_buckets.shadow_mode`) so operators can promote one
 * bucket at a time without env redeploys.
 *
 * Spec ·
 *   v2 wrapper · SPEC-PR-128-ADR-008-EXTENDED-SHADOW-MODE-v2.md §2.3
 *   v1 body    · SPEC-PR-128-ADR-008-EXTENDED-SHADOW-MODE.md §3.1 (lifted)
 *
 * IMPLEMENTATION STATUS · 🟢 BUILD-PHASE · full body shipped · default
 * shadow per-bucket (DDL DEFAULT TRUE) · canon safe.
 *
 * Env toggle (global kill) ·
 *   RATE_LIMIT_BUCKETS_ENABLED=false → middleware fully disabled (fail-open)
 *
 * Required DB · `rate_limit_buckets` + `rate_limit_bucket_hits` + RPC
 * `increment_bucket_atomic` (migration 202605310003).
 *
 * Bucket priority order (lowest priority value first) ·
 *   per_tool → per_agent → per_workflow → per_client → global
 *
 * First exhausted bucket (in priority order) wins · gate returns its
 * shadow_mode + abort_action. Subsequent buckets are NOT evaluated · this
 * matches "first violation blocks" semantics and minimizes RPC calls.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { AbortAction, GateDecision, InvocationContext } from './types'

interface BucketRow {
  bucket_id: string
  grain: 'per_tool' | 'per_agent' | 'per_workflow' | 'per_client' | 'global'
  match_key: string | null
  window_seconds: number
  max_hits: number
  abort_action: AbortAction
  shadow_mode: boolean
  priority: number
}

function bucketWindowStart(now: Date, windowSeconds: number): Date {
  const ms = Math.floor(now.getTime() / (windowSeconds * 1000)) * (windowSeconds * 1000)
  return new Date(ms)
}

function bucketMatches(b: BucketRow, ctx: InvocationContext): boolean {
  switch (b.grain) {
    case 'global':
      return true
    case 'per_tool':
      return !!b.match_key && b.match_key === (ctx.tool_name ?? '')
    case 'per_agent':
      return !!b.match_key && b.match_key === ctx.agent_id
    case 'per_workflow':
      return !!b.match_key && b.match_key === (ctx.workflow_id ?? '')
    case 'per_client':
      return !!b.match_key && b.match_key === (ctx.client_id ?? '')
    default:
      return false
  }
}

export async function checkRateLimit(
  ctx: InvocationContext,
  supabase: SupabaseClient,
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

  // Fetch applicable buckets · ordered by priority ascending (lowest=highest pri).
  // Filter is broad · we evaluate match in app code to keep the query simple.
  const { data: buckets, error } = await supabase
    .from('rate_limit_buckets')
    .select('bucket_id, grain, match_key, window_seconds, max_hits, abort_action, shadow_mode, priority')
    .order('priority', { ascending: true })

  if (error || !buckets) {
    // Fail-open · NO bloquear prod por bug propio (canon §148).
    return {
      gate: 'check_rate_limit',
      shadow_mode: true,
      would_reject: false,
      enforced: false,
      reason: 'bucket_fetch_failed',
      metadata: { fetch_error: error?.message ?? 'unknown' },
    }
  }

  const applicable = (buckets as BucketRow[]).filter((b) => bucketMatches(b, ctx))
  if (applicable.length === 0) {
    return {
      gate: 'check_rate_limit',
      shadow_mode: true,
      would_reject: false,
      enforced: false,
      metadata: { applicable_buckets: 0 },
    }
  }

  const now = new Date()

  for (const bucket of applicable) {
    const windowStart = bucketWindowStart(now, bucket.window_seconds)

    const { data, error: rpcErr } = await supabase.rpc('increment_bucket_atomic', {
      p_bucket_id: bucket.bucket_id,
      p_window_start: windowStart.toISOString(),
      p_max_hits: bucket.max_hits,
    })

    if (rpcErr) {
      // Fail-open · log + continue to next bucket. Canon §148 prefer to allow + audit.
      console.warn('[agent-safety/check-rate-limit] RPC failed:', rpcErr.message, { bucket: bucket.bucket_id })
      continue
    }

    const row = Array.isArray(data) ? data[0] : data
    const currentHits = row?.current_hits ?? 0
    const exhausted = !!row?.exhausted

    if (exhausted) {
      return {
        gate: 'check_rate_limit',
        shadow_mode: bucket.shadow_mode,
        would_reject: true,
        enforced: !bucket.shadow_mode,
        reason: `Bucket ${bucket.bucket_id} exhausted (${currentHits}/${bucket.max_hits} in ${bucket.window_seconds}s window)`,
        bucket_id: bucket.bucket_id,
        abort_action: bucket.abort_action,
        metadata: {
          grain: bucket.grain,
          match_key: bucket.match_key,
          current_hits: currentHits,
          max_hits: bucket.max_hits,
          window_seconds: bucket.window_seconds,
          window_start: windowStart.toISOString(),
        },
      }
    }
  }

  // No bucket exhausted · pass.
  return {
    gate: 'check_rate_limit',
    shadow_mode: true,
    would_reject: false,
    enforced: false,
    metadata: { applicable_buckets: applicable.length, all_under_cap: true },
  }
}
