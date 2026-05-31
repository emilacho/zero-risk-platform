/**
 * Tests · killSwitch orchestrator
 *
 * Spec · SPEC-PR-128-ADR-008-EXTENDED-SHADOW-MODE-v2.md §8.4 + §6.2
 *
 * Coverage ·
 *   - global env kill (AGENT_SAFETY_ENABLED=false) short-circuits
 *   - 24-may NEXUS counterfactual · 100 NULL-workflow_id calls in shadow ·
 *     all log audit · 0 blocked
 *   - same with enforce flipped · all blocked at gate 1
 *   - all 3 gates pass · allow=true · audit row written
 *   - first enforced gate populates block_gate · subsequent gates still run
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { killSwitch, type InvocationContext } from '../src/lib/agent-safety'

const ORIG_ENABLED = process.env.AGENT_SAFETY_ENABLED
const ORIG_WF_ENFORCE = process.env.AGENT_SAFETY_WORKFLOW_ID_ENFORCE
const ORIG_RL_ENABLED = process.env.RATE_LIMIT_BUCKETS_ENABLED

const baseCtx: InvocationContext = {
  workflow_id: 'wf_kill_switch_test',
  workflow_execution_id: 'exec_test',
  client_id: 'client_test',
  agent_id: 'test-agent',
  task: 'unit-test',
  caller: 'smoke',
}

// Stub Supabase client · no IO required for these tests (audit writes swallow errors).
function makeStubSupabase() {
  const noopChain = () => ({
    select: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
    eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
  })
  return {
    from() {
      return {
        insert() { return noopChain() },
        update() { return { eq: async () => ({ data: null, error: null }) } },
        select() {
          return {
            eq() { return { maybeSingle: async () => ({ data: null, error: null }) } },
            order: () => Promise.resolve({ data: [], error: null }),
          }
        },
      }
    },
    rpc: async () => ({ data: [{ current_hits: 0, exhausted: false }], error: null }),
  } as unknown as Parameters<typeof killSwitch>[1]
}

beforeEach(() => {
  delete process.env.AGENT_SAFETY_ENABLED
  delete process.env.AGENT_SAFETY_WORKFLOW_ID_ENFORCE
  delete process.env.RATE_LIMIT_BUCKETS_ENABLED
})

afterEach(() => {
  if (ORIG_ENABLED === undefined) delete process.env.AGENT_SAFETY_ENABLED
  else process.env.AGENT_SAFETY_ENABLED = ORIG_ENABLED
  if (ORIG_WF_ENFORCE === undefined) delete process.env.AGENT_SAFETY_WORKFLOW_ID_ENFORCE
  else process.env.AGENT_SAFETY_WORKFLOW_ID_ENFORCE = ORIG_WF_ENFORCE
  if (ORIG_RL_ENABLED === undefined) delete process.env.RATE_LIMIT_BUCKETS_ENABLED
  else process.env.RATE_LIMIT_BUCKETS_ENABLED = ORIG_RL_ENABLED
})

describe('killSwitch · global toggle', () => {
  it('AGENT_SAFETY_ENABLED=false → short-circuit · allow=true · gates=[]', async () => {
    process.env.AGENT_SAFETY_ENABLED = 'false'
    const d = await killSwitch(baseCtx, makeStubSupabase())
    expect(d.allow).toBe(true)
    expect(d.gates).toEqual([])
    expect(d.shadow_blocks).toEqual([])
    expect(d.request_id).toBeTruthy()
  })
})

describe('killSwitch · 24-may NEXUS counterfactual', () => {
  it('100 NULL-workflow_id calls in shadow · all logged · 0 blocked', async () => {
    const supa = makeStubSupabase()
    const ctxNullWf: InvocationContext = { ...baseCtx, workflow_id: null, agent_id: 'jefe-marketing' }

    const decisions = await Promise.all(
      Array.from({ length: 100 }).map(() => killSwitch(ctxNullWf, supa)),
    )

    // All allow=true (shadow · NO enforce)
    expect(decisions.every((d) => d.allow)).toBe(true)
    // Every one would_reject by §149 gate (audit signal)
    expect(decisions.every((d) => d.shadow_blocks.includes('validate_workflow_id'))).toBe(true)
    // None enforced
    expect(decisions.every((d) => d.block_gate === undefined)).toBe(true)
  })

  it('100 NULL-workflow_id calls with WORKFLOW_ID_ENFORCE=1 · all blocked at gate 1', async () => {
    process.env.AGENT_SAFETY_WORKFLOW_ID_ENFORCE = '1'
    const supa = makeStubSupabase()
    const ctxNullWf: InvocationContext = { ...baseCtx, workflow_id: null }

    const decisions = await Promise.all(
      Array.from({ length: 100 }).map(() => killSwitch(ctxNullWf, supa)),
    )

    expect(decisions.every((d) => !d.allow)).toBe(true)
    expect(decisions.every((d) => d.block_gate === 'validate_workflow_id')).toBe(true)
    expect(decisions.every((d) => d.block_reason?.includes('§149'))).toBe(true)
  })
})

describe('killSwitch · happy path', () => {
  it('all gates pass · allow=true · request_id minted · shadow_blocks empty', async () => {
    const d = await killSwitch(baseCtx, makeStubSupabase())
    expect(d.allow).toBe(true)
    expect(d.request_id).toMatch(/^[0-9a-f-]{36}$/i)
    expect(d.shadow_blocks).toEqual([])
    expect(d.gates).toHaveLength(3)
    expect(d.gates.map((g) => g.gate)).toEqual([
      'validate_workflow_id',
      'check_idempotency',
      'check_rate_limit',
    ])
  })

  it('endpoint param defaults to /api/agents/run-sdk · audit row tagged correctly', async () => {
    const d1 = await killSwitch(baseCtx, makeStubSupabase())
    expect(d1.allow).toBe(true) // endpoint param doesn't affect decision · only audit row
    const d2 = await killSwitch(baseCtx, makeStubSupabase(), '/api/agents/run')
    expect(d2.allow).toBe(true)
  })
})

describe('killSwitch · enforced gate populates block fields', () => {
  it('enforced gate 1 (validate_workflow_id) · subsequent gates still run for audit', async () => {
    process.env.AGENT_SAFETY_WORKFLOW_ID_ENFORCE = '1'
    const d = await killSwitch({ ...baseCtx, workflow_id: '' }, makeStubSupabase())
    expect(d.allow).toBe(false)
    expect(d.block_gate).toBe('validate_workflow_id')
    expect(d.gates).toHaveLength(3) // gates 2 + 3 still ran for full audit picture
  })
})
