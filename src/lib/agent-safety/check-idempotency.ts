/**
 * §150 G3 gate · checkIdempotency
 *
 * Dedupes replays of the same agent invocation within a configurable window.
 * Protects against n8n's transient-error retries charging the customer twice
 * for the same task.
 *
 * Spec · SPEC-PR-128-ADR-008-EXTENDED-SHADOW-MODE-v2.md §2.2
 *
 * IMPLEMENTATION STATUS · 🟢 BUILD-PHASE · full body shipped per spec §2.2.
 * Default env `AGENT_SAFETY_IDEMPOTENCY_ENFORCE=0` (shadow) · canon safe.
 *
 * Env toggles ·
 *   AGENT_SAFETY_IDEMPOTENCY_ENFORCE=1 → enforce (default "0" = shadow)
 *   AGENT_SAFETY_IDEMPOTENCY_WINDOW_SECONDS=600 → window seconds (default 10 min)
 *
 * Required DB · `agent_safety_idempotency_seen` (migration 202605310002).
 *
 * Key derivation policy (priority order) ·
 *   1. ctx.request_id (caller-supplied · preferred · UUID or stable hash)
 *   2. sha256(workflow_execution_id + ':' + agent_id + ':' + sha1(task[0..8000]))
 *   3. sha256(workflow_id + ':' + agent_id + ':' + sha1(task[0..8000]))
 *   4. Fallback · no key derivable · gate fails-open (would_reject=false)
 */
import { createHash } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { GateDecision, InvocationContext } from './types'

const WINDOW_SECONDS_DEFAULT = 600

function getWindowSeconds(): number {
  const raw = process.env.AGENT_SAFETY_IDEMPOTENCY_WINDOW_SECONDS
  if (!raw) return WINDOW_SECONDS_DEFAULT
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? n : WINDOW_SECONDS_DEFAULT
}

function sha256Hex(input: string): string {
  return createHash('sha256').update(input).digest('hex')
}

function sha1Hex(input: string): string {
  return createHash('sha1').update(input).digest('hex')
}

export function computeIdempotencyKey(ctx: InvocationContext): string | null {
  const supplied = (ctx.request_id ?? '').trim()
  if (supplied.length > 0) return supplied

  const taskHash = sha1Hex((ctx.task ?? '').slice(0, 8000))
  if (ctx.workflow_execution_id) {
    return sha256Hex(`${ctx.workflow_execution_id}:${ctx.agent_id}:${taskHash}`)
  }
  if (ctx.workflow_id) {
    return sha256Hex(`${ctx.workflow_id}:${ctx.agent_id}:${taskHash}`)
  }
  return null
}

export async function checkIdempotency(
  ctx: InvocationContext,
  supabase: SupabaseClient,
): Promise<GateDecision> {
  const enforce = process.env.AGENT_SAFETY_IDEMPOTENCY_ENFORCE === '1'
  const windowSeconds = getWindowSeconds()
  const key = computeIdempotencyKey(ctx)

  if (!key) {
    // No stable key derivable · fail-open · log canon §148.
    return {
      gate: 'check_idempotency',
      shadow_mode: !enforce,
      would_reject: false,
      enforced: false,
      reason: 'idempotency_key_unavailable',
      metadata: { key_source: 'none' },
    }
  }

  // Atomic insert · if conflict (key already seen), it's a candidate replay.
  // We let Postgres own the race · then read seen_at to determine window-hit.
  const insertRes = await supabase
    .from('agent_safety_idempotency_seen')
    .insert({ key, ctx, seen_at: new Date().toISOString() })
    .select('key')
    .maybeSingle()

  const isReplay =
    (insertRes.error && insertRes.error.code === '23505') ||
    (!insertRes.data && !insertRes.error)

  if (!isReplay) {
    // First sighting · key inserted · pass.
    return {
      gate: 'check_idempotency',
      shadow_mode: !enforce,
      would_reject: false,
      enforced: false,
      metadata: { key, key_source: ctx.request_id ? 'request_id' : 'derived', first_sighting: true },
    }
  }

  // Candidate replay · check window via seen_at.
  const { data: existing } = await supabase
    .from('agent_safety_idempotency_seen')
    .select('seen_at')
    .eq('key', key)
    .maybeSingle()

  const seenAt = existing?.seen_at ? new Date(existing.seen_at).getTime() : 0
  const ageMs = Date.now() - seenAt
  const withinWindow = seenAt > 0 && ageMs < windowSeconds * 1000

  if (!withinWindow) {
    // Outside window · refresh seen_at + let it through (NOT a replay).
    await supabase
      .from('agent_safety_idempotency_seen')
      .update({ seen_at: new Date().toISOString(), ctx })
      .eq('key', key)
    return {
      gate: 'check_idempotency',
      shadow_mode: !enforce,
      would_reject: false,
      enforced: false,
      metadata: { key, key_source: ctx.request_id ? 'request_id' : 'derived', stale_replay_refreshed: true },
    }
  }

  // Within window · this IS a duplicate invocation.
  return {
    gate: 'check_idempotency',
    shadow_mode: !enforce,
    would_reject: true,
    enforced: enforce,
    reason: `Duplicate invocation detected within ${windowSeconds}s idempotency window`,
    metadata: {
      key,
      key_source: ctx.request_id ? 'request_id' : 'derived',
      replay_age_ms: ageMs,
      window_seconds: windowSeconds,
    },
  }
}
