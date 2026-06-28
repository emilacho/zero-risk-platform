/**
 * Tests · POST /api/sala/hitl/resolve · route handler integration tests.
 *
 * Sprint 12 Fase 0 prep finale · CC#3 owner. Composes the bridge
 * helpers + RealSalaIntegration via in-memory storage so the test
 * exercises the route's auth + flag + parse + resolveGate dispatch
 * without needing a live Supabase.
 *
 * §148 honest · the route uses SupabaseEventLogStorage in production ·
 * tests substitute InMemoryEventLogStorage via module mock. The
 * resolveGate logic itself runs UNMOCKED so the test catches any
 * regression in the harness/router/projection path · NOT just the
 * route wiring.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  InMemoryEventLogStorage,
  type EventLogStorage,
} from '@/lib/sala-event-log'

// ─── Module mocks · canon canon-canon-isolate route from prod deps ───

// Auth · dual-auth · accept either x-api-key=test-key OR admin-allow=true header
vi.mock('@/lib/internal-auth', () => ({
  checkInternalOrAdmin: vi.fn(async (r: Request) => {
    if (r.headers.get('x-api-key') === 'test-key') {
      return { ok: true, via: 'internal' as const }
    }
    if (r.headers.get('x-admin-allow') === 'true') {
      return { ok: true, via: 'admin' as const }
    }
    return { ok: false, reason: 'no test auth header' }
  }),
}))

// Supabase admin client · returned but never used (storage is mocked)
vi.mock('@/lib/supabase', () => ({
  getSupabaseAdmin: vi.fn(() => ({})),
}))

// Storage substitute · share a single InMemoryEventLogStorage so tests
// can seed gate_pending events BEFORE invoking the route.
let sharedStorage: InMemoryEventLogStorage

vi.mock('@/lib/sala-event-log', async () => {
  const actual = await vi.importActual<typeof import('@/lib/sala-event-log')>(
    '@/lib/sala-event-log',
  )
  return {
    ...actual,
    SupabaseEventLogStorage: class FakeSupabaseStorage implements EventLogStorage {
      insert(input: Parameters<EventLogStorage['insert']>[0]) {
        return sharedStorage.insert(input)
      }
      select(filters: Parameters<EventLogStorage['select']>[0]) {
        return sharedStorage.select(filters)
      }
      findByIdempotencyKey(
        tenant_id: string,
        idempotency_key: string,
      ): Promise<import('@/lib/sala-event-log').PersistedEvent | null> {
        return sharedStorage.findByIdempotencyKey(tenant_id, idempotency_key)
      }
    },
  }
})

async function importRoute() {
  return import('../src/app/api/sala/hitl/resolve/route')
}

function makeReq(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request('https://example.com/api/sala/hitl/resolve', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

// ─── Helpers to seed a gate_pending event into the shared storage ───

const TENANT = '11111111-1111-1111-1111-111111111111'
const CLIENT = '22222222-2222-2222-2222-222222222222'

/**
 * Canon canonical · seed a gate_pending event directly into storage,
 * targeting the canonical PRODUCE libreto's `validate_phase_1`
 * gate_camino_iii step. This bypasses runUntilHalt so the seed libreto
 * lookup matches the route's harness (which uses CANONICAL_LIBRETOS).
 * After resolveGate fires, the router walks the canonical PRODUCE
 * libreto forward · validate_phase_1 (gate) approved → phase_2_research
 * (action) · so the test asserts a `dispatch` decision (not terminal).
 */
async function seedGatePending(stream_id: string) {
  const { append, buildIdempotencyKey } = await import('@/lib/sala-event-log')
  const { randomUUID } = await import('node:crypto')
  const correlation_id = randomUUID()
  const logical_period = '2026-W23'

  // 1 · step_completed at phase_1_strategy (the action preceding the gate)
  await append(sharedStorage, {
    tenant_id: TENANT,
    client_id: CLIENT,
    stream_id,
    correlation_id,
    event_type: 'step_completed',
    journey_type: 'PRODUCE',
    operation_type: 'PRODUCE.phase_1_strategy',
    idempotency_key: buildIdempotencyKey({
      operation_type: 'PRODUCE.phase_1_strategy.complete',
      client_id: CLIENT,
      logical_period: `${logical_period}::${randomUUID()}`,
    }),
    logical_period,
    step_id: 'phase_1_strategy',
    step_state: 'done',
    payload: {},
    gate_type: null,
  })

  // 2 · gate_pending at validate_phase_1
  const gateResult = await append(sharedStorage, {
    tenant_id: TENANT,
    client_id: CLIENT,
    stream_id,
    correlation_id,
    event_type: 'gate_pending',
    journey_type: 'PRODUCE',
    operation_type: 'PRODUCE.validate_phase_1.gate',
    idempotency_key: buildIdempotencyKey({
      operation_type: 'PRODUCE.validate_phase_1.gate',
      client_id: CLIENT,
      logical_period: `${logical_period}::${randomUUID()}`,
    }),
    logical_period,
    step_id: 'validate_phase_1',
    payload: {},
    gate_type: 'camino_iii',
  })
  return gateResult.event
}

// ─── Tests ───

describe('POST /api/sala/hitl/resolve · feature flag (default-OFF)', () => {
  const originalEnv = process.env.SALA_HITL_RESOLVE_ENABLED
  beforeEach(() => {
    sharedStorage = new InMemoryEventLogStorage()
    delete process.env.SALA_HITL_RESOLVE_ENABLED
  })
  afterEach(() => {
    if (originalEnv === undefined) delete process.env.SALA_HITL_RESOLVE_ENABLED
    else process.env.SALA_HITL_RESOLVE_ENABLED = originalEnv
  })

  it('canon · returns 503 when flag NOT set', async () => {
    const { POST } = await importRoute()
    const res = await POST(
      makeReq({ source: 'sala', tenant_id: TENANT, stream_id: 's', gate_event_id: TENANT, outcome: 'approved' }),
    )
    expect(res.status).toBe(503)
    const body = await res.json()
    expect(body.error).toBe('sala_hitl_resolve_disabled')
  })

  it('canon · returns 503 when flag is non-"true" value', async () => {
    process.env.SALA_HITL_RESOLVE_ENABLED = 'yes'
    const { POST } = await importRoute()
    const res = await POST(
      makeReq({ source: 'sala', tenant_id: TENANT, stream_id: 's', gate_event_id: TENANT, outcome: 'approved' }),
    )
    expect(res.status).toBe(503)
  })
})

describe('POST /api/sala/hitl/resolve · auth (enabled)', () => {
  const originalEnv = process.env.SALA_HITL_RESOLVE_ENABLED
  beforeEach(() => {
    sharedStorage = new InMemoryEventLogStorage()
    process.env.SALA_HITL_RESOLVE_ENABLED = 'true'
  })
  afterEach(() => {
    if (originalEnv === undefined) delete process.env.SALA_HITL_RESOLVE_ENABLED
    else process.env.SALA_HITL_RESOLVE_ENABLED = originalEnv
  })

  it('canon · returns 401 without auth headers', async () => {
    const { POST } = await importRoute()
    const res = await POST(
      makeReq({ source: 'sala', tenant_id: TENANT, stream_id: 's', gate_event_id: TENANT, outcome: 'approved' }),
    )
    expect(res.status).toBe(401)
  })

  it('canon · returns 401 with bad x-api-key', async () => {
    const { POST } = await importRoute()
    const res = await POST(
      makeReq(
        { source: 'sala', tenant_id: TENANT, stream_id: 's', gate_event_id: TENANT, outcome: 'approved' },
        { 'x-api-key': 'wrong' },
      ),
    )
    expect(res.status).toBe(401)
  })
})

describe('POST /api/sala/hitl/resolve · body validation', () => {
  const originalEnv = process.env.SALA_HITL_RESOLVE_ENABLED
  beforeEach(() => {
    sharedStorage = new InMemoryEventLogStorage()
    process.env.SALA_HITL_RESOLVE_ENABLED = 'true'
  })
  afterEach(() => {
    if (originalEnv === undefined) delete process.env.SALA_HITL_RESOLVE_ENABLED
    else process.env.SALA_HITL_RESOLVE_ENABLED = originalEnv
  })

  it('canon · returns 400 on invalid JSON', async () => {
    const { POST } = await importRoute()
    const res = await POST(makeReq('not-json{{', { 'x-api-key': 'test-key' }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('invalid_json')
  })

  it('canon · returns 400 on missing fields', async () => {
    const { POST } = await importRoute()
    const res = await POST(makeReq({ source: 'sala' }, { 'x-api-key': 'test-key' }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('invalid_body')
  })

  it('canon · returns 400 on unknown source', async () => {
    const { POST } = await importRoute()
    const res = await POST(
      makeReq(
        { source: 'mystery', tenant_id: TENANT, stream_id: 's', gate_event_id: TENANT, outcome: 'approved' },
        { 'x-api-key': 'test-key' },
      ),
    )
    expect(res.status).toBe(400)
  })
})

describe('POST /api/sala/hitl/resolve · happy path · sala source', () => {
  const originalEnv = process.env.SALA_HITL_RESOLVE_ENABLED
  beforeEach(() => {
    sharedStorage = new InMemoryEventLogStorage()
    process.env.SALA_HITL_RESOLVE_ENABLED = 'true'
  })
  afterEach(() => {
    if (originalEnv === undefined) delete process.env.SALA_HITL_RESOLVE_ENABLED
    else process.env.SALA_HITL_RESOLVE_ENABLED = originalEnv
  })

  it('canon · resolves an approved gate · router emits dispatch for next step', async () => {
    const stream = `stream-${Math.random().toString(36).slice(2)}`
    const gatePending = await seedGatePending(stream)

    const { POST } = await importRoute()
    const res = await POST(
      makeReq(
        {
          source: 'sala',
          tenant_id: TENANT,
          stream_id: stream,
          gate_event_id: gatePending.event_id,
          outcome: 'approved',
          resolved_by: 'emilio@hotmail.com',
        },
        { 'x-api-key': 'test-key' },
      ),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.outcome).toBe('approved')
    // Canon · approving validate_phase_1 advances to phase_2_research (action).
    const dispatch = body.decisions.find((d: { kind: string }) => d.kind === 'dispatch')
    expect(dispatch).toBeDefined()
    expect(dispatch.step_id).toBe('phase_2_research')
    // Canon · the gate_resolved event was appended to the log.
    const events = await sharedStorage.select({ tenant_id: TENANT, stream_id: stream })
    expect(events.some((e) => e.event_type === 'gate_resolved')).toBe(true)
  })

  it('canon · accepts admin session auth (no x-api-key)', async () => {
    const stream = `stream-${Math.random().toString(36).slice(2)}`
    const gatePending = await seedGatePending(stream)

    const { POST } = await importRoute()
    const res = await POST(
      makeReq(
        {
          source: 'sala',
          tenant_id: TENANT,
          stream_id: stream,
          gate_event_id: gatePending.event_id,
          outcome: 'approved',
        },
        { 'x-admin-allow': 'true' },
      ),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.via).toBe('admin')
  })
})

describe('POST /api/sala/hitl/resolve · happy path · n8n-mc-inbox source', () => {
  const originalEnv = process.env.SALA_HITL_RESOLVE_ENABLED
  beforeEach(() => {
    sharedStorage = new InMemoryEventLogStorage()
    process.env.SALA_HITL_RESOLVE_ENABLED = 'true'
  })
  afterEach(() => {
    if (originalEnv === undefined) delete process.env.SALA_HITL_RESOLVE_ENABLED
    else process.env.SALA_HITL_RESOLVE_ENABLED = originalEnv
  })

  it('canon · n8n decision "approved" → resolves + router emits dispatch', async () => {
    const stream = `stream-${Math.random().toString(36).slice(2)}`
    const gatePending = await seedGatePending(stream)
    const { POST } = await importRoute()
    const res = await POST(
      makeReq(
        {
          source: 'n8n-mc-inbox',
          tenant_id: TENANT,
          stream_id: stream,
          gate_event_id: gatePending.event_id,
          decision: 'approved',
          reviewer: 'emilio@hotmail.com',
        },
        { 'x-api-key': 'test-key' },
      ),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.outcome).toBe('approved')
    expect(body.decisions.some((d: { kind: string }) => d.kind === 'dispatch')).toBe(true)
  })

  it('canon · n8n decision "edited" → carried as approved + edit in payload', async () => {
    const stream = `stream-${Math.random().toString(36).slice(2)}`
    const gatePending = await seedGatePending(stream)
    const { POST } = await importRoute()
    const res = await POST(
      makeReq(
        {
          source: 'n8n-mc-inbox',
          tenant_id: TENANT,
          stream_id: stream,
          gate_event_id: gatePending.event_id,
          decision: 'edited',
          edited_content: 'revised brand book paragraph',
          reviewer: 'emilio@hotmail.com',
        },
        { 'x-api-key': 'test-key' },
      ),
    )
    expect(res.status).toBe(200)
    const events = await sharedStorage.select({ tenant_id: TENANT, stream_id: stream })
    const resolved = events.find((e) => e.event_type === 'gate_resolved')!
    expect(resolved.payload.decision).toBe('edited')
    expect(resolved.payload.edited_content).toBe('revised brand book paragraph')
    expect(resolved.payload.outcome).toBe('approved')
  })
})

describe('POST /api/sala/hitl/resolve · error mapping · replay + validation', () => {
  const originalEnv = process.env.SALA_HITL_RESOLVE_ENABLED
  beforeEach(() => {
    sharedStorage = new InMemoryEventLogStorage()
    process.env.SALA_HITL_RESOLVE_ENABLED = 'true'
  })
  afterEach(() => {
    if (originalEnv === undefined) delete process.env.SALA_HITL_RESOLVE_ENABLED
    else process.env.SALA_HITL_RESOLVE_ENABLED = originalEnv
  })

  it('canon · returns 409 when gate_event_id not in stream', async () => {
    const stream = `stream-${Math.random().toString(36).slice(2)}`
    await seedGatePending(stream)
    const { POST } = await importRoute()
    const res = await POST(
      makeReq(
        {
          source: 'sala',
          tenant_id: TENANT,
          stream_id: stream,
          gate_event_id: 'ffffffff-ffff-ffff-ffff-ffffffffffff',
          outcome: 'approved',
        },
        { 'x-api-key': 'test-key' },
      ),
    )
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toBe('resolve_failed')
  })

  it('canon · returns 409 when replay (gate already resolved)', async () => {
    const stream = `stream-${Math.random().toString(36).slice(2)}`
    const gatePending = await seedGatePending(stream)
    const { POST } = await importRoute()

    const first = await POST(
      makeReq(
        {
          source: 'sala',
          tenant_id: TENANT,
          stream_id: stream,
          gate_event_id: gatePending.event_id,
          outcome: 'approved',
        },
        { 'x-api-key': 'test-key' },
      ),
    )
    expect(first.status).toBe(200)

    const second = await POST(
      makeReq(
        {
          source: 'sala',
          tenant_id: TENANT,
          stream_id: stream,
          gate_event_id: gatePending.event_id,
          outcome: 'approved',
        },
        { 'x-api-key': 'test-key' },
      ),
    )
    expect(second.status).toBe(409)
    const body = await second.json()
    expect(body.error).toBe('resolve_failed')
    expect(body.detail).toMatch(/already has a gate_resolved/)
  })
})

describe('GET /api/sala/hitl/resolve · info endpoint', () => {
  it('canon · returns endpoint metadata describing both body shapes', async () => {
    const { GET } = await importRoute()
    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.endpoint).toBe('/api/sala/hitl/resolve')
    expect(body.body_shapes.sala).toBeDefined()
    expect(body.body_shapes.n8n_mc_inbox).toBeDefined()
    expect(body.feature_flag).toMatch(/SALA_HITL_RESOLVE_ENABLED/)
  })
})
