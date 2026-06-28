/**
 * Tests · POST /api/sala/ingress · CC#4 worker phase_boundary receiver.
 *
 * Covers · feature flag · auth (dedicated key + INTERNAL fallback) ·
 * body shape validation · reconciliation · always-200 contract.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  InMemoryEventLogStorage,
  type EventLogStorage,
} from '@/lib/sala-event-log'

vi.mock('@/lib/supabase', () => ({
  getSupabaseAdmin: vi.fn(() => ({})),
}))

let sharedStorage: InMemoryEventLogStorage

vi.mock('@/lib/sala-event-log', async () => {
  const actual = await vi.importActual<typeof import('@/lib/sala-event-log')>(
    '@/lib/sala-event-log',
  )
  return {
    ...actual,
    SupabaseEventLogStorage: class FakeStorage implements EventLogStorage {
      insert(input: Parameters<EventLogStorage['insert']>[0]) {
        return sharedStorage.insert(input)
      }
      select(filters: Parameters<EventLogStorage['select']>[0]) {
        return sharedStorage.select(filters)
      }
      findByIdempotencyKey(tenant_id: string, idempotency_key: string) {
        return sharedStorage.findByIdempotencyKey(tenant_id, idempotency_key)
      }
    },
  }
})

// Silence the Slack alert so tests don't try to fetch().
vi.mock('@/lib/sala-journey-dispatch/reconciliation', async () => {
  const actual = await vi.importActual<
    typeof import('@/lib/sala-journey-dispatch/reconciliation')
  >('@/lib/sala-journey-dispatch/reconciliation')
  return {
    ...actual,
    postReconciliationAlert: vi.fn(async () => {}),
  }
})

async function importRoute() {
  return import('../src/app/api/sala/ingress/route')
}

const TENANT = '11111111-1111-1111-1111-111111111111'
const STREAM = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'

function makeReq(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request('https://example.com/api/sala/ingress', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    event_type: 'phase_boundary',
    _sala_correlation_id: 'corr-1',
    _journey_id: STREAM,
    phase_name: 'INTAKE',
    phase_state: 'completed',
    worker_id: 'LyVoKcrypS5uLyuu',
    tenant_id: TENANT,
    client_id: 'c-naufrago',
    ts: '2026-06-05T15:00:00Z',
    ...overrides,
  }
}

describe('POST /api/sala/ingress · feature flag (default-OFF) · ALWAYS 200', () => {
  const origFlag = process.env.SALA_WORKFLOW_DISPATCH_ENABLED
  const origKey = process.env.SALA_INGRESS_API_KEY
  beforeEach(() => {
    sharedStorage = new InMemoryEventLogStorage()
    delete process.env.SALA_WORKFLOW_DISPATCH_ENABLED
    process.env.SALA_INGRESS_API_KEY = 'test-ingress-key'
  })
  afterEach(() => {
    if (origFlag === undefined) delete process.env.SALA_WORKFLOW_DISPATCH_ENABLED
    else process.env.SALA_WORKFLOW_DISPATCH_ENABLED = origFlag
    if (origKey === undefined) delete process.env.SALA_INGRESS_API_KEY
    else process.env.SALA_INGRESS_API_KEY = origKey
  })

  it('canon · flag off → 200 + ok:false code:sala_workflow_dispatch_disabled', async () => {
    const { POST } = await importRoute()
    const res = await POST(makeReq(validBody()))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(false)
    expect(body.code).toBe('sala_workflow_dispatch_disabled')
  })
})

describe('POST /api/sala/ingress · auth · ALWAYS 200', () => {
  const origFlag = process.env.SALA_WORKFLOW_DISPATCH_ENABLED
  const origKey = process.env.SALA_INGRESS_API_KEY
  const origInternal = process.env.INTERNAL_API_KEY
  beforeEach(() => {
    sharedStorage = new InMemoryEventLogStorage()
    process.env.SALA_WORKFLOW_DISPATCH_ENABLED = 'true'
    process.env.SALA_INGRESS_API_KEY = 'test-ingress-key'
    process.env.INTERNAL_API_KEY = 'test-internal-key'
  })
  afterEach(() => {
    if (origFlag === undefined) delete process.env.SALA_WORKFLOW_DISPATCH_ENABLED
    else process.env.SALA_WORKFLOW_DISPATCH_ENABLED = origFlag
    if (origKey === undefined) delete process.env.SALA_INGRESS_API_KEY
    else process.env.SALA_INGRESS_API_KEY = origKey
    if (origInternal === undefined) delete process.env.INTERNAL_API_KEY
    else process.env.INTERNAL_API_KEY = origInternal
  })

  it('canon · missing x-api-key → 200 + ok:false code:unauthorized', async () => {
    const { POST } = await importRoute()
    const res = await POST(makeReq(validBody()))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(false)
    expect(body.code).toBe('unauthorized')
  })

  it('canon · wrong key → 200 + ok:false code:unauthorized', async () => {
    const { POST } = await importRoute()
    const res = await POST(makeReq(validBody(), { 'x-api-key': 'wrong' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(false)
    expect(body.code).toBe('unauthorized')
  })

  it('canon · dedicated key accepted', async () => {
    const { POST } = await importRoute()
    const res = await POST(
      makeReq(validBody(), { 'x-api-key': 'test-ingress-key' }),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.via).toBe('dedicated')
  })

  it('canon · INTERNAL_API_KEY fallback accepted', async () => {
    delete process.env.SALA_INGRESS_API_KEY
    const { POST } = await importRoute()
    const res = await POST(
      makeReq(validBody(), { 'x-api-key': 'test-internal-key' }),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.via).toBe('fallback')
  })
})

describe('POST /api/sala/ingress · body validation · ALWAYS 200', () => {
  const origFlag = process.env.SALA_WORKFLOW_DISPATCH_ENABLED
  beforeEach(() => {
    sharedStorage = new InMemoryEventLogStorage()
    process.env.SALA_WORKFLOW_DISPATCH_ENABLED = 'true'
    process.env.SALA_INGRESS_API_KEY = 'test-ingress-key'
  })
  afterEach(() => {
    if (origFlag === undefined) delete process.env.SALA_WORKFLOW_DISPATCH_ENABLED
    else process.env.SALA_WORKFLOW_DISPATCH_ENABLED = origFlag
  })

  it('canon · invalid JSON → invalid_json', async () => {
    const { POST } = await importRoute()
    const res = await POST(
      makeReq('not-json{', { 'x-api-key': 'test-ingress-key' }),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.code).toBe('invalid_json')
  })

  it('canon · wrong event_type → invalid_event_type', async () => {
    const { POST } = await importRoute()
    const res = await POST(
      makeReq(validBody({ event_type: 'something_else' }), {
        'x-api-key': 'test-ingress-key',
      }),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.code).toBe('invalid_event_type')
  })

  it('canon · invalid phase_state → invalid_body', async () => {
    const { POST } = await importRoute()
    const res = await POST(
      makeReq(validBody({ phase_state: 'midway' }), {
        'x-api-key': 'test-ingress-key',
      }),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.code).toBe('invalid_body')
  })

  it('canon · non-UUID tenant_id → invalid_body', async () => {
    const { POST } = await importRoute()
    const res = await POST(
      makeReq(validBody({ tenant_id: 'not-uuid' }), {
        'x-api-key': 'test-ingress-key',
      }),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.code).toBe('invalid_body')
  })
})

describe('POST /api/sala/ingress · happy path · reconcile + append', () => {
  const origFlag = process.env.SALA_WORKFLOW_DISPATCH_ENABLED
  beforeEach(() => {
    sharedStorage = new InMemoryEventLogStorage()
    process.env.SALA_WORKFLOW_DISPATCH_ENABLED = 'true'
    process.env.SALA_INGRESS_API_KEY = 'test-ingress-key'
  })
  afterEach(() => {
    if (origFlag === undefined) delete process.env.SALA_WORKFLOW_DISPATCH_ENABLED
    else process.env.SALA_WORKFLOW_DISPATCH_ENABLED = origFlag
  })

  it('canon · INTAKE completed → event appended · reconcile match', async () => {
    const { POST } = await importRoute()
    const res = await POST(
      makeReq(validBody(), { 'x-api-key': 'test-ingress-key' }),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.event_id).toBeDefined()
    expect(body.reconcile.kind).toBe('match')
    const events = await sharedStorage.select({
      tenant_id: TENANT,
      stream_id: STREAM,
    })
    expect(events.length).toBe(1)
    expect(events[0].step_id).toBe('INTAKE')
    expect(events[0].event_type).toBe('step_completed')
  })

  it('canon · phase_state=started → event_type=step_started · running', async () => {
    const { POST } = await importRoute()
    const res = await POST(
      makeReq(validBody({ phase_state: 'started' }), {
        'x-api-key': 'test-ingress-key',
      }),
    )
    expect(res.status).toBe(200)
    const events = await sharedStorage.select({
      tenant_id: TENANT,
      stream_id: STREAM,
    })
    expect(events[0].event_type).toBe('step_started')
    expect(events[0].step_state).toBe('running')
  })

  it('R1 · out-of-order phase still appends · NEVER halts · kind=match (order_tolerant)', async () => {
    // R1 (2026-06-28): ingress now uses order_tolerant=true because the
    // worker LyVoKcrypS5uLyuu has a parallel DAG. Any known phase = match.
    // Previously expected 'skipped_ahead' — now expect 'match'.
    const { POST } = await importRoute()
    const res = await POST(
      makeReq(validBody({ phase_name: 'SCHEDULING' }), {
        'x-api-key': 'test-ingress-key',
      }),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.reconcile.kind).toBe('match')
    const events = await sharedStorage.select({
      tenant_id: TENANT,
      stream_id: STREAM,
    })
    expect(events.length).toBe(1)
  })

  it('canon · 2nd phase after 1st recorded · match · expected_next advances', async () => {
    const { POST } = await importRoute()
    await POST(makeReq(validBody(), { 'x-api-key': 'test-ingress-key' }))
    const res = await POST(
      makeReq(
        validBody({ phase_name: 'DISCOVERY', _sala_correlation_id: 'corr-2' }),
        { 'x-api-key': 'test-ingress-key' },
      ),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.reconcile.kind).toBe('match')
    expect(body.reconcile.expected_next).toBe('WORKSPACE')
  })
})

describe('GET /api/sala/ingress · info endpoint', () => {
  it('canon · returns endpoint metadata + contract pointer', async () => {
    const { GET } = await importRoute()
    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.endpoint).toBe('/api/sala/ingress')
    expect(body.contract).toMatch(/MODELB-ADAPTER/)
    expect(body.feature_flag).toMatch(/SALA_WORKFLOW_DISPATCH_ENABLED/)
  })
})
