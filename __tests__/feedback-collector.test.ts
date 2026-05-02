/**
 * feedback-collector.test.ts · Wave 16 · CC#3 · T2 (coverage)
 *
 * Covers `src/lib/feedback-collector.ts` — Pilar 5 outcome recorder. The class
 * is constructed with a Supabase client we fully fake (no @supabase/supabase-js
 * mocking needed since the dependency is injected).
 *
 * The fake exposes a chainable query builder that captures every call so we
 * can assert: the right table was hit, with the right shape, and that catch
 * branches return the documented sentinel values (null / false / [] / 0).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  FeedbackCollector,
  type OutcomeRecord,
  type CampaignResultRecord,
} from '../src/lib/feedback-collector'

// ──────────────────────────────────────────────────────────
// Chainable Supabase fake
// ──────────────────────────────────────────────────────────
type Op = {
  table?: string
  rpc?: string
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
  function nextResult() {
    const r = programmed[cursor] ?? { data: null, error: null }
    cursor++
    return { data: r.data ?? null, error: r.error ?? null }
  }

  function makeChain(op: Op) {
    const chain = {
      insert(v: unknown) { op.insert = v; return chain },
      update(v: unknown) { op.update = v; return chain },
      select(s?: string) { op.select = s ?? '*'; return chain },
      eq(col: string, val: unknown) { (op.eq ??= []).push([col, val]); return chain },
      order(col: string, opts?: unknown) { (op.order ??= []).push({ col, opts }); return chain },
      limit(n: number) { op.limit = n; return chain },
      single() {
        const r = nextResult()
        op.result = r
        ops.push(op)
        return Promise.resolve(r)
      },
      then(onfulfilled: (v: unknown) => unknown) {
        // Awaited without .single() → terminal call, supply next result
        const r = nextResult()
        op.result = r
        ops.push(op)
        return Promise.resolve(r).then(onfulfilled)
      },
    }
    return chain
  }

  const supabase = {
    from(table: string) {
      const op: Op = { table, result: { data: null, error: null } }
      return makeChain(op)
    },
    rpc(name: string, args: unknown) {
      const op: Op = { rpc: name, result: { data: null, error: null } }
      ;(op as Op & { args?: unknown }).args = args
      const r = nextResult()
      op.result = r
      ops.push(op)
      return Promise.resolve(r)
    },
  }

  return { supabase: supabase as never, ops }
}

// ──────────────────────────────────────────────────────────
// Suppress noisy console.error/warn from catch branches
// ──────────────────────────────────────────────────────────
beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

// ──────────────────────────────────────────────────────────
// Fixtures
// ──────────────────────────────────────────────────────────
function outcome(overrides: Partial<OutcomeRecord> = {}): OutcomeRecord {
  return {
    clientId: 'c-1',
    pipelineId: 'p-1',
    stepIndex: 2,
    stepName: 'CONTENT_GENERATION',
    agentName: 'content-creator',
    taskType: 'social_post',
    finalVerdict: 'approved',
    costUsd: 0.04,
    durationMs: 1200,
    tokensUsed: 5400,
    ...overrides,
  }
}

function campaign(overrides: Partial<CampaignResultRecord> = {}): CampaignResultRecord {
  return {
    clientId: 'c-1',
    pipelineId: 'p-1',
    contentType: 'social_post',
    channel: 'instagram',
    impressions: 10_000,
    clicks: 200,
    ctr: 0.02,
    ...overrides,
  }
}

// ──────────────────────────────────────────────────────────
// recordOutcome
// ──────────────────────────────────────────────────────────
describe('FeedbackCollector.recordOutcome', () => {
  it('inserts into agent_outcomes and returns the new row id', async () => {
    const { supabase, ops } = makeSupabase([{ data: { id: 'oc-1' }, error: null }])
    const fc = new FeedbackCollector(supabase)
    const id = await fc.recordOutcome(outcome())
    expect(id).toBe('oc-1')
    expect(ops[0].table).toBe('agent_outcomes')
    const inserted = ops[0].insert as Record<string, unknown>
    expect(inserted.client_id).toBe('c-1')
    expect(inserted.agent_name).toBe('content-creator')
    expect(inserted.final_verdict).toBe('approved')
  })

  it('truncates task_input and output_summary to 5000 chars', async () => {
    const { supabase, ops } = makeSupabase([{ data: { id: 'oc-2' }, error: null }])
    const fc = new FeedbackCollector(supabase)
    const long = 'x'.repeat(7000)
    await fc.recordOutcome(outcome({ taskInput: long, outputSummary: long }))
    const inserted = ops[0].insert as Record<string, unknown>
    expect((inserted.task_input as string).length).toBe(5000)
    expect((inserted.output_summary as string).length).toBe(5000)
  })

  it('returns null when supabase reports an error', async () => {
    const { supabase } = makeSupabase([{ data: null, error: { message: 'fk violation' } }])
    const fc = new FeedbackCollector(supabase)
    expect(await fc.recordOutcome(outcome())).toBeNull()
  })

  it('returns null on thrown exception (catch branch)', async () => {
    const supabase = {
      from() { throw new Error('boom') },
    } as never
    const fc = new FeedbackCollector(supabase)
    expect(await fc.recordOutcome(outcome())).toBeNull()
  })

  it('returns null when insert returns no row data', async () => {
    const { supabase } = makeSupabase([{ data: null, error: null }])
    const fc = new FeedbackCollector(supabase)
    expect(await fc.recordOutcome(outcome())).toBeNull()
  })
})

// ──────────────────────────────────────────────────────────
// recordStepOutcome (delegates to recordOutcome)
// ──────────────────────────────────────────────────────────
describe('FeedbackCollector.recordStepOutcome', () => {
  it('maps successful StepResult → approved verdict + truncates outputText to 2000', async () => {
    const { supabase, ops } = makeSupabase([{ data: { id: 'oc-3' }, error: null }])
    const fc = new FeedbackCollector(supabase)
    const big = 'y'.repeat(2500)
    const id = await fc.recordStepOutcome(
      'p-1', 0, 'BRIEF', 'campaign-brief',
      { success: true, outputText: big, costUsd: 0.01, durationMs: 800, inputTokens: 100, outputTokens: 200 } as never,
      'c-1',
    )
    expect(id).toBe('oc-3')
    const inserted = ops[0].insert as Record<string, unknown>
    expect(inserted.final_verdict).toBe('approved')
    expect(inserted.tokens_used).toBe(300)
    expect((inserted.output_summary as string).length).toBe(2000)
  })

  it('maps failed StepResult → rejected verdict', async () => {
    const { supabase, ops } = makeSupabase([{ data: { id: 'oc-4' }, error: null }])
    const fc = new FeedbackCollector(supabase)
    await fc.recordStepOutcome(
      'p-1', 0, 'BRIEF', 'campaign-brief',
      { success: false, outputText: 'err', costUsd: 0, durationMs: 0, inputTokens: 0, outputTokens: 0 } as never,
      'c-1',
    )
    expect((ops[0].insert as Record<string, unknown>).final_verdict).toBe('rejected')
  })
})

// ──────────────────────────────────────────────────────────
// recordHITLVerdict
// ──────────────────────────────────────────────────────────
describe('FeedbackCollector.recordHITLVerdict', () => {
  it('updates the existing outcome row when found', async () => {
    const { supabase, ops } = makeSupabase([
      { data: { id: 'oc-5' }, error: null }, // SELECT existing
      { data: null, error: null },           // UPDATE result
    ])
    const fc = new FeedbackCollector(supabase)
    const ok = await fc.recordHITLVerdict('p-1', 2, 'edited', 'tone too formal', 'replaced 1 sentence')
    expect(ok).toBe(true)
    expect(ops).toHaveLength(2)
    expect(ops[1].update).toMatchObject({
      final_verdict: 'edited',
      human_feedback: 'tone too formal',
      edited_delta: 'replaced 1 sentence',
    })
  })

  it('returns false when the update step errors', async () => {
    const { supabase } = makeSupabase([
      { data: { id: 'oc-6' }, error: null },
      { data: null, error: { message: 'update conflict' } },
    ])
    const fc = new FeedbackCollector(supabase)
    expect(await fc.recordHITLVerdict('p-1', 2, 'rejected')).toBe(false)
  })

  it('falls back to creating a new outcome when no existing row is found', async () => {
    const { supabase, ops } = makeSupabase([
      { data: null, error: null },                                   // SELECT existing → none
      { data: { client_id: 'c-1' }, error: null },                  // SELECT pipeline.client_id
      { data: { step_name: 'STEP_X', agent_name: 'editor-en-jefe', cost_usd: 0.02, duration_ms: 500, input_tokens: 100, output_tokens: 50 }, error: null }, // SELECT step
      { data: { id: 'oc-new' }, error: null },                       // INSERT outcome
    ])
    const fc = new FeedbackCollector(supabase)
    const ok = await fc.recordHITLVerdict('p-1', 4, 'approved')
    expect(ok).toBe(true)
    // Last op should be INSERT into agent_outcomes
    const last = ops[ops.length - 1]
    expect(last.table).toBe('agent_outcomes')
    expect((last.insert as Record<string, unknown>).agent_name).toBe('editor-en-jefe')
  })

  it('returns false on exception (catch branch)', async () => {
    const supabase = { from() { throw new Error('db down') } } as never
    const fc = new FeedbackCollector(supabase)
    expect(await fc.recordHITLVerdict('p-1', 1, 'rejected')).toBe(false)
  })
})

// ──────────────────────────────────────────────────────────
// recordCampaignResults
// ──────────────────────────────────────────────────────────
describe('FeedbackCollector.recordCampaignResults', () => {
  it('inserts into campaign_results, then updates agent_outcomes performance_metrics', async () => {
    const { supabase, ops } = makeSupabase([
      { data: { id: 'cr-1' }, error: null }, // INSERT campaign_results
      { data: null, error: null },           // UPDATE agent_outcomes
    ])
    const fc = new FeedbackCollector(supabase)
    const id = await fc.recordCampaignResults(campaign({
      revenueAttributed: 1500, roas: 4.2, performanceGrade: 'A',
    }))
    expect(id).toBe('cr-1')
    expect(ops[0].table).toBe('campaign_results')
    const insertedCR = ops[0].insert as Record<string, unknown>
    expect(insertedCR.ctr).toBe(0.02)
    expect(insertedCR.performance_grade).toBe('A')

    expect(ops[1].table).toBe('agent_outcomes')
    expect(ops[1].update).toMatchObject({
      performance_metrics: expect.objectContaining({ impressions: 10000, clicks: 200, grade: 'A' }),
    })
  })

  it('returns null when the campaign_results insert errors', async () => {
    const { supabase } = makeSupabase([{ data: null, error: { message: 'unique violation' } }])
    const fc = new FeedbackCollector(supabase)
    expect(await fc.recordCampaignResults(campaign())).toBeNull()
  })

  it('returns null when the catch branch fires', async () => {
    const supabase = { from() { throw new Error('connection lost') } } as never
    const fc = new FeedbackCollector(supabase)
    expect(await fc.recordCampaignResults(campaign())).toBeNull()
  })

  it('coerces missing optional metrics to zero/null at insert time', async () => {
    const { supabase, ops } = makeSupabase([
      { data: { id: 'cr-2' }, error: null },
      { data: null, error: null },
    ])
    const fc = new FeedbackCollector(supabase)
    await fc.recordCampaignResults({
      clientId: 'c-1', pipelineId: 'p-2', contentType: 'email', channel: 'mailgun',
    })
    const inserted = ops[0].insert as Record<string, unknown>
    expect(inserted.impressions).toBe(0)
    expect(inserted.ctr).toBe(0)
    expect(inserted.cost_per_click).toBeNull()
    expect(inserted.roas).toBeNull()
    expect(inserted.performance_grade).toBeNull()
  })
})

// ──────────────────────────────────────────────────────────
// RPC-backed queries: getAgentScorecards / getUnprocessedOutcomes / getCampaignPerformance / markOutcomesProcessed
// ──────────────────────────────────────────────────────────
describe('FeedbackCollector.getAgentScorecards', () => {
  it('calls get_agent_performance RPC with computed since timestamp', async () => {
    const { supabase, ops } = makeSupabase([{ data: [{ agent_name: 'a' }], error: null }])
    const fc = new FeedbackCollector(supabase)
    const out = await fc.getAgentScorecards('content-creator', 14)
    expect(out).toEqual([{ agent_name: 'a' }])
    expect(ops[0].rpc).toBe('get_agent_performance')
    const args = (ops[0] as Op & { args?: Record<string, unknown> }).args!
    expect(args.p_agent_name).toBe('content-creator')
    expect(typeof args.p_since).toBe('string')
  })

  it('returns [] when the RPC errors', async () => {
    const { supabase } = makeSupabase([{ data: null, error: { message: 'oops' } }])
    const fc = new FeedbackCollector(supabase)
    expect(await fc.getAgentScorecards()).toEqual([])
  })
})

describe('FeedbackCollector.getUnprocessedOutcomes', () => {
  it('returns rows from get_unprocessed_outcomes', async () => {
    const { supabase } = makeSupabase([{ data: [{ id: 'oc-1' }], error: null }])
    const fc = new FeedbackCollector(supabase)
    expect(await fc.getUnprocessedOutcomes(50, 3)).toEqual([{ id: 'oc-1' }])
  })

  it('returns [] on RPC error', async () => {
    const { supabase } = makeSupabase([{ data: null, error: { message: 'x' } }])
    const fc = new FeedbackCollector(supabase)
    expect(await fc.getUnprocessedOutcomes()).toEqual([])
  })
})

describe('FeedbackCollector.getCampaignPerformance', () => {
  it('returns rows on success', async () => {
    const { supabase } = makeSupabase([{ data: [{ ctr: 0.01 }], error: null }])
    const fc = new FeedbackCollector(supabase)
    expect(await fc.getCampaignPerformance('c-1')).toEqual([{ ctr: 0.01 }])
  })

  it('returns [] on RPC error', async () => {
    const { supabase } = makeSupabase([{ data: null, error: { message: 'x' } }])
    const fc = new FeedbackCollector(supabase)
    expect(await fc.getCampaignPerformance()).toEqual([])
  })
})

describe('FeedbackCollector.markOutcomesProcessed', () => {
  it('returns count on success', async () => {
    const { supabase } = makeSupabase([{ data: 7, error: null }])
    const fc = new FeedbackCollector(supabase)
    expect(await fc.markOutcomesProcessed(['a', 'b'], 'run-1')).toBe(7)
  })

  it('returns 0 when RPC errors', async () => {
    const { supabase } = makeSupabase([{ data: null, error: { message: 'x' } }])
    const fc = new FeedbackCollector(supabase)
    expect(await fc.markOutcomesProcessed(['a'], 'run-1')).toBe(0)
  })
})

// ──────────────────────────────────────────────────────────
// Direct-table queries: getPipelineOutcomes / getPendingProposals
// ──────────────────────────────────────────────────────────
describe('FeedbackCollector.getPipelineOutcomes', () => {
  it('returns ordered rows for the pipeline', async () => {
    const { supabase } = makeSupabase([{ data: [{ step_index: 0 }, { step_index: 1 }], error: null }])
    const fc = new FeedbackCollector(supabase)
    expect(await fc.getPipelineOutcomes('p-1')).toHaveLength(2)
  })

  it('returns [] on error', async () => {
    const { supabase } = makeSupabase([{ data: null, error: { message: 'x' } }])
    const fc = new FeedbackCollector(supabase)
    expect(await fc.getPipelineOutcomes('p-1')).toEqual([])
  })
})

describe('FeedbackCollector.getPendingProposals', () => {
  it('returns proposals on success', async () => {
    const { supabase } = makeSupabase([{ data: [{ id: 'pr-1' }], error: null }])
    const fc = new FeedbackCollector(supabase)
    expect(await fc.getPendingProposals()).toEqual([{ id: 'pr-1' }])
  })

  it('returns [] on error', async () => {
    const { supabase } = makeSupabase([{ data: null, error: { message: 'x' } }])
    const fc = new FeedbackCollector(supabase)
    expect(await fc.getPendingProposals()).toEqual([])
  })
})

// ──────────────────────────────────────────────────────────
// resolveProposal
// ──────────────────────────────────────────────────────────
describe('FeedbackCollector.resolveProposal', () => {
  it('returns true when update succeeds (sets status, reviewer, timestamp)', async () => {
    const { supabase, ops } = makeSupabase([{ data: null, error: null }])
    const fc = new FeedbackCollector(supabase)
    const ok = await fc.resolveProposal('pr-1', 'approved', 'looks good')
    expect(ok).toBe(true)
    const upd = ops[0].update as Record<string, unknown>
    expect(upd.status).toBe('approved')
    expect(upd.reviewed_by).toBe('emilio')
    expect(upd.review_notes).toBe('looks good')
    expect(typeof upd.reviewed_at).toBe('string')
  })

  it('returns false on update error', async () => {
    const { supabase } = makeSupabase([{ data: null, error: { message: 'x' } }])
    const fc = new FeedbackCollector(supabase)
    expect(await fc.resolveProposal('pr-1', 'rejected')).toBe(false)
  })
})
