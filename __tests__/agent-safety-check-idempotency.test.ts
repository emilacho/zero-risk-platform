/**
 * Tests · checkIdempotency gate (§150 G3)
 *
 * Spec · SPEC-PR-128-ADR-008-EXTENDED-SHADOW-MODE-v2.md §8.3
 *
 * Coverage ·
 *   - first call: would_reject=false · key inserted
 *   - replay within window: would_reject=true (shadow logs · no second insert)
 *   - replay outside window: updates seen_at · would_reject=false
 *   - no derivable key: fail-open (would_reject=false · reason set)
 *   - shadow vs enforce env toggle
 *   - computeIdempotencyKey priority (request_id > execution_id > workflow_id)
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  checkIdempotency,
  computeIdempotencyKey,
  type InvocationContext,
} from '../src/lib/agent-safety'

const ORIG_ENFORCE = process.env.AGENT_SAFETY_IDEMPOTENCY_ENFORCE
const ORIG_WINDOW = process.env.AGENT_SAFETY_IDEMPOTENCY_WINDOW_SECONDS

const baseCtx: InvocationContext = {
  workflow_id: 'wf_test',
  workflow_execution_id: 'exec_test',
  client_id: 'client_test',
  agent_id: 'jefe-marketing',
  task: 'Generar brief Q4',
  caller: 'n8n',
}

beforeEach(() => {
  delete process.env.AGENT_SAFETY_IDEMPOTENCY_ENFORCE
  delete process.env.AGENT_SAFETY_IDEMPOTENCY_WINDOW_SECONDS
})

afterEach(() => {
  if (ORIG_ENFORCE === undefined) delete process.env.AGENT_SAFETY_IDEMPOTENCY_ENFORCE
  else process.env.AGENT_SAFETY_IDEMPOTENCY_ENFORCE = ORIG_ENFORCE
  if (ORIG_WINDOW === undefined) delete process.env.AGENT_SAFETY_IDEMPOTENCY_WINDOW_SECONDS
  else process.env.AGENT_SAFETY_IDEMPOTENCY_WINDOW_SECONDS = ORIG_WINDOW
})

// ---------------------------------------------------------------------------
// computeIdempotencyKey · pure function
// ---------------------------------------------------------------------------

describe('computeIdempotencyKey · key derivation priority', () => {
  it('uses caller-supplied request_id when present (preferred)', () => {
    const ctx: InvocationContext = { ...baseCtx, request_id: 'req-uuid-123' }
    expect(computeIdempotencyKey(ctx)).toBe('req-uuid-123')
  })

  it('derives from workflow_execution_id when no request_id', () => {
    const ctx: InvocationContext = { ...baseCtx, request_id: undefined }
    const key = computeIdempotencyKey(ctx)
    expect(key).toBeTruthy()
    expect(key).not.toBe('req-uuid-123')
    expect(key?.length).toBe(64) // sha256 hex
  })

  it('derives from workflow_id when execution_id missing', () => {
    const ctx: InvocationContext = {
      ...baseCtx,
      request_id: undefined,
      workflow_execution_id: null,
    }
    const key = computeIdempotencyKey(ctx)
    expect(key).toBeTruthy()
    expect(key?.length).toBe(64)
  })

  it('returns null when no derivable key (no request_id · no execution_id · no workflow_id)', () => {
    const ctx: InvocationContext = {
      ...baseCtx,
      request_id: undefined,
      workflow_execution_id: null,
      workflow_id: null,
    }
    expect(computeIdempotencyKey(ctx)).toBeNull()
  })

  it('same ctx produces same key (deterministic)', () => {
    const ctx: InvocationContext = { ...baseCtx, request_id: undefined }
    expect(computeIdempotencyKey(ctx)).toBe(computeIdempotencyKey(ctx))
  })

  it('trims whitespace request_id (fallback to derivation if empty)', () => {
    const ctx: InvocationContext = { ...baseCtx, request_id: '   ' }
    const key = computeIdempotencyKey(ctx)
    expect(key).not.toBe('   ')
    expect(key?.length).toBe(64) // derived
  })
})

// ---------------------------------------------------------------------------
// checkIdempotency · IO with mocked Supabase client
// ---------------------------------------------------------------------------

function makeMockSupabase(seenMap: Map<string, string>) {
  // Minimal builder chain matching real @supabase/supabase-js shape used by the gate.
  const fromInsert = (table: string, payload: Record<string, unknown>) => {
    const key = payload.key as string
    if (table !== 'agent_safety_idempotency_seen') {
      return { select: () => ({ maybeSingle: async () => ({ data: { key }, error: null }) }) }
    }
    if (seenMap.has(key)) {
      return {
        select: () => ({
          maybeSingle: async () => ({ data: null, error: { code: '23505', message: 'unique violation' } }),
        }),
      }
    }
    seenMap.set(key, payload.seen_at as string)
    return { select: () => ({ maybeSingle: async () => ({ data: { key }, error: null }) }) }
  }

  const fromSelect = (table: string, eqKey: string) => {
    if (table !== 'agent_safety_idempotency_seen') return { data: null, error: null }
    const seen_at = seenMap.get(eqKey)
    return seen_at ? { data: { seen_at }, error: null } : { data: null, error: null }
  }

  const fromUpdate = (table: string, eqKey: string, payload: Record<string, unknown>) => {
    if (table !== 'agent_safety_idempotency_seen') return { data: null, error: null }
    seenMap.set(eqKey, payload.seen_at as string)
    return { data: { key: eqKey }, error: null }
  }

  return {
    from(table: string) {
      return {
        insert(payload: Record<string, unknown>) {
          return fromInsert(table, payload)
        },
        update(payload: Record<string, unknown>) {
          return {
            eq(_col: string, val: string) {
              return Promise.resolve(fromUpdate(table, val, payload))
            },
          }
        },
        select(_cols: string) {
          return {
            eq(_col: string, val: string) {
              return { maybeSingle: async () => fromSelect(table, val) }
            },
          }
        },
      }
    },
  } as unknown as Parameters<typeof checkIdempotency>[1]
}

describe('checkIdempotency · gate behavior', () => {
  it('first call · would_reject=false · key inserted', async () => {
    const seen = new Map<string, string>()
    const supa = makeMockSupabase(seen)
    const d = await checkIdempotency({ ...baseCtx, request_id: 'first-call-1' }, supa)
    expect(d.would_reject).toBe(false)
    expect(d.enforced).toBe(false)
    expect(seen.has('first-call-1')).toBe(true)
    expect((d.metadata as Record<string, unknown>)?.first_sighting).toBe(true)
  })

  it('replay within window · would_reject=true · enforced=false in shadow', async () => {
    const seen = new Map<string, string>()
    seen.set('replay-key-1', new Date().toISOString())
    const supa = makeMockSupabase(seen)
    const d = await checkIdempotency({ ...baseCtx, request_id: 'replay-key-1' }, supa)
    expect(d.would_reject).toBe(true)
    expect(d.enforced).toBe(false) // shadow by default
    expect(d.reason).toContain('Duplicate invocation')
  })

  it('replay within window · enforced=true when AGENT_SAFETY_IDEMPOTENCY_ENFORCE=1', async () => {
    process.env.AGENT_SAFETY_IDEMPOTENCY_ENFORCE = '1'
    const seen = new Map<string, string>()
    seen.set('replay-key-enforced', new Date().toISOString())
    const supa = makeMockSupabase(seen)
    const d = await checkIdempotency({ ...baseCtx, request_id: 'replay-key-enforced' }, supa)
    expect(d.would_reject).toBe(true)
    expect(d.enforced).toBe(true)
  })

  it('replay OUTSIDE window · refreshes seen_at · would_reject=false', async () => {
    process.env.AGENT_SAFETY_IDEMPOTENCY_WINDOW_SECONDS = '60'
    const seen = new Map<string, string>()
    // 2 hours ago · well outside default 600s window
    const longAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
    seen.set('stale-key', longAgo)
    const supa = makeMockSupabase(seen)
    const d = await checkIdempotency({ ...baseCtx, request_id: 'stale-key' }, supa)
    expect(d.would_reject).toBe(false)
    expect((d.metadata as Record<string, unknown>)?.stale_replay_refreshed).toBe(true)
    // seen_at refreshed
    const refreshed = seen.get('stale-key')
    expect(new Date(refreshed!).getTime()).toBeGreaterThan(new Date(longAgo).getTime())
  })

  it('no derivable key · fail-open · would_reject=false · reason set', async () => {
    const seen = new Map<string, string>()
    const supa = makeMockSupabase(seen)
    const ctx: InvocationContext = {
      ...baseCtx,
      request_id: undefined,
      workflow_execution_id: null,
      workflow_id: null,
    }
    const d = await checkIdempotency(ctx, supa)
    expect(d.would_reject).toBe(false)
    expect(d.enforced).toBe(false)
    expect(d.reason).toBe('idempotency_key_unavailable')
  })
})
