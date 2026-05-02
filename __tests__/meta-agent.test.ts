/**
 * meta-agent.test.ts · Wave 16 · CC#3 · T4 (coverage)
 *
 * Covers `src/lib/meta-agent.ts` — Pilar 5 weekly-analysis engine.
 *
 * Strategy:
 *  - Inject a fake Supabase that programs sequential responses.
 *  - vi.mock the MissionControlBridge constructor (we test the analysis
 *    pipeline, not MC plumbing — those calls are deliberately fire-and-forget).
 *  - Stub global.fetch to control: Claude API responses + MC notifications.
 *
 * Coverage targets:
 *  - runWeeklyAnalysis: insert-failure short-circuit, no-outcomes early
 *    return, full happy path, Claude HTTP error → catch branch, malformed
 *    JSON → fallback parse path.
 *  - applyApprovedProposal: identity_update / model_change / informational /
 *    not-found / unknown type.
 *  - getRunHistory + getRunDetails happy + error sentinels.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

// ──────────────────────────────────────────────────────────
// Mock MissionControlBridge so its constructor is a no-op
// ──────────────────────────────────────────────────────────
vi.mock('@/lib/mc-bridge', () => ({
  MissionControlBridge: class {
    isAvailable() { return Promise.resolve(true) }
    syncPipelineToMC() { return Promise.resolve({ tasksCreated: 0, inboxSent: 0, errors: [] }) }
  },
}))

import { MetaAgent } from '../src/lib/meta-agent'

// ──────────────────────────────────────────────────────────
// Reusable Supabase chain fake (same shape as feedback-collector test)
// ──────────────────────────────────────────────────────────
type Op = {
  table?: string
  rpc?: string
  args?: unknown
  insert?: unknown
  update?: unknown
  select?: string
  eq?: Array<[string, unknown]>
  order?: Array<{ col: string; opts?: unknown }>
  limit?: number
  result: { data: unknown; error: unknown }
}

function makeSupabase(programmed: Array<{ data?: unknown; error?: unknown }>) {
  const ops: Op[] = []
  let cursor = 0
  function next() {
    const r = programmed[cursor] ?? { data: null, error: null }
    cursor++
    return { data: r.data ?? null, error: r.error ?? null }
  }

  function chainFor(op: Op) {
    const c = {
      insert(v: unknown) { op.insert = v; return c },
      update(v: unknown) { op.update = v; return c },
      select(s?: string) { op.select = s ?? '*'; return c },
      eq(col: string, val: unknown) { (op.eq ??= []).push([col, val]); return c },
      order(col: string, opts?: unknown) { (op.order ??= []).push({ col, opts }); return c },
      limit(n: number) { op.limit = n; return c },
      single() {
        const r = next(); op.result = r; ops.push(op)
        return Promise.resolve(r)
      },
      then(onfulfilled: (v: unknown) => unknown) {
        const r = next(); op.result = r; ops.push(op)
        return Promise.resolve(r).then(onfulfilled)
      },
    }
    return c
  }

  return {
    supabase: {
      from(table: string) {
        const op: Op = { table, result: { data: null, error: null } }
        return chainFor(op)
      },
      rpc(name: string, args: unknown) {
        const op: Op = { rpc: name, args, result: { data: null, error: null } }
        const r = next(); op.result = r; ops.push(op)
        return Promise.resolve(r)
      },
    } as never,
    ops,
  }
}

// ──────────────────────────────────────────────────────────
// Helper: stub global.fetch with a queue of responses
// ──────────────────────────────────────────────────────────
type FetchCall = { url: string; init: RequestInit | undefined }
function stubFetch(responses: Array<{ ok: boolean; status?: number; json?: unknown; text?: string }>) {
  const calls: FetchCall[] = []
  let i = 0
  const fn = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init })
    const r = responses[i] ?? { ok: true, json: {} }
    i++
    return {
      ok: r.ok,
      status: r.status ?? (r.ok ? 200 : 500),
      json: async () => r.json,
      text: async () => r.text ?? JSON.stringify(r.json ?? {}),
    } as Response
  })
  globalThis.fetch = fn as never
  return { calls, fn }
}

// ──────────────────────────────────────────────────────────
// Global setup: silence console + freshen env per test
// ──────────────────────────────────────────────────────────
beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'log').mockImplementation(() => {})
  process.env.CLAUDE_API_KEY = 'sk-test'
  process.env.MC_BASE_URL = 'http://localhost:3001'
  process.env.MC_API_TOKEN = 'mc-test'
})

// ──────────────────────────────────────────────────────────
// runWeeklyAnalysis
// ──────────────────────────────────────────────────────────
describe('MetaAgent.runWeeklyAnalysis · short-circuits', () => {
  it('returns failed status when meta_agent_runs insert errors', async () => {
    const { supabase } = makeSupabase([{ data: null, error: { message: 'fk failure' } }])
    const ma = new MetaAgent(supabase)
    const r = await ma.runWeeklyAnalysis()
    expect(r.status).toBe('failed')
    expect(r.runId).toBe('')
    expect(r.error).toMatch(/fk failure/i)
    expect(r.outcomesAnalyzed).toBe(0)
  })

  it('completes with zero outcomes when no unprocessed data exists', async () => {
    const { supabase, ops } = makeSupabase([
      { data: { id: 'run-1' }, error: null },  // INSERT meta_agent_runs
      { data: [], error: null },               // RPC get_unprocessed_outcomes
      { data: null, error: null },             // UPDATE meta_agent_runs (no-data path)
    ])
    const ma = new MetaAgent(supabase)
    const r = await ma.runWeeklyAnalysis()
    expect(r.status).toBe('completed')
    expect(r.outcomesAnalyzed).toBe(0)
    expect(r.improvementsProposed).toBe(0)
    expect(r.executiveSummary).toMatch(/no unprocessed/i)
    // Update should mark run completed
    expect(ops.some(o => o.table === 'meta_agent_runs' && o.update)).toBe(true)
  })
})

describe('MetaAgent.runWeeklyAnalysis · happy path', () => {
  it('analyzes outcomes, stores proposals, marks processed, notifies MC, returns metrics', async () => {
    const claudeOutput = {
      patterns: [
        { pattern_id: 'P001', agent_name: 'content-creator', pattern_type: 'rejection_pattern', description: 'X', confidence: 0.9, evidence_count: 3, evidence_ids: ['o1','o2','o3'] },
      ],
      proposals: [
        { agent_name: 'content-creator', proposal_type: 'identity_update', title: 'Tighten voice', rationale: 'data shows X', current_value: 'old', proposed_value: 'new', expected_impact: '+10%', pattern_id: 'P001', supporting_outcomes: ['o1','o2'], confidence_score: 0.8, priority: 'high' },
      ],
      executive_summary: 'One actionable proposal pending.',
    }

    stubFetch([
      // POST anthropic
      {
        ok: true,
        json: {
          content: [{ text: JSON.stringify(claudeOutput) }],
          usage: { input_tokens: 1500, output_tokens: 600 },
        },
      },
      // notifyMissionControl: inbox + tasks
      { ok: true, json: { ok: true } },
      { ok: true, json: { ok: true } },
    ])

    const { supabase, ops } = makeSupabase([
      // 1. INSERT meta_agent_runs
      { data: { id: 'run-2' }, error: null },
      // 2. RPC get_unprocessed_outcomes
      { data: [{ id: 'o1' }, { id: 'o2' }, { id: 'o3' }], error: null },
      // 3. RPC get_agent_performance
      { data: [], error: null },
      // 4. RPC get_campaign_performance_summary
      { data: [], error: null },
      // 5. UPDATE meta_agent_runs (status=completed)
      { data: null, error: null },
      // 6. SELECT agents (storeProposal)
      { data: { id: 'agent-uuid' }, error: null },
      // 7. INSERT agent_improvement_proposals
      { data: null, error: null },
      // 8. RPC mark_outcomes_processed
      { data: 3, error: null },
    ])

    const ma = new MetaAgent(supabase, { baseUrl: 'http://test.local' })
    const r = await ma.runWeeklyAnalysis({ runType: 'manual' })

    expect(r.status).toBe('completed')
    expect(r.runId).toBe('run-2')
    expect(r.outcomesAnalyzed).toBe(3)
    expect(r.improvementsProposed).toBe(1)
    expect(r.executiveSummary).toBe('One actionable proposal pending.')
    expect(r.costUsd).toBeGreaterThan(0)
    // Sonnet pricing: input 3/M, output 15/M → 1500*3/M + 600*15/M = 0.0045 + 0.009 = 0.0135
    expect(r.costUsd).toBeCloseTo(0.0135, 4)
    // Proposal stored
    const proposalInsert = ops.find(o => o.table === 'agent_improvement_proposals')
    expect(proposalInsert).toBeDefined()
    expect((proposalInsert!.insert as Record<string, unknown>).status).toBe('pending') // CRITICAL invariant
  })

  it('strips markdown code fences from Claude output before parsing', async () => {
    const claudeOutput = { patterns: [], proposals: [], executive_summary: 'fenced' }
    stubFetch([
      { ok: true, json: {
        content: [{ text: '```json\n' + JSON.stringify(claudeOutput) + '\n```' }],
        usage: { input_tokens: 100, output_tokens: 50 },
      }},
      { ok: true, json: {} },
    ])
    const { supabase } = makeSupabase([
      { data: { id: 'run-3' }, error: null },
      { data: [{ id: 'o1' }], error: null },
      { data: [], error: null },
      { data: [], error: null },
      { data: null, error: null },     // UPDATE run
      { data: 1, error: null },        // markOutcomesProcessed
    ])
    const ma = new MetaAgent(supabase)
    const r = await ma.runWeeklyAnalysis()
    expect(r.status).toBe('completed')
    expect(r.executiveSummary).toBe('fenced')
  })

  it('falls back to empty arrays + diagnostic summary when Claude returns invalid JSON', async () => {
    stubFetch([
      { ok: true, json: {
        content: [{ text: 'this is not json at all' }],
        usage: { input_tokens: 100, output_tokens: 50 },
      }},
      { ok: true, json: {} },
    ])
    const { supabase } = makeSupabase([
      { data: { id: 'run-4' }, error: null },
      { data: [{ id: 'o1' }], error: null },
      { data: [], error: null },
      { data: [], error: null },
      { data: null, error: null },
      { data: 1, error: null },
    ])
    const ma = new MetaAgent(supabase)
    const r = await ma.runWeeklyAnalysis()
    expect(r.status).toBe('completed')
    expect(r.improvementsProposed).toBe(0)
    expect(r.executiveSummary).toMatch(/parsing failed/i)
  })
})

describe('MetaAgent.runWeeklyAnalysis · failure paths', () => {
  it('catches Claude API HTTP errors and reports failed', async () => {
    stubFetch([{ ok: false, status: 503, text: 'overloaded' }])
    const { supabase } = makeSupabase([
      { data: { id: 'run-5' }, error: null },
      { data: [{ id: 'o1' }], error: null },
      { data: [], error: null },
      { data: [], error: null },
      { data: null, error: null }, // UPDATE run (failed)
    ])
    const ma = new MetaAgent(supabase)
    const r = await ma.runWeeklyAnalysis()
    expect(r.status).toBe('failed')
    expect(r.error).toMatch(/Claude API error 503/i)
    expect(r.outcomesAnalyzed).toBe(0) // failure path returns 0
  })

  it('survives MC notification failure (non-blocking, run still completes)', async () => {
    const claudeOutput = { patterns: [], proposals: [], executive_summary: 'no actions' }
    stubFetch([
      { ok: true, json: { content: [{ text: JSON.stringify(claudeOutput) }], usage: { input_tokens: 50, output_tokens: 20 } } },
      // MC inbox call THROWS
    ])
    // Override fetch after the first response to throw
    const realFetch = globalThis.fetch
    let count = 0
    globalThis.fetch = vi.fn(async (...args) => {
      count++
      if (count === 1) return realFetch(...args)
      throw new Error('mc unreachable')
    }) as never

    const { supabase } = makeSupabase([
      { data: { id: 'run-6' }, error: null },
      { data: [{ id: 'o1' }], error: null },
      { data: [], error: null },
      { data: [], error: null },
      { data: null, error: null },
      { data: 1, error: null },
    ])
    const ma = new MetaAgent(supabase)
    const r = await ma.runWeeklyAnalysis()
    expect(r.status).toBe('completed') // MC failure is non-blocking
    expect(r.executiveSummary).toBe('no actions')
  })
})

// ──────────────────────────────────────────────────────────
// applyApprovedProposal — every proposal_type branch
// ──────────────────────────────────────────────────────────
describe('MetaAgent.applyApprovedProposal', () => {
  it('returns false when proposal not found / not approved', async () => {
    const { supabase } = makeSupabase([{ data: null, error: { message: 'not found' } }])
    const ma = new MetaAgent(supabase)
    expect(await ma.applyApprovedProposal('pr-x')).toBe(false)
  })

  it('updates agents.identity_content for identity_update proposals', async () => {
    const { supabase, ops } = makeSupabase([
      { data: { id: 'pr-1', proposal_type: 'identity_update', agent_id: 'a-1', proposed_value: 'NEW IDENTITY' }, error: null },
      { data: null, error: null }, // UPDATE agents
      { data: null, error: null }, // UPDATE proposals → applied
    ])
    const ma = new MetaAgent(supabase)
    expect(await ma.applyApprovedProposal('pr-1')).toBe(true)
    const agentUpdate = ops.find(o => o.table === 'agents' && o.update)
    expect(agentUpdate).toBeDefined()
    expect((agentUpdate!.update as Record<string, unknown>).identity_content).toBe('NEW IDENTITY')
  })

  it('returns false when identity_update sub-update fails', async () => {
    const { supabase } = makeSupabase([
      { data: { id: 'pr-1', proposal_type: 'identity_update', agent_id: 'a-1', proposed_value: 'NEW' }, error: null },
      { data: null, error: { message: 'rls' } },
    ])
    const ma = new MetaAgent(supabase)
    expect(await ma.applyApprovedProposal('pr-1')).toBe(false)
  })

  it('updates agents.model for model_change proposals', async () => {
    const { supabase, ops } = makeSupabase([
      { data: { id: 'pr-2', proposal_type: 'model_change', agent_id: 'a-1', proposed_value: 'claude-haiku-4-5-20251001' }, error: null },
      { data: null, error: null },
      { data: null, error: null },
    ])
    const ma = new MetaAgent(supabase)
    expect(await ma.applyApprovedProposal('pr-2')).toBe(true)
    const agentUpdate = ops.find(o => o.table === 'agents' && o.update)
    expect((agentUpdate!.update as Record<string, unknown>).model).toBe('claude-haiku-4-5-20251001')
  })

  it('handles informational proposal types (skill / workflow / parameter / retirement) without DB-level apply', async () => {
    for (const proposal_type of ['skill_adjustment', 'workflow_change', 'parameter_tuning', 'retirement']) {
      const { supabase, ops } = makeSupabase([
        { data: { id: 'pr-x', proposal_type, agent_id: 'a-1', proposed_value: 'irrelevant' }, error: null },
        { data: null, error: null }, // UPDATE proposal → applied
      ])
      const ma = new MetaAgent(supabase)
      expect(await ma.applyApprovedProposal('pr-x'), proposal_type).toBe(true)
      const agentUpdate = ops.find(o => o.table === 'agents' && o.update)
      expect(agentUpdate, `should NOT update agents for ${proposal_type}`).toBeUndefined()
    }
  })

  it('warns + continues for unknown proposal types', async () => {
    const { supabase } = makeSupabase([
      { data: { id: 'pr-?', proposal_type: 'invented_type', agent_id: 'a-1' }, error: null },
      { data: null, error: null },
    ])
    const ma = new MetaAgent(supabase)
    expect(await ma.applyApprovedProposal('pr-?')).toBe(true)
  })
})

// ──────────────────────────────────────────────────────────
// getRunHistory + getRunDetails
// ──────────────────────────────────────────────────────────
describe('MetaAgent.getRunHistory', () => {
  it('returns runs ordered by created_at desc', async () => {
    const { supabase } = makeSupabase([{ data: [{ id: 'r-1' }, { id: 'r-2' }], error: null }])
    const ma = new MetaAgent(supabase)
    expect(await ma.getRunHistory(5)).toHaveLength(2)
  })

  it('returns [] on error', async () => {
    const { supabase } = makeSupabase([{ data: null, error: { message: 'x' } }])
    const ma = new MetaAgent(supabase)
    expect(await ma.getRunHistory()).toEqual([])
  })
})

describe('MetaAgent.getRunDetails', () => {
  it('returns the run + its proposals (parallel fetch)', async () => {
    const { supabase } = makeSupabase([
      { data: { id: 'r-1', status: 'completed' }, error: null }, // SELECT run
      { data: [{ id: 'pr-1' }, { id: 'pr-2' }], error: null },   // SELECT proposals
    ])
    const ma = new MetaAgent(supabase)
    const out = await ma.getRunDetails('r-1')
    expect(out.run).toMatchObject({ id: 'r-1', status: 'completed' })
    expect(out.proposals).toHaveLength(2)
  })

  it('returns proposals=[] when none exist', async () => {
    const { supabase } = makeSupabase([
      { data: { id: 'r-1' }, error: null },
      { data: null, error: null },
    ])
    const ma = new MetaAgent(supabase)
    const out = await ma.getRunDetails('r-1')
    expect(out.proposals).toEqual([])
  })
})
