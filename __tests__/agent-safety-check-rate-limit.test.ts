/**
 * Tests · checkRateLimit gate (§150 G6)
 *
 * Spec · SPEC-PR-128-ADR-008-EXTENDED-SHADOW-MODE-v2.md §2.3 + §8.5
 *
 * Coverage ·
 *   - RATE_LIMIT_BUCKETS_ENABLED=false → feature_disabled · fail-open
 *   - no applicable buckets → would_reject=false · fail-open
 *   - bucket fetch error → would_reject=false · fail-open (canon §148)
 *   - exhausted bucket in shadow_mode → would_reject=true · enforced=false
 *   - exhausted bucket out of shadow → would_reject=true · enforced=true
 *   - priority order respected (lower priority value evaluated first)
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { checkRateLimit, type InvocationContext } from '../src/lib/agent-safety'

const ORIG_ENABLED = process.env.RATE_LIMIT_BUCKETS_ENABLED

const baseCtx: InvocationContext = {
  workflow_id: 'wf_rl_test',
  workflow_execution_id: 'exec',
  client_id: 'client_rl',
  agent_id: 'jefe-marketing',
  task: 't',
  caller: 'n8n',
}

interface MockBucket {
  bucket_id: string
  grain: 'per_tool' | 'per_agent' | 'per_workflow' | 'per_client' | 'global'
  match_key: string | null
  window_seconds: number
  max_hits: number
  abort_action: string
  shadow_mode: boolean
  priority: number
}

function makeSupa(buckets: MockBucket[], rpcResults: Map<string, { current_hits: number; exhausted: boolean }>) {
  return {
    from(table: string) {
      if (table !== 'rate_limit_buckets') {
        return {
          select: () => ({ order: async () => ({ data: [], error: null }) }),
        }
      }
      return {
        select: () => ({
          order: async () => ({ data: buckets, error: null }),
        }),
      }
    },
    rpc: async (_fn: string, params: { p_bucket_id: string }) => {
      const result = rpcResults.get(params.p_bucket_id) ?? { current_hits: 0, exhausted: false }
      return { data: [result], error: null }
    },
  } as unknown as Parameters<typeof checkRateLimit>[1]
}

beforeEach(() => {
  delete process.env.RATE_LIMIT_BUCKETS_ENABLED
})

afterEach(() => {
  if (ORIG_ENABLED === undefined) delete process.env.RATE_LIMIT_BUCKETS_ENABLED
  else process.env.RATE_LIMIT_BUCKETS_ENABLED = ORIG_ENABLED
})

describe('checkRateLimit · feature toggle', () => {
  it('RATE_LIMIT_BUCKETS_ENABLED=false → feature_disabled · pass', async () => {
    process.env.RATE_LIMIT_BUCKETS_ENABLED = 'false'
    const supa = makeSupa([], new Map())
    const d = await checkRateLimit(baseCtx, supa)
    expect(d.would_reject).toBe(false)
    expect((d.metadata as Record<string, unknown>)?.feature_disabled).toBe(true)
  })

  it('no applicable buckets · pass (all_under_cap=undefined · applicable_buckets=0)', async () => {
    const supa = makeSupa([], new Map())
    const d = await checkRateLimit(baseCtx, supa)
    expect(d.would_reject).toBe(false)
    expect((d.metadata as Record<string, unknown>)?.applicable_buckets).toBe(0)
  })
})

describe('checkRateLimit · bucket evaluation', () => {
  it('global bucket NOT exhausted · pass (all_under_cap=true)', async () => {
    const buckets: MockBucket[] = [
      {
        bucket_id: 'global_hour',
        grain: 'global',
        match_key: null,
        window_seconds: 3600,
        max_hits: 1000,
        abort_action: 'rate_limit_kill',
        shadow_mode: true,
        priority: 1000,
      },
    ]
    const supa = makeSupa(buckets, new Map([['global_hour', { current_hits: 5, exhausted: false }]]))
    const d = await checkRateLimit(baseCtx, supa)
    expect(d.would_reject).toBe(false)
    expect((d.metadata as Record<string, unknown>)?.all_under_cap).toBe(true)
  })

  it('exhausted bucket in shadow_mode · would_reject=true · enforced=false', async () => {
    const buckets: MockBucket[] = [
      {
        bucket_id: 'per_workflow_nexus',
        grain: 'per_workflow',
        match_key: 'wf_rl_test',
        window_seconds: 3600,
        max_hits: 50,
        abort_action: 'circuit_break',
        shadow_mode: true,
        priority: 100,
      },
    ]
    const supa = makeSupa(buckets, new Map([['per_workflow_nexus', { current_hits: 50, exhausted: true }]]))
    const d = await checkRateLimit(baseCtx, supa)
    expect(d.would_reject).toBe(true)
    expect(d.enforced).toBe(false)
    expect(d.bucket_id).toBe('per_workflow_nexus')
    expect(d.abort_action).toBe('circuit_break')
    expect(d.reason).toContain('exhausted')
  })

  it('exhausted bucket out of shadow · enforced=true', async () => {
    const buckets: MockBucket[] = [
      {
        bucket_id: 'per_agent_jefe',
        grain: 'per_agent',
        match_key: 'jefe-marketing',
        window_seconds: 60,
        max_hits: 10,
        abort_action: 'pause_workflow',
        shadow_mode: false,
        priority: 50,
      },
    ]
    const supa = makeSupa(buckets, new Map([['per_agent_jefe', { current_hits: 11, exhausted: true }]]))
    const d = await checkRateLimit(baseCtx, supa)
    expect(d.would_reject).toBe(true)
    expect(d.enforced).toBe(true)
    expect(d.bucket_id).toBe('per_agent_jefe')
  })

  it('priority order respected · first exhausted bucket wins (subsequent NOT evaluated)', async () => {
    const buckets: MockBucket[] = [
      {
        bucket_id: 'per_agent_first',
        grain: 'per_agent',
        match_key: 'jefe-marketing',
        window_seconds: 60,
        max_hits: 10,
        abort_action: 'warn',
        shadow_mode: true,
        priority: 10, // lowest priority value = evaluated first
      },
      {
        bucket_id: 'global_second',
        grain: 'global',
        match_key: null,
        window_seconds: 3600,
        max_hits: 1000,
        abort_action: 'warn',
        shadow_mode: false,
        priority: 1000,
      },
    ]
    const rpcCalls: string[] = []
    const supa = {
      from() {
        return {
          select: () => ({
            order: async () => ({ data: buckets, error: null }),
          }),
        }
      },
      rpc: async (_fn: string, params: { p_bucket_id: string }) => {
        rpcCalls.push(params.p_bucket_id)
        if (params.p_bucket_id === 'per_agent_first') {
          return { data: [{ current_hits: 10, exhausted: true }], error: null }
        }
        return { data: [{ current_hits: 0, exhausted: false }], error: null }
      },
    } as unknown as Parameters<typeof checkRateLimit>[1]

    const d = await checkRateLimit(baseCtx, supa)
    expect(d.would_reject).toBe(true)
    expect(d.bucket_id).toBe('per_agent_first')
    // Short-circuit · second bucket NOT evaluated
    expect(rpcCalls).toEqual(['per_agent_first'])
  })

  it('bucket fetch error · fail-open (would_reject=false · reason=bucket_fetch_failed)', async () => {
    const supa = {
      from() {
        return {
          select: () => ({
            order: async () => ({ data: null, error: { message: 'connection refused' } }),
          }),
        }
      },
      rpc: async () => ({ data: null, error: null }),
    } as unknown as Parameters<typeof checkRateLimit>[1]
    const d = await checkRateLimit(baseCtx, supa)
    expect(d.would_reject).toBe(false)
    expect(d.enforced).toBe(false)
    expect(d.reason).toBe('bucket_fetch_failed')
  })
})
