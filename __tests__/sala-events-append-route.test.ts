/**
 * Tests · POST /api/sala/events/append · Model B OBSERVE receiver.
 *
 * Exercises auth + feature flag + body validation + reconciliation
 * + append-to-log + Slack alert (mocked) + GET info endpoint.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  InMemoryEventLogStorage,
  type EventLogStorage,
} from '@/lib/sala-event-log'

// ─── Mocks · same canon pattern as resolve route tests ───
vi.mock('@/lib/internal-auth', () => ({
  checkInternalOrAdmin: vi.fn(async (r: Request) => {
    if (r.headers.get('x-api-key') === 'test-key') {
      return { ok: true, via: 'internal' as const }
    }
    return { ok: false, reason: 'no auth' }
  }),
}))

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
    SupabaseEventLogStorage: class FakeSupabaseStorage implements EventLogStorage {
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

// Mock Slack alert side-effect so tests don't try to fetch().
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
  return import('../src/app/api/sala/events/append/route')
}

const TENANT = '11111111-1111-1111-1111-111111111111'
const CLIENT = 'c-naufrago-stub'
const STREAM = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'

function makeReq(
  body: unknown,
  headers: Record<string, string> = {},
): Request {
  return new Request('https://example.com/api/sala/events/append', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

describe('POST /api/sala/events/append · feature flag (default-OFF)', () => {
  const orig = process.env.SALA_WORKFLOW_DISPATCH_ENABLED
  beforeEach(() => {
    sharedStorage = new InMemoryEventLogStorage()
    delete process.env.SALA_WORKFLOW_DISPATCH_ENABLED
  })
  afterEach(() => {
    if (orig === undefined) delete process.env.SALA_WORKFLOW_DISPATCH_ENABLED
    else process.env.SALA_WORKFLOW_DISPATCH_ENABLED = orig
  })

  it('canon · 503 when flag not set', async () => {
    const { POST } = await importRoute()
    const res = await POST(
      makeReq({
        tenant_id: TENANT,
        client_id: CLIENT,
        stream_id: STREAM,
        journey_type: 'ONBOARD',
        phase_step_id: 'INTAKE',
      }),
    )
    expect(res.status).toBe(503)
    const body = await res.json()
    expect(body.error).toBe('sala_workflow_dispatch_disabled')
  })
})

describe('POST /api/sala/events/append · auth + body validation', () => {
  const orig = process.env.SALA_WORKFLOW_DISPATCH_ENABLED
  beforeEach(() => {
    sharedStorage = new InMemoryEventLogStorage()
    process.env.SALA_WORKFLOW_DISPATCH_ENABLED = 'true'
  })
  afterEach(() => {
    if (orig === undefined) delete process.env.SALA_WORKFLOW_DISPATCH_ENABLED
    else process.env.SALA_WORKFLOW_DISPATCH_ENABLED = orig
  })

  it('canon · 401 without auth', async () => {
    const { POST } = await importRoute()
    const res = await POST(
      makeReq({
        tenant_id: TENANT,
        client_id: CLIENT,
        stream_id: STREAM,
        journey_type: 'ONBOARD',
        phase_step_id: 'INTAKE',
      }),
    )
    expect(res.status).toBe(401)
  })

  it('canon · 400 on invalid JSON', async () => {
    const { POST } = await importRoute()
    const res = await POST(makeReq('not-json{', { 'x-api-key': 'test-key' }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('invalid_json')
  })

  it('canon · 400 on missing tenant_id', async () => {
    const { POST } = await importRoute()
    const res = await POST(
      makeReq({ stream_id: STREAM, journey_type: 'ONBOARD', phase_step_id: 'x' }, { 'x-api-key': 'test-key' }),
    )
    expect(res.status).toBe(400)
  })

  it('canon · 400 on invalid journey_type', async () => {
    const { POST } = await importRoute()
    const res = await POST(
      makeReq(
        {
          tenant_id: TENANT,
          client_id: CLIENT,
          stream_id: STREAM,
          journey_type: 'MYSTERY',
          phase_step_id: 'x',
        },
        { 'x-api-key': 'test-key' },
      ),
    )
    expect(res.status).toBe(400)
  })

  it('canon · 409 when journey is not mapped to a worker', async () => {
    const { POST } = await importRoute()
    const res = await POST(
      makeReq(
        {
          tenant_id: TENANT,
          client_id: CLIENT,
          stream_id: STREAM,
          journey_type: 'PRODUCE', // unmapped
          phase_step_id: 'phase_1',
        },
        { 'x-api-key': 'test-key' },
      ),
    )
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toBe('journey_not_mapped')
  })
})

describe('POST /api/sala/events/append · reconcile + append happy path', () => {
  const orig = process.env.SALA_WORKFLOW_DISPATCH_ENABLED
  beforeEach(() => {
    sharedStorage = new InMemoryEventLogStorage()
    process.env.SALA_WORKFLOW_DISPATCH_ENABLED = 'true'
  })
  afterEach(() => {
    if (orig === undefined) delete process.env.SALA_WORKFLOW_DISPATCH_ENABLED
    else process.env.SALA_WORKFLOW_DISPATCH_ENABLED = orig
  })

  it('canon · first phase boundary → match + appended', async () => {
    const { POST } = await importRoute()
    const res = await POST(
      makeReq(
        {
          tenant_id: TENANT,
          client_id: CLIENT,
          stream_id: STREAM,
          journey_type: 'ONBOARD',
          phase_step_id: 'INTAKE',
        },
        { 'x-api-key': 'test-key' },
      ),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.reconcile.kind).toBe('match')
    expect(body.appended_event_id).toBeDefined()
    const events = await sharedStorage.select({ tenant_id: TENANT, stream_id: STREAM })
    expect(events.length).toBe(1)
    expect(events[0].step_id).toBe('INTAKE')
  })

  it('canon · skipped_ahead is appended AND reported (NEVER halts)', async () => {
    const { POST } = await importRoute()
    const res = await POST(
      makeReq(
        {
          tenant_id: TENANT,
          client_id: CLIENT,
          stream_id: STREAM,
          journey_type: 'ONBOARD',
          phase_step_id: 'SCHEDULING', // skipped 3 ahead
        },
        { 'x-api-key': 'test-key' },
      ),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.reconcile.kind).toBe('skipped_ahead')
    expect(body.reconcile.delta).toBe(3)
    // STILL appended despite mismatch (observe · NO halt)
    const events = await sharedStorage.select({ tenant_id: TENANT, stream_id: STREAM })
    expect(events.length).toBe(1)
  })

  it('canon · unknown_phase still appends + reports', async () => {
    const { POST } = await importRoute()
    const res = await POST(
      makeReq(
        {
          tenant_id: TENANT,
          client_id: CLIENT,
          stream_id: STREAM,
          journey_type: 'ONBOARD',
          phase_step_id: 'MADE_UP_PHASE',
        },
        { 'x-api-key': 'test-key' },
      ),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.reconcile.kind).toBe('unknown_phase')
    const events = await sharedStorage.select({ tenant_id: TENANT, stream_id: STREAM })
    expect(events.length).toBe(1)
  })

  it('canon · 2nd phase after 1st recorded → match · expected_next advances', async () => {
    const { POST } = await importRoute()
    await POST(
      makeReq(
        {
          tenant_id: TENANT,
          client_id: CLIENT,
          stream_id: STREAM,
          journey_type: 'ONBOARD',
          phase_step_id: 'INTAKE',
        },
        { 'x-api-key': 'test-key' },
      ),
    )
    const res2 = await POST(
      makeReq(
        {
          tenant_id: TENANT,
          client_id: CLIENT,
          stream_id: STREAM,
          journey_type: 'ONBOARD',
          phase_step_id: 'DISCOVERY',
        },
        { 'x-api-key': 'test-key' },
      ),
    )
    expect(res2.status).toBe(200)
    const body = await res2.json()
    expect(body.reconcile.kind).toBe('match')
    expect(body.reconcile.expected_next).toBe('WORKSPACE')
  })
})

describe('GET /api/sala/events/append · info', () => {
  it('canon · returns endpoint metadata', async () => {
    const { GET } = await importRoute()
    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.endpoint).toBe('/api/sala/events/append')
    expect(body.feature_flag).toMatch(/SALA_WORKFLOW_DISPATCH_ENABLED/)
    expect(body.behavior.match).toMatch(/append/)
    expect(body.behavior.mismatch).toMatch(/NEVER halt/)
  })
})
