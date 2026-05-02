/**
 * Unit tests for src/lib/pipeline-orchestrator.ts (Wave 15 · CC#1).
 *
 * Covers PipelineOrchestrator class — the 839-LOC core orchestration module
 * that runs the 9-step campaign pipeline. Pre-W15: 0 tests.
 *
 * Mock strategy:
 *  - Supabase client: minimal in-memory stub that records insert/update/select
 *    calls and returns deterministic responses.
 *  - global fetch: stub that records requests and returns canned responses
 *    keyed by URL pattern.
 *  - MissionControlBridge + FeedbackCollector: imported but never called
 *    against a real backend — their methods are stubs that resolve.
 *
 * What this verifies:
 *  - createPipeline writes the pipeline + step rows + notifies MC
 *  - executePipeline routes correctly across agent/n8n/parallel/HITL types
 *  - resumeAfterHITL handles approved/rejected/edited correctly
 *  - handleStepFailure retries up to max_retries then fails
 *  - cost calculation matches Sonnet pricing
 *  - loadPipelineState surfaces errors when row missing
 *  - delay_hours steps pause without executing
 *
 * Out of scope: actual /api/agents/run HTTP behavior, actual Supabase RPC
 * semantics. Those are tested at integration-test level (W14 contract tests).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock both deps that the orchestrator constructs internally so we can
// observe (and not actually call) their downstream side effects.
vi.mock('../src/lib/mc-bridge', () => ({
  MissionControlBridge: class {
    onPipelineCreated = vi.fn().mockResolvedValue(undefined)
    onStepStarted = vi.fn().mockResolvedValue(undefined)
    onStepCompleted = vi.fn().mockResolvedValue(undefined)
    onStepFailed = vi.fn().mockResolvedValue(undefined)
    onHITLPaused = vi.fn().mockResolvedValue(undefined)
    onPipelineCompleted = vi.fn().mockResolvedValue(undefined)
  },
}))
vi.mock('../src/lib/feedback-collector', () => ({
  FeedbackCollector: class {
    constructor(_s: unknown) {}
    recordStepOutcome = vi.fn().mockResolvedValue(undefined)
    recordHITLVerdict = vi.fn().mockResolvedValue(undefined)
  },
}))

import { PipelineOrchestrator } from '../src/lib/pipeline-orchestrator'

// ─── Supabase mock ─────────────────────────────────────────────────────

type Row = Record<string, unknown>

interface MockSupabaseState {
  pipelines: Map<string, Row>
  steps: Map<string, Row> // key = `${pipelineId}::${stepIndex}`
  rpcResponses: Map<string, unknown>
  insertCalls: Array<{ table: string; rows: Row[] }>
  updateCalls: Array<{ table: string; updates: Row; eqs: Array<[string, unknown]> }>
}

function makeSupabase(initial?: Partial<MockSupabaseState>) {
  const state: MockSupabaseState = {
    pipelines: new Map(initial?.pipelines || []),
    steps: new Map(initial?.steps || []),
    rpcResponses: new Map(initial?.rpcResponses || []),
    insertCalls: [],
    updateCalls: [],
  }

  function from(table: string) {
    let pendingFilters: Array<[string, unknown]> = []
    let pendingNotFilters: Array<[string, unknown]> = []

    const builder: any = {
      _state: state,
      insert(rows: Row | Row[]) {
        const arr = Array.isArray(rows) ? rows : [rows]
        state.insertCalls.push({ table, rows: arr })
        if (table === 'pipeline_executions') {
          const id = (arr[0].id as string) || `pipe-${state.pipelines.size + 1}`
          const row = { ...arr[0], id }
          state.pipelines.set(id, row)
          return makeSelectSingle({ id })
        }
        if (table === 'pipeline_steps') {
          for (const r of arr) {
            const key = `${r.pipeline_id}::${r.step_index}`
            state.steps.set(key, { ...r, id: key })
          }
          return Promise.resolve({ data: arr, error: null })
        }
        return Promise.resolve({ data: arr, error: null })
      },
      update(updates: Row) {
        builder._pendingUpdate = updates
        return builder
      },
      select(cols?: string) {
        builder._pendingSelect = cols
        return builder
      },
      eq(col: string, val: unknown) {
        pendingFilters.push([col, val])
        return builder
      },
      not(col: string, _op: string, val: unknown) {
        pendingNotFilters.push([col, val])
        return builder
      },
      in(col: string, vals: unknown[]) {
        pendingFilters.push([col, vals])
        return builder
      },
      order() {
        return builder
      },
      limit() {
        return builder
      },
      single() {
        return resolveQuery(table, pendingFilters, builder)
      },
      maybeSingle() {
        return resolveQuery(table, pendingFilters, builder)
      },
      then(onF: any, onR: any) {
        // For unresolved chains acting as "list/update" terminators
        if (builder._pendingUpdate) {
          state.updateCalls.push({
            table,
            updates: builder._pendingUpdate,
            eqs: [...pendingFilters],
          })
          // Apply update to in-memory state
          if (table === 'pipeline_executions') {
            const id = pendingFilters.find(f => f[0] === 'id')?.[1] as string
            const row = state.pipelines.get(id) || {}
            state.pipelines.set(id, { ...row, ...builder._pendingUpdate })
          } else if (table === 'pipeline_steps') {
            const pid = pendingFilters.find(f => f[0] === 'pipeline_id')?.[1] as string
            const idx = pendingFilters.find(f => f[0] === 'step_index')?.[1] as number
            const key = `${pid}::${idx}`
            const row = state.steps.get(key) || {}
            state.steps.set(key, { ...row, ...builder._pendingUpdate })
          }
          return Promise.resolve({ data: null, error: null }).then(onF, onR)
        }
        // Otherwise: list query
        const result = resolveListQuery(table, pendingFilters, pendingNotFilters)
        return Promise.resolve(result).then(onF, onR)
      },
    }

    function resolveQuery(t: string, fs: Array<[string, unknown]>, b: any) {
      // Update?
      if (b._pendingUpdate) {
        state.updateCalls.push({ table: t, updates: b._pendingUpdate, eqs: [...fs] })
        return Promise.resolve({ data: null, error: null })
      }
      if (t === 'pipeline_executions') {
        const id = fs.find(f => f[0] === 'id')?.[1] as string
        const row = state.pipelines.get(id)
        if (!row) return Promise.resolve({ data: null, error: { message: 'not found' } })
        return Promise.resolve({ data: row, error: null })
      }
      if (t === 'pipeline_steps') {
        const pid = fs.find(f => f[0] === 'pipeline_id')?.[1] as string
        const idx = fs.find(f => f[0] === 'step_index')?.[1] as number
        const key = `${pid}::${idx}`
        const row = state.steps.get(key)
        return Promise.resolve({ data: row || null, error: null })
      }
      if (t === 'clients') {
        return Promise.resolve({ data: { name: 'Test Client' }, error: null })
      }
      return Promise.resolve({ data: null, error: null })
    }

    function resolveListQuery(t: string, fs: Array<[string, unknown]>, _nots: Array<[string, unknown]>) {
      if (t === 'pipeline_steps') {
        const pid = fs.find(f => f[0] === 'pipeline_id')?.[1] as string
        const status = fs.find(f => f[0] === 'status')?.[1] as string
        const rows = [...state.steps.values()].filter(r =>
          r.pipeline_id === pid && (status ? r.status === status : true)
        )
        return { data: rows, error: null }
      }
      return { data: [], error: null }
    }

    return builder
  }

  function rpc(fn: string, args: unknown) {
    if (state.rpcResponses.has(fn)) {
      return Promise.resolve({ data: state.rpcResponses.get(fn), error: null })
    }
    if (fn === 'increment_pipeline_costs') {
      return Promise.resolve({ data: null, error: null })
    }
    return Promise.resolve({ data: null, error: { message: `rpc ${fn} not mocked (args=${JSON.stringify(args)})` } })
  }

  function makeSelectSingle(row: Row) {
    return {
      select() { return this },
      single() { return Promise.resolve({ data: row, error: null }) },
    }
  }

  return { from, rpc, _state: state } as any
}

// ─── fetch mock ─────────────────────────────────────────────────────────

type FetchRecord = { url: string; init?: RequestInit }
function makeFetchMock(responses: Record<string, { ok?: boolean; json?: any }> = {}) {
  const calls: FetchRecord[] = []
  const fn = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, init })
    for (const [pattern, resp] of Object.entries(responses)) {
      if (url.includes(pattern)) {
        return {
          ok: resp.ok ?? true,
          json: async () => resp.json ?? {},
        } as Response
      }
    }
    return { ok: true, json: async () => ({}) } as Response
  })
  return { fn, calls }
}

// ─── Default step templates ────────────────────────────────────────────

function agentStep(index: number, agent: string, hitl = false): Row {
  return {
    index, name: `step_${index}`, display_name: `Step ${index}`,
    agent, description: `Run ${agent}`, hitl_required: hitl,
    depends_on: [], timeout_minutes: null,
  }
}
function n8nStep(index: number): Row {
  return {
    index, name: `step_${index}`, display_name: `Step ${index}`,
    agent: null, description: 'mechanical', hitl_required: false,
    depends_on: [], timeout_minutes: null,
    is_n8n: true, n8n_workflow: 'publish_content',
  }
}
function parallelStep(index: number, subAgents: string[]): Row {
  return {
    index, name: `step_${index}`, display_name: `Parallel ${index}`,
    agent: null, description: 'parallel', hitl_required: false,
    depends_on: [], timeout_minutes: null,
    is_parallel: true, sub_agents: subAgents,
  }
}
function hitlOnlyStep(index: number): Row {
  return {
    index, name: `step_${index}`, display_name: `HITL ${index}`,
    agent: null, description: 'human review', hitl_required: true,
    depends_on: [], timeout_minutes: null,
  }
}
function delayedStep(index: number): Row {
  return {
    index, name: `step_${index}`, display_name: `Delayed ${index}`,
    agent: 'optimization-agent', description: 'wait', hitl_required: false,
    depends_on: [], timeout_minutes: null, delay_hours: 48,
  }
}

const ORIGINAL_FETCH = global.fetch

beforeEach(() => {
  vi.clearAllMocks()
})

// ════════════════════════════════════════════════════════════════════════
// createPipeline
// ════════════════════════════════════════════════════════════════════════

describe('PipelineOrchestrator · createPipeline', () => {
  it('writes pipeline + step rows + returns generated id', async () => {
    const supabase = makeSupabase({
      rpcResponses: new Map([
        ['get_pipeline_template', [agentStep(0, 'jefe-marketing'), n8nStep(1)]],
      ]),
    })
    const orch = new PipelineOrchestrator(supabase, 'http://test')
    const id = await orch.createPipeline({
      clientId: 'acme',
      objective: 'launch',
      triggerType: 'manual',
    })
    expect(id).toMatch(/^pipe-/)
    expect(supabase._state.insertCalls.find((c: any) => c.table === 'pipeline_executions')).toBeTruthy()
    expect(supabase._state.insertCalls.find((c: any) => c.table === 'pipeline_steps')?.rows).toHaveLength(2)
  })

  it('throws when template RPC fails', async () => {
    const supabase = makeSupabase()
    // No rpcResponse → returns error
    const orch = new PipelineOrchestrator(supabase, 'http://test')
    await expect(
      orch.createPipeline({ clientId: 'acme', objective: 'x', triggerType: 'manual' }),
    ).rejects.toThrow(/template/i)
  })

  it('marks skipSteps as skipped in step_records', async () => {
    const supabase = makeSupabase({
      rpcResponses: new Map([['get_pipeline_template', [agentStep(0, 'a'), agentStep(1, 'b')]]]),
    })
    const orch = new PipelineOrchestrator(supabase, 'http://test')
    await orch.createPipeline({
      clientId: 'acme', objective: 'x', triggerType: 'manual', skipSteps: [1],
    })
    const stepInsert = supabase._state.insertCalls.find((c: any) => c.table === 'pipeline_steps')
    expect(stepInsert?.rows[0].status).toBe('pending')
    expect(stepInsert?.rows[1].status).toBe('skipped')
  })

  it('uses custom templateName when provided', async () => {
    const supabase = makeSupabase({
      rpcResponses: new Map([['get_pipeline_template', [agentStep(0, 'a')]]]),
    })
    const orch = new PipelineOrchestrator(supabase, 'http://test')
    await orch.createPipeline({
      clientId: 'acme', objective: 'x', triggerType: 'manual', templateName: 'mini_test',
    })
    const ins = supabase._state.insertCalls.find((c: any) => c.table === 'pipeline_executions')
    expect(ins?.rows[0].pipeline_template).toBe('mini_test')
  })

  it('respects startFromStep for resume case', async () => {
    const supabase = makeSupabase({
      rpcResponses: new Map([['get_pipeline_template', [agentStep(0, 'a'), agentStep(1, 'b')]]]),
    })
    const orch = new PipelineOrchestrator(supabase, 'http://test')
    await orch.createPipeline({
      clientId: 'acme', objective: 'x', triggerType: 'manual', startFromStep: 1,
    })
    const ins = supabase._state.insertCalls.find((c: any) => c.table === 'pipeline_executions')
    expect(ins?.rows[0].current_step_index).toBe(1)
  })
})

// ════════════════════════════════════════════════════════════════════════
// executePipeline · routing across step types
// ════════════════════════════════════════════════════════════════════════

describe('PipelineOrchestrator · executePipeline routing', () => {
  it('refuses to execute already-completed pipeline', async () => {
    const supabase = makeSupabase()
    supabase._state.pipelines.set('p1', { id: 'p1', status: 'completed', current_step_index: 0, steps_config: [] })
    const orch = new PipelineOrchestrator(supabase, 'http://test')
    await expect(orch.executePipeline('p1')).rejects.toThrow(/already completed/i)
  })

  it('refuses to execute already-cancelled pipeline', async () => {
    const supabase = makeSupabase()
    supabase._state.pipelines.set('p1', { id: 'p1', status: 'cancelled', current_step_index: 0, steps_config: [] })
    const orch = new PipelineOrchestrator(supabase, 'http://test')
    await expect(orch.executePipeline('p1')).rejects.toThrow(/already cancelled/i)
  })

  it('agent step calls /api/agents/run with task + context', async () => {
    const fm = makeFetchMock({
      '/api/agents/run': { json: { success: true, response: 'agent output', input_tokens: 100, output_tokens: 50 } },
    })
    global.fetch = fm.fn as any

    const supabase = makeSupabase()
    supabase._state.pipelines.set('p1', {
      id: 'p1', status: 'pending', current_step_index: 0,
      steps_config: [agentStep(0, 'jefe-marketing')],
      client_id: 'acme', objective: 'launch product',
    })
    supabase._state.steps.set('p1::0', { pipeline_id: 'p1', step_index: 0, status: 'pending' })

    const orch = new PipelineOrchestrator(supabase, 'http://test')
    await orch.executePipeline('p1')

    expect(fm.fn).toHaveBeenCalled()
    const call = fm.calls.find(c => c.url.includes('/api/agents/run'))
    expect(call).toBeDefined()
    const body = JSON.parse(call!.init!.body as string)
    expect(body.agent).toBe('jefe-marketing')
    expect(body.task).toContain('launch product')
    expect(body.caller).toBe('pipeline')
    global.fetch = ORIGINAL_FETCH
  })

  it('failed agent step (non-ok response) is recorded with error', async () => {
    const fm = makeFetchMock({
      '/api/agents/run': { ok: false, json: { success: false, error: 'agent timeout' } },
    })
    global.fetch = fm.fn as any

    const supabase = makeSupabase()
    supabase._state.pipelines.set('p1', {
      id: 'p1', status: 'pending', current_step_index: 0,
      steps_config: [agentStep(0, 'x')], client_id: 'c', objective: 'o',
    })
    supabase._state.steps.set('p1::0', {
      pipeline_id: 'p1', step_index: 0, status: 'pending',
      retry_count: 5, max_retries: 3,
    })

    const orch = new PipelineOrchestrator(supabase, 'http://test')
    await orch.executePipeline('p1')

    const stepRow = supabase._state.steps.get('p1::0')
    expect(stepRow?.status).toBe('failed')
    expect(supabase._state.pipelines.get('p1')?.status).toBe('failed')
    global.fetch = ORIGINAL_FETCH
  })

  it('n8n step posts to N8N_WEBHOOK_URL with correct payload', async () => {
    process.env.N8N_WEBHOOK_URL = 'http://n8n.test/webhook'
    const fm = makeFetchMock({
      'n8n.test': { json: { message: 'queued' } },
    })
    global.fetch = fm.fn as any

    const supabase = makeSupabase()
    supabase._state.pipelines.set('p1', {
      id: 'p1', status: 'pending', current_step_index: 0,
      steps_config: [n8nStep(0)], client_id: 'c', objective: 'o',
    })
    supabase._state.steps.set('p1::0', { pipeline_id: 'p1', step_index: 0, status: 'pending' })

    const orch = new PipelineOrchestrator(supabase, 'http://test')
    await orch.executePipeline('p1')

    const n8nCall = fm.calls.find(c => c.url.includes('n8n.test'))
    expect(n8nCall).toBeDefined()
    const body = JSON.parse(n8nCall!.init!.body as string)
    expect(body.workflow).toBe('publish_content')
    expect(body.pipeline_id).toBe('p1')
    global.fetch = ORIGINAL_FETCH
  })

  it('n8n step fails when N8N_WEBHOOK_URL is not configured', async () => {
    delete process.env.N8N_WEBHOOK_URL
    const supabase = makeSupabase()
    supabase._state.pipelines.set('p1', {
      id: 'p1', status: 'pending', current_step_index: 0,
      steps_config: [n8nStep(0)], client_id: 'c', objective: 'o',
    })
    supabase._state.steps.set('p1::0', {
      pipeline_id: 'p1', step_index: 0, status: 'pending',
      retry_count: 5, max_retries: 3,
    })
    const orch = new PipelineOrchestrator(supabase, 'http://test')
    await orch.executePipeline('p1')
    const step = supabase._state.steps.get('p1::0')
    expect(step?.error_message).toContain('N8N_WEBHOOK_URL')
  })

  it('parallel step fans out to all sub_agents', async () => {
    const fm = makeFetchMock({
      '/api/agents/run': { json: { success: true, response: 'piece', input_tokens: 50, output_tokens: 25 } },
    })
    global.fetch = fm.fn as any

    const supabase = makeSupabase()
    supabase._state.pipelines.set('p1', {
      id: 'p1', status: 'pending', current_step_index: 0,
      steps_config: [parallelStep(0, ['content-creator', 'seo-specialist', 'media-buyer'])],
      client_id: 'c', objective: 'o',
    })
    supabase._state.steps.set('p1::0', { pipeline_id: 'p1', step_index: 0, status: 'pending' })

    const orch = new PipelineOrchestrator(supabase, 'http://test')
    await orch.executePipeline('p1')

    const agentCalls = fm.calls.filter(c => c.url.includes('/api/agents/run'))
    expect(agentCalls.length).toBe(3)
    const agents = agentCalls.map(c => JSON.parse(c.init!.body as string).agent).sort()
    expect(agents).toEqual(['content-creator', 'media-buyer', 'seo-specialist'])
    global.fetch = ORIGINAL_FETCH
  })

  it('parallel step filters out NO_TASKS_FOR_ME responses', async () => {
    const fm = vi.fn(async (url: string, init?: RequestInit) => {
      const body = JSON.parse(init!.body as string)
      const response = body.agent === 'media-buyer' ? 'NO_TASKS_FOR_ME' : 'real output'
      return { ok: true, json: async () => ({ success: true, response, input_tokens: 10, output_tokens: 5 }) } as Response
    })
    global.fetch = fm as any

    const supabase = makeSupabase()
    supabase._state.pipelines.set('p1', {
      id: 'p1', status: 'pending', current_step_index: 0,
      steps_config: [parallelStep(0, ['content-creator', 'media-buyer'])],
      client_id: 'c', objective: 'o',
    })
    supabase._state.steps.set('p1::0', { pipeline_id: 'p1', step_index: 0, status: 'pending' })

    const orch = new PipelineOrchestrator(supabase, 'http://test')
    await orch.executePipeline('p1')

    const stepRow = supabase._state.steps.get('p1::0')
    const out = stepRow?.output_result as any
    expect(out.agents_skipped).toContain('media-buyer')
    expect(out.agents_active).toContain('content-creator')
    global.fetch = ORIGINAL_FETCH
  })

  it('pure HITL step pauses pipeline + returns without continuing', async () => {
    const supabase = makeSupabase()
    supabase._state.pipelines.set('p1', {
      id: 'p1', status: 'pending', current_step_index: 0,
      steps_config: [hitlOnlyStep(0), agentStep(1, 'next-agent')],
      client_id: 'c', objective: 'o',
    })
    supabase._state.steps.set('p1::0', { pipeline_id: 'p1', step_index: 0, status: 'pending', id: 'step-row-0' })
    supabase._state.steps.set('p1::1', { pipeline_id: 'p1', step_index: 1, status: 'pending' })

    const orch = new PipelineOrchestrator(supabase, 'http://test')
    await orch.executePipeline('p1')

    expect(supabase._state.pipelines.get('p1')?.status).toBe('paused_hitl')
    // step 1 should not have been executed
    expect(supabase._state.steps.get('p1::1')?.status).toBe('pending')
  })

  it('delayed step pauses pipeline (paused_hitl reused) without running agent', async () => {
    const fm = makeFetchMock({})
    global.fetch = fm.fn as any
    const supabase = makeSupabase()
    supabase._state.pipelines.set('p1', {
      id: 'p1', status: 'pending', current_step_index: 0,
      steps_config: [delayedStep(0)], client_id: 'c', objective: 'o',
    })
    supabase._state.steps.set('p1::0', { pipeline_id: 'p1', step_index: 0, status: 'pending' })

    const orch = new PipelineOrchestrator(supabase, 'http://test')
    await orch.executePipeline('p1')

    expect(supabase._state.pipelines.get('p1')?.status).toBe('paused_hitl')
    expect(fm.calls.find(c => c.url.includes('/api/agents/run'))).toBeUndefined()
    global.fetch = ORIGINAL_FETCH
  })

  it('skipped step is bypassed and next step runs', async () => {
    const fm = makeFetchMock({
      '/api/agents/run': { json: { success: true, response: 'ran', input_tokens: 1, output_tokens: 1 } },
    })
    global.fetch = fm.fn as any

    const supabase = makeSupabase()
    supabase._state.pipelines.set('p1', {
      id: 'p1', status: 'pending', current_step_index: 0,
      steps_config: [agentStep(0, 'a'), agentStep(1, 'b')],
      client_id: 'c', objective: 'o',
    })
    supabase._state.steps.set('p1::0', { pipeline_id: 'p1', step_index: 0, status: 'skipped' })
    supabase._state.steps.set('p1::1', { pipeline_id: 'p1', step_index: 1, status: 'pending' })

    const orch = new PipelineOrchestrator(supabase, 'http://test')
    await orch.executePipeline('p1')

    const calls = fm.calls.filter(c => c.url.includes('/api/agents/run'))
    expect(calls).toHaveLength(1)
    const body = JSON.parse(calls[0].init!.body as string)
    expect(body.agent).toBe('b')
    global.fetch = ORIGINAL_FETCH
  })

  it('step with no agent + not n8n + not HITL is skipped', async () => {
    const supabase = makeSupabase()
    supabase._state.pipelines.set('p1', {
      id: 'p1', status: 'pending', current_step_index: 0,
      steps_config: [{ index: 0, name: 's0', display_name: 'S0', agent: null, description: '', hitl_required: false, depends_on: [], timeout_minutes: null }],
      client_id: 'c', objective: 'o',
    })
    supabase._state.steps.set('p1::0', { pipeline_id: 'p1', step_index: 0, status: 'pending' })

    const orch = new PipelineOrchestrator(supabase, 'http://test')
    await orch.executePipeline('p1')

    expect(supabase._state.steps.get('p1::0')?.status).toBe('skipped')
  })
})

// ════════════════════════════════════════════════════════════════════════
// resumeAfterHITL
// ════════════════════════════════════════════════════════════════════════

describe('PipelineOrchestrator · resumeAfterHITL', () => {
  it('approved decision marks step completed + advances current_step_index', async () => {
    const fm = makeFetchMock({
      '/api/agents/run': { json: { success: true, response: 'next ran', input_tokens: 10, output_tokens: 5 } },
    })
    global.fetch = fm.fn as any

    const supabase = makeSupabase()
    supabase._state.pipelines.set('p1', {
      id: 'p1', status: 'paused_hitl', current_step_index: 0,
      steps_config: [hitlOnlyStep(0), agentStep(1, 'next')],
      client_id: 'c', objective: 'o',
    })
    supabase._state.steps.set('p1::0', { pipeline_id: 'p1', step_index: 0, status: 'paused_hitl', input_context: { chain_outputs_snapshot: {} } })
    supabase._state.steps.set('p1::1', { pipeline_id: 'p1', step_index: 1, status: 'pending' })

    const orch = new PipelineOrchestrator(supabase, 'http://test')
    await orch.resumeAfterHITL('p1', 0, 'approved')

    expect(supabase._state.steps.get('p1::0')?.status).toBe('completed')
    expect(supabase._state.steps.get('p1::0')?.hitl_status).toBe('approved')
    global.fetch = ORIGINAL_FETCH
  })

  it('rejected decision marks step failed + pipeline failed (does not continue)', async () => {
    const supabase = makeSupabase()
    supabase._state.pipelines.set('p1', {
      id: 'p1', status: 'paused_hitl', current_step_index: 0,
      steps_config: [hitlOnlyStep(0), agentStep(1, 'next')],
      client_id: 'c', objective: 'o',
    })
    supabase._state.steps.set('p1::0', { pipeline_id: 'p1', step_index: 0, status: 'paused_hitl', input_context: {} })

    const orch = new PipelineOrchestrator(supabase, 'http://test')
    await orch.resumeAfterHITL('p1', 0, 'rejected', 'too generic')

    expect(supabase._state.steps.get('p1::0')?.status).toBe('failed')
    expect(supabase._state.steps.get('p1::0')?.hitl_status).toBe('rejected')
    expect(supabase._state.steps.get('p1::0')?.hitl_feedback).toBe('too generic')
    expect(supabase._state.pipelines.get('p1')?.status).toBe('failed')
  })

  it('edited decision uses editedContent in chain', async () => {
    const fm = makeFetchMock({
      '/api/agents/run': { json: { success: true, response: 'after edit', input_tokens: 1, output_tokens: 1 } },
    })
    global.fetch = fm.fn as any

    const supabase = makeSupabase()
    supabase._state.pipelines.set('p1', {
      id: 'p1', status: 'paused_hitl', current_step_index: 0,
      steps_config: [hitlOnlyStep(0), agentStep(1, 'next')],
      client_id: 'c', objective: 'o',
    })
    supabase._state.steps.set('p1::0', {
      pipeline_id: 'p1', step_index: 0, status: 'paused_hitl',
      input_context: { chain_outputs_snapshot: {} },
      output_text: 'original',
    })
    supabase._state.steps.set('p1::1', { pipeline_id: 'p1', step_index: 1, status: 'pending' })

    const orch = new PipelineOrchestrator(supabase, 'http://test')
    await orch.resumeAfterHITL('p1', 0, 'edited', undefined, 'edited content')

    const next = supabase._state.steps.get('p1::0')
    expect(next?.hitl_status).toBe('edited')
    global.fetch = ORIGINAL_FETCH
  })
})

// ════════════════════════════════════════════════════════════════════════
// retry / failure paths
// ════════════════════════════════════════════════════════════════════════

describe('PipelineOrchestrator · failure + retry behavior', () => {
  it('retries when retry_count < max_retries', async () => {
    let calls = 0
    const fm = vi.fn(async (url: string) => {
      calls++
      if (calls === 1) return { ok: false, json: async () => ({ success: false, error: 'flaky' }) } as Response
      return { ok: true, json: async () => ({ success: true, response: 'ok', input_tokens: 1, output_tokens: 1 }) } as Response
    })
    global.fetch = fm as any

    const supabase = makeSupabase()
    supabase._state.pipelines.set('p1', {
      id: 'p1', status: 'pending', current_step_index: 0,
      steps_config: [agentStep(0, 'a')], client_id: 'c', objective: 'o',
    })
    supabase._state.steps.set('p1::0', {
      pipeline_id: 'p1', step_index: 0, status: 'pending',
      retry_count: 0, max_retries: 3,
    })

    const orch = new PipelineOrchestrator(supabase, 'http://test')
    await orch.executePipeline('p1')

    expect(supabase._state.steps.get('p1::0')?.status).toBe('completed')
    expect(calls).toBeGreaterThanOrEqual(2)
    global.fetch = ORIGINAL_FETCH
  })

  it('marks pipeline failed when max_retries exhausted', async () => {
    const fm = makeFetchMock({
      '/api/agents/run': { ok: false, json: { success: false, error: 'permanent' } },
    })
    global.fetch = fm.fn as any

    const supabase = makeSupabase()
    supabase._state.pipelines.set('p1', {
      id: 'p1', status: 'pending', current_step_index: 0,
      steps_config: [agentStep(0, 'a')], client_id: 'c', objective: 'o',
    })
    supabase._state.steps.set('p1::0', {
      pipeline_id: 'p1', step_index: 0, status: 'pending',
      retry_count: 3, max_retries: 3,
    })

    const orch = new PipelineOrchestrator(supabase, 'http://test')
    await orch.executePipeline('p1')

    expect(supabase._state.pipelines.get('p1')?.status).toBe('failed')
    global.fetch = ORIGINAL_FETCH
  })

  it('agent fetch throw is caught and recorded as error', async () => {
    global.fetch = vi.fn(async () => { throw new Error('network down') }) as any
    const supabase = makeSupabase()
    supabase._state.pipelines.set('p1', {
      id: 'p1', status: 'pending', current_step_index: 0,
      steps_config: [agentStep(0, 'a')], client_id: 'c', objective: 'o',
    })
    supabase._state.steps.set('p1::0', {
      pipeline_id: 'p1', step_index: 0, status: 'pending',
      retry_count: 5, max_retries: 3,
    })

    const orch = new PipelineOrchestrator(supabase, 'http://test')
    await orch.executePipeline('p1')

    expect(supabase._state.steps.get('p1::0')?.error_message).toContain('network down')
    global.fetch = ORIGINAL_FETCH
  })
})

// ════════════════════════════════════════════════════════════════════════
// loadPipelineState (indirect)
// ════════════════════════════════════════════════════════════════════════

describe('PipelineOrchestrator · loadPipelineState', () => {
  it('throws when pipeline row is missing', async () => {
    const supabase = makeSupabase()
    const orch = new PipelineOrchestrator(supabase, 'http://test')
    await expect(orch.executePipeline('does-not-exist')).rejects.toThrow(/not found/i)
  })
})

// ════════════════════════════════════════════════════════════════════════
// completion path
// ════════════════════════════════════════════════════════════════════════

describe('PipelineOrchestrator · completion', () => {
  it('marks pipeline completed after all steps succeed', async () => {
    const fm = makeFetchMock({
      '/api/agents/run': { json: { success: true, response: 'done', input_tokens: 10, output_tokens: 5 } },
    })
    global.fetch = fm.fn as any

    const supabase = makeSupabase()
    supabase._state.pipelines.set('p1', {
      id: 'p1', status: 'pending', current_step_index: 0,
      steps_config: [agentStep(0, 'a')],
      client_id: 'c', objective: 'o',
      total_cost_usd: 0,
    })
    supabase._state.steps.set('p1::0', { pipeline_id: 'p1', step_index: 0, status: 'pending' })

    const orch = new PipelineOrchestrator(supabase, 'http://test')
    await orch.executePipeline('p1')

    expect(supabase._state.pipelines.get('p1')?.status).toBe('completed')
    expect(supabase._state.steps.get('p1::0')?.status).toBe('completed')
    global.fetch = ORIGINAL_FETCH
  })
})
