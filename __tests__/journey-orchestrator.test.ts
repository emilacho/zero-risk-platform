/**
 * Unit tests · L1 Master Journey Orchestrator (Sprint 1 · CC#1 · 2026-05-20)
 *
 * Covers · validators · state-machine transitions · routes-map · dispatch
 * happy-path + failure-path with mocked Supabase + fetch.
 */
import { describe, it, expect, vi } from 'vitest'
import {
  validateDispatchRequest,
  resolveNextStage,
  isTerminalStage,
  routeForJourney,
  dispatchJourney,
  JOURNEY_STAGES,
  type DispatchRequest,
} from '../src/lib/journey-orchestrator'

// ── validators ─────────────────────────────────────────────────────────

describe('validateDispatchRequest', () => {
  const VALID_UUID = 'd69100b5-8ad7-4bb0-908c-68b5544065dc'

  it('accepts a well-formed ONBOARD payload', () => {
    const r = validateDispatchRequest({
      client_id: VALID_UUID,
      journey: 'ONBOARD',
      trigger_type: 'manual',
      params: { source: 'mc-button' },
    })
    expect(r.ok).toBe(true)
    expect(r.data?.journey).toBe('ONBOARD')
    expect(r.data?.client_id).toBe(VALID_UUID)
  })

  it('rejects invalid journey', () => {
    const r = validateDispatchRequest({
      client_id: VALID_UUID,
      journey: 'INVALID',
      trigger_type: 'manual',
    })
    expect(r.ok).toBe(false)
    expect(r.error).toContain('invalid_journey')
  })

  it('rejects invalid trigger_type', () => {
    const r = validateDispatchRequest({
      client_id: VALID_UUID,
      journey: 'ONBOARD',
      trigger_type: 'not_a_trigger',
    })
    expect(r.ok).toBe(false)
    expect(r.error).toContain('invalid_trigger_type')
  })

  it('rejects missing client_id for non-ACQUIRE journey', () => {
    const r = validateDispatchRequest({
      journey: 'ONBOARD',
      trigger_type: 'manual',
    })
    expect(r.ok).toBe(false)
    expect(r.error).toContain('client_id_required')
  })

  it('allows missing client_id for ACQUIRE journey', () => {
    const r = validateDispatchRequest({
      journey: 'ACQUIRE',
      trigger_type: 'webhook',
      params: { lead_email: 'test@example.com' },
    })
    expect(r.ok).toBe(true)
    expect(r.data?.client_id).toBe(null)
  })

  it('rejects malformed client_id (not UUID)', () => {
    const r = validateDispatchRequest({
      client_id: 'naufrago',
      journey: 'ONBOARD',
      trigger_type: 'manual',
    })
    expect(r.ok).toBe(false)
    expect(r.error).toContain('invalid_client_id')
  })

  it('rejects null/undefined body', () => {
    expect(validateDispatchRequest(null).ok).toBe(false)
    expect(validateDispatchRequest(undefined).ok).toBe(false)
    expect(validateDispatchRequest('string').ok).toBe(false)
  })
})

// ── state-machine ──────────────────────────────────────────────────────

describe('resolveNextStage', () => {
  it('starts at stage[0] when no currentStage', () => {
    expect(resolveNextStage('ONBOARD', null, 'manual')).toBe('kickoff')
    expect(resolveNextStage('PRODUCE', null, 'manual')).toBe('brief_intake')
    expect(resolveNextStage('REVIEW', null, 'manual')).toBe('data_collection')
  })

  it('resume_stuck keeps currentStage', () => {
    expect(resolveNextStage('ONBOARD', 'send_intake_form', 'resume_stuck')).toBe(
      'send_intake_form',
    )
  })

  it('hitl_resolved advances one stage', () => {
    // ONBOARD canonical order post Sprint 8C drift fix · kickoff → auto_discovery_complete → send_intake_form → ...
    expect(resolveNextStage('ONBOARD', 'kickoff', 'hitl_resolved')).toBe(
      'auto_discovery_complete',
    )
    expect(resolveNextStage('ONBOARD', 'auto_discovery_complete', 'hitl_resolved')).toBe(
      'send_intake_form',
    )
    expect(resolveNextStage('ONBOARD', 'send_intake_form', 'hitl_resolved')).toBe(
      'intake_received',
    )
  })

  it('cascade_done advances one stage', () => {
    expect(resolveNextStage('PRODUCE', 'production', 'cascade_done')).toBe('qa_review')
  })

  it('does not advance past terminal stage', () => {
    const finalStage = JOURNEY_STAGES.ONBOARD.at(-1)!
    expect(resolveNextStage('ONBOARD', finalStage, 'hitl_resolved')).toBe(finalStage)
  })

  it('ALWAYS_ON + anomaly_detected jumps to anomaly_detected stage', () => {
    expect(resolveNextStage('ALWAYS_ON', 'monitoring', 'anomaly_detected')).toBe(
      'anomaly_detected',
    )
  })
})

describe('isTerminalStage', () => {
  it('identifies terminal stages per journey', () => {
    expect(isTerminalStage('ONBOARD', 'review_handoff')).toBe(true)
    expect(isTerminalStage('PRODUCE', 'optimize')).toBe(true)
    expect(isTerminalStage('REVIEW', 'qbr_sent')).toBe(true)
  })
  it('returns false for non-terminal + null', () => {
    expect(isTerminalStage('ONBOARD', 'kickoff')).toBe(false)
    expect(isTerminalStage('ONBOARD', null)).toBe(false)
  })
})

// ── routes-map ─────────────────────────────────────────────────────────

describe('routeForJourney', () => {
  it('returns http route for ONBOARD', () => {
    const r = routeForJourney('ONBOARD')
    expect(r.mode).toBe('http')
    expect(r.url).toContain('/api/onboarding')
    expect(r.authHeader).toBe('x-api-key')
  })

  it('returns n8n_webhook for PRODUCE', () => {
    const r = routeForJourney('PRODUCE')
    expect(r.mode).toBe('n8n_webhook')
    expect(r.url).toContain('/webhook/campaign-orchestrator')
  })

  it('returns stub for ACQUIRE / REVIEW / GROWTH (sprint posterior)', () => {
    expect(routeForJourney('ACQUIRE').mode).toBe('stub')
    expect(routeForJourney('REVIEW').mode).toBe('stub')
    expect(routeForJourney('GROWTH').mode).toBe('stub')
  })

  it('routes ALWAYS_ON to event-log endpoint', () => {
    const r = routeForJourney('ALWAYS_ON')
    expect(r.mode).toBe('http')
    expect(r.url).toContain('/api/journey/event-log')
  })
})

// ── dispatchJourney · happy / failure paths ────────────────────────────

interface MockChain {
  data?: unknown
  error?: { message: string } | null
}

function makeMockSupabase(behaviors: {
  read?: MockChain
  insert?: MockChain
  update?: MockChain
}) {
  const calls = { selects: [] as unknown[], inserts: [] as unknown[], updates: [] as unknown[] }
  const chain = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    order: vi.fn(() => chain),
    limit: vi.fn(() => chain),
    maybeSingle: vi.fn(() => Promise.resolve(behaviors.read ?? { data: null, error: null })),
    single: vi.fn(() => {
      // single() is called after insert/update with select('id')
      if (chain._lastOp === 'insert') return Promise.resolve(behaviors.insert ?? { data: { id: 'inserted-id' }, error: null })
      if (chain._lastOp === 'update') return Promise.resolve(behaviors.update ?? { data: { id: 'updated-id' }, error: null })
      return Promise.resolve({ data: null, error: null })
    }),
    insert: vi.fn((row: unknown) => {
      calls.inserts.push(row)
      chain._lastOp = 'insert'
      return chain
    }),
    update: vi.fn((row: unknown) => {
      calls.updates.push(row)
      chain._lastOp = 'update'
      return chain
    }),
    _lastOp: 'select' as 'select' | 'insert' | 'update',
  }
  return {
    from: vi.fn(() => {
      chain._lastOp = 'select'
      return chain
    }),
    _calls: calls,
  } as unknown as Parameters<typeof dispatchJourney>[1] extends infer O
    ? O extends { supabase?: infer S } ? NonNullable<S> & { _calls: typeof calls } : never
    : never
}

describe('dispatchJourney', () => {
  const VALID_UUID = '8802635f-9b9e-4b69-9371-24d33dd63f3c'

  it('persists new journey + invokes L2 HTTP route happy-path (ONBOARD)', async () => {
    const supabase = makeMockSupabase({
      read: { data: null, error: null }, // no existing row
      insert: { data: { id: 'new-journey-1' }, error: null },
    })
    const fetchImpl = vi.fn(async () =>
      new Response('{"session_id":"sess-1","status":"initiated"}', { status: 200 }),
    ) as unknown as typeof fetch

    const req: DispatchRequest = {
      client_id: VALID_UUID,
      journey: 'ONBOARD',
      trigger_type: 'manual',
      params: { companyName: 'Peniche Surf Escape' },
    }
    const result = await dispatchJourney(req, { supabase, fetchImpl })
    expect(result.ok).toBe(true)
    expect(result.journey_id).toBe('new-journey-1')
    expect(result.dispatch_status).toBe('dispatched')
    expect(result.l2_target).toContain('/api/onboarding')
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('returns stubbed for ACQUIRE (no L2 yet)', async () => {
    const supabase = makeMockSupabase({
      read: { data: null, error: null },
      insert: { data: { id: 'new-acquire-1' }, error: null },
    })
    const fetchImpl = vi.fn() as unknown as typeof fetch
    const req: DispatchRequest = {
      journey: 'ACQUIRE',
      trigger_type: 'webhook',
      params: { lead_email: 'lead@example.com' },
    }
    const result = await dispatchJourney(req, { supabase, fetchImpl })
    expect(result.ok).toBe(true)
    expect(result.dispatch_status).toBe('stubbed')
    expect(result.l2_target).toBe('stub:ACQUIRE')
    // fetch not invoked for stub
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('marks dispatch_status=failed when L2 returns non-2xx', async () => {
    const supabase = makeMockSupabase({
      read: { data: null, error: null },
      insert: { data: { id: 'new-journey-2' }, error: null },
    })
    const fetchImpl = vi.fn(async () =>
      new Response('{"error":"upstream_500"}', { status: 500 }),
    ) as unknown as typeof fetch

    const req: DispatchRequest = {
      client_id: VALID_UUID,
      journey: 'ONBOARD',
      trigger_type: 'manual',
    }
    const result = await dispatchJourney(req, { supabase, fetchImpl })
    expect(result.ok).toBe(false)
    expect(result.dispatch_status).toBe('failed')
    expect(result.error).toContain('HTTP 500')
  })

  it('updates existing journey row instead of inserting new one', async () => {
    const supabase = makeMockSupabase({
      read: {
        data: {
          id: 'existing-journey',
          current_stage: 'kickoff',
          error_count: 0,
        },
        error: null,
      },
      update: { data: { id: 'existing-journey' }, error: null },
    })
    const fetchImpl = vi.fn(async () =>
      new Response('{}', { status: 200 }),
    ) as unknown as typeof fetch

    const req: DispatchRequest = {
      client_id: VALID_UUID,
      journey: 'ONBOARD',
      trigger_type: 'hitl_resolved',
    }
    const result = await dispatchJourney(req, { supabase, fetchImpl })
    expect(result.journey_id).toBe('existing-journey')
    // hitl_resolved advances from kickoff → send_intake_form
    // (advance asserted via state-machine tests above; here we verify the update path was taken)
    const calls = (supabase as unknown as { _calls: { updates: unknown[]; inserts: unknown[] } })._calls
    expect(calls.updates.length).toBeGreaterThan(0)
    expect(calls.inserts.length).toBe(0)
  })

  // Sprint 8C migration shim · engine='n8n' proxies to n8n webhook
  it('engine=n8n proxies request to n8n webhook + returns DispatchResult', async () => {
    const supabase = makeMockSupabase({})
    const n8nResponse = {
      ok: true,
      journey_id: 'n8n-journey-1',
      journey: 'PRODUCE',
      dispatch_status: 'dispatched',
      l2_target: 'https://n8n.example/webhook/campaign-orchestrator',
      details: { engine: 'n8n-l1', mode: 'n8n_webhook' },
    }
    const fetchImpl = vi.fn(async (url: string) => {
      expect(url).toContain('/webhook/l1-dispatch')
      return new Response(JSON.stringify(n8nResponse), { status: 200 })
    }) as unknown as typeof fetch

    const req: DispatchRequest = {
      client_id: VALID_UUID,
      journey: 'PRODUCE',
      trigger_type: 'manual',
    }
    const result = await dispatchJourney(req, { supabase, fetchImpl, engine: 'n8n' })
    expect(result.ok).toBe(true)
    expect(result.journey_id).toBe('n8n-journey-1')
    expect(result.dispatch_status).toBe('dispatched')
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('engine=n8n returns failed when n8n webhook returns 5xx', async () => {
    const supabase = makeMockSupabase({})
    const fetchImpl = vi.fn(async () =>
      new Response('upstream down', { status: 502 }),
    ) as unknown as typeof fetch

    const req: DispatchRequest = {
      client_id: VALID_UUID,
      journey: 'ONBOARD',
      trigger_type: 'manual',
    }
    const result = await dispatchJourney(req, { supabase, fetchImpl, engine: 'n8n' })
    expect(result.ok).toBe(false)
    expect(result.dispatch_status).toBe('failed')
    expect(result.error).toContain('n8n_proxy_http_502')
  })

  it('Peniche resume_stuck smoke · onboard journey + send_intake_form stage', async () => {
    const supabase = makeMockSupabase({
      read: {
        data: {
          id: 'peniche-onboard',
          current_stage: 'send_intake_form',
          error_count: 0,
        },
        error: null,
      },
      update: { data: { id: 'peniche-onboard' }, error: null },
    })
    const fetchImpl = vi.fn(async () =>
      new Response('{"session_id":"onb-peniche","status":"resumed"}', {
        status: 200,
      }),
    ) as unknown as typeof fetch

    const req: DispatchRequest = {
      client_id: VALID_UUID,
      journey: 'ONBOARD',
      trigger_type: 'resume_stuck',
      params: { stuck_at_stage: 2, next_step: 'send_intake_form' },
    }
    const result = await dispatchJourney(req, { supabase, fetchImpl })
    expect(result.ok).toBe(true)
    expect(result.journey_id).toBe('peniche-onboard')
    expect(result.dispatch_status).toBe('dispatched')
  })
})
