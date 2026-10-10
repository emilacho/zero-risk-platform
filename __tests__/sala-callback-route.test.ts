/**
 * Tests · POST /api/sala/callback · CC#4 worker run_completed receiver.
 *
 * Covers · feature flag · auth (dedicated key + INTERNAL fallback) ·
 * body shape validation · terminal append · always-200 contract.
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

async function importRoute() {
  return import('../src/app/api/sala/callback/route')
}

const TENANT = '11111111-1111-1111-1111-111111111111'
const STREAM = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'

function makeReq(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request('https://example.com/api/sala/callback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    event_type: 'run_completed',
    _sala_correlation_id: 'corr-1',
    _journey_id: STREAM,
    worker_id: 'LyVoKcrypS5uLyuu',
    worker_name: 'Client Onboarding E2E v2',
    tenant_id: TENANT,
    client_id: 'c-naufrago',
    summary: { notion_workspace: 'created' },
    ts: '2026-06-05T15:30:00Z',
    ...overrides,
  }
}

describe('POST /api/sala/callback · feature flag (default-OFF)', () => {
  const orig = process.env.SALA_WORKFLOW_DISPATCH_ENABLED
  beforeEach(() => {
    sharedStorage = new InMemoryEventLogStorage()
    delete process.env.SALA_WORKFLOW_DISPATCH_ENABLED
    process.env.SALA_CALLBACK_API_KEY = 'test-callback-key'
  })
  afterEach(() => {
    if (orig === undefined) delete process.env.SALA_WORKFLOW_DISPATCH_ENABLED
    else process.env.SALA_WORKFLOW_DISPATCH_ENABLED = orig
    delete process.env.SALA_CALLBACK_API_KEY
  })

  it('canon · flag off → 200 + ok:false code:disabled', async () => {
    const { POST } = await importRoute()
    const res = await POST(makeReq(validBody()))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(false)
    expect(body.code).toBe('sala_workflow_dispatch_disabled')
  })
})

describe('POST /api/sala/callback · auth', () => {
  const orig = process.env.SALA_WORKFLOW_DISPATCH_ENABLED
  const origInternal = process.env.INTERNAL_API_KEY
  beforeEach(() => {
    sharedStorage = new InMemoryEventLogStorage()
    process.env.SALA_WORKFLOW_DISPATCH_ENABLED = 'true'
    process.env.SALA_CALLBACK_API_KEY = 'test-callback-key'
    process.env.INTERNAL_API_KEY = 'test-internal-key'
  })
  afterEach(() => {
    if (orig === undefined) delete process.env.SALA_WORKFLOW_DISPATCH_ENABLED
    else process.env.SALA_WORKFLOW_DISPATCH_ENABLED = orig
    delete process.env.SALA_CALLBACK_API_KEY
    if (origInternal === undefined) delete process.env.INTERNAL_API_KEY
    else process.env.INTERNAL_API_KEY = origInternal
  })

  it('canon · missing key → 200 + unauthorized', async () => {
    const { POST } = await importRoute()
    const res = await POST(makeReq(validBody()))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.code).toBe('unauthorized')
  })

  it('canon · dedicated key accepted', async () => {
    const { POST } = await importRoute()
    const res = await POST(
      makeReq(validBody(), { 'x-api-key': 'test-callback-key' }),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.via).toBe('dedicated')
  })

  it('canon · INTERNAL_API_KEY fallback accepted', async () => {
    delete process.env.SALA_CALLBACK_API_KEY
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

describe('POST /api/sala/callback · body validation', () => {
  const orig = process.env.SALA_WORKFLOW_DISPATCH_ENABLED
  beforeEach(() => {
    sharedStorage = new InMemoryEventLogStorage()
    process.env.SALA_WORKFLOW_DISPATCH_ENABLED = 'true'
    process.env.SALA_CALLBACK_API_KEY = 'test-callback-key'
  })
  afterEach(() => {
    if (orig === undefined) delete process.env.SALA_WORKFLOW_DISPATCH_ENABLED
    else process.env.SALA_WORKFLOW_DISPATCH_ENABLED = orig
    delete process.env.SALA_CALLBACK_API_KEY
  })

  it('canon · wrong event_type → invalid_event_type', async () => {
    const { POST } = await importRoute()
    const res = await POST(
      makeReq(validBody({ event_type: 'not_run_completed' }), {
        'x-api-key': 'test-callback-key',
      }),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.code).toBe('invalid_event_type')
  })

  it('canon · non-UUID tenant → invalid_body', async () => {
    const { POST } = await importRoute()
    const res = await POST(
      makeReq(validBody({ tenant_id: 'not-uuid' }), {
        'x-api-key': 'test-callback-key',
      }),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.code).toBe('invalid_body')
  })
})

describe('POST /api/sala/callback · happy path · terminal append', () => {
  const orig = process.env.SALA_WORKFLOW_DISPATCH_ENABLED
  beforeEach(() => {
    sharedStorage = new InMemoryEventLogStorage()
    process.env.SALA_WORKFLOW_DISPATCH_ENABLED = 'true'
    process.env.SALA_CALLBACK_API_KEY = 'test-callback-key'
  })
  afterEach(() => {
    if (orig === undefined) delete process.env.SALA_WORKFLOW_DISPATCH_ENABLED
    else process.env.SALA_WORKFLOW_DISPATCH_ENABLED = orig
    delete process.env.SALA_CALLBACK_API_KEY
  })

  it('canon · run_completed → step_completed appended with step_id=journey_completed', async () => {
    const { POST } = await importRoute()
    const res = await POST(
      makeReq(validBody(), { 'x-api-key': 'test-callback-key' }),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.event_id).toBeDefined()
    const events = await sharedStorage.select({
      tenant_id: TENANT,
      stream_id: STREAM,
    })
    expect(events.length).toBe(1)
    expect(events[0].step_id).toBe('journey_completed')
    expect(events[0].event_type).toBe('step_completed')
    expect(events[0].step_state).toBe('done')
    expect(events[0].payload.terminal).toBe(true)
  })

  it('canon · summary preserved in payload', async () => {
    const { POST } = await importRoute()
    const res = await POST(
      makeReq(
        validBody({ summary: { notion: 'ok', handoff_score: 0.85 } }),
        { 'x-api-key': 'test-callback-key' },
      ),
    )
    expect(res.status).toBe(200)
    const events = await sharedStorage.select({
      tenant_id: TENANT,
      stream_id: STREAM,
    })
    expect(events[0].payload.summary).toEqual({ notion: 'ok', handoff_score: 0.85 })
  })

  it('🔴 el asiento de cierre lleva el journey REAL del flujo (brief → BRIEF · planeación → PRODUCE) y ONBOARD sólo si es el alta o un flujo desconocido', async () => {
    const { POST } = await importRoute()
    const casos: Array<[string, string, string]> = [
      ['PQdIgbuFexuBsoh8', 'corr-brief', 'BRIEF'],
      ['X9F0zp6LQ2xGEYVS', 'corr-plan', 'PRODUCE'],
      ['LyVoKcrypS5uLyuu', 'corr-alta', 'ONBOARD'],
      ['flujo-desconocido', 'corr-otro', 'ONBOARD'],
    ]
    for (const [i, [worker_id, corr, esperado]] of casos.entries()) {
      const stream = `bbbbbbbb-bbbb-bbbb-bbbb-${String(i).padStart(12, '0')}`
      const res = await POST(makeReq(validBody({ worker_id, _sala_correlation_id: corr, _journey_id: stream }), { 'x-api-key': 'test-callback-key' }))
      expect((await res.json()).ok, worker_id).toBe(true)
      const ev = await sharedStorage.select({ tenant_id: TENANT, stream_id: stream })
      expect(ev[0].journey_type, worker_id).toBe(esperado)
    }
  })

  it('canon · 2x same correlation_id → idempotency_key collision', async () => {
    const { POST } = await importRoute()
    await POST(makeReq(validBody(), { 'x-api-key': 'test-callback-key' }))
    const res2 = await POST(
      makeReq(validBody(), { 'x-api-key': 'test-callback-key' }),
    )
    expect(res2.status).toBe(200)
    // The dedup happens at the storage UNIQUE constraint · either the
    // second call returns ok with the SAME event_id (dedup match), or
    // the InMemoryStorage's behavior · in either case the appended set
    // has at most 1 row for the same idempotency_key.
    const events = await sharedStorage.select({
      tenant_id: TENANT,
      stream_id: STREAM,
    })
    expect(events.length).toBe(1)
  })
})

describe('🔴 relevo 62 · dos flujos con la MISMA correlación el MISMO día no se tragan uno al otro (medido en la prueba desde cero, ejecución 172229)', () => {
  const orig = process.env.SALA_WORKFLOW_DISPATCH_ENABLED
  beforeEach(() => {
    sharedStorage = new InMemoryEventLogStorage()
    process.env.SALA_WORKFLOW_DISPATCH_ENABLED = 'true'
    process.env.SALA_CALLBACK_API_KEY = 'test-callback-key'
  })
  afterEach(() => {
    if (orig === undefined) delete process.env.SALA_WORKFLOW_DISPATCH_ENABLED
    else process.env.SALA_WORKFLOW_DISPATCH_ENABLED = orig
    delete process.env.SALA_CALLBACK_API_KEY
  })
  const ALTA = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
  const PLAN = 'dddddddd-dddd-dddd-dddd-dddddddddddd'

  it('el cierre de la alta (ONBOARD) y el de la planeación (PRODUCE), con la misma correlación y fecha, dejan DOS asientos y el segundo es del flujo que vuelve', async () => {
    const { POST } = await importRoute()
    const r1 = await (await POST(makeReq(validBody({ worker_id: 'LyVoKcrypS5uLyuu', _journey_id: ALTA, ts: '2026-10-10T13:26:38Z' }), { 'x-api-key': 'test-callback-key' }))).json()
    const r2 = await (await POST(makeReq(validBody({ worker_id: 'X9F0zp6LQ2xGEYVS', _journey_id: PLAN, ts: '2026-10-10T13:39:15Z' }), { 'x-api-key': 'test-callback-key' }))).json()
    expect(r1.ok).toBe(true); expect(r2.ok).toBe(true)
    expect(r2.event_id).not.toBe(r1.event_id) // antes devolvía el id del primero y NO escribía nada
    const alta = await sharedStorage.select({ tenant_id: TENANT, stream_id: ALTA })
    const plan = await sharedStorage.select({ tenant_id: TENANT, stream_id: PLAN })
    expect(alta).toHaveLength(1); expect(plan).toHaveLength(1)
    expect(alta[0].journey_type).toBe('ONBOARD'); expect(plan[0].journey_type).toBe('PRODUCE')
    expect(plan[0].step_id).toBe('journey_completed')
  })

  it('la repetición del MISMO flujo (misma correlación y mismo journey) sigue siendo UNA sola: el reintento de un cable no duplica', async () => {
    const { POST } = await importRoute()
    const cuerpo = validBody({ worker_id: 'X9F0zp6LQ2xGEYVS', _journey_id: PLAN, ts: '2026-10-10T13:39:15Z' })
    const a = await (await POST(makeReq(cuerpo, { 'x-api-key': 'test-callback-key' }))).json()
    const b = await (await POST(makeReq(cuerpo, { 'x-api-key': 'test-callback-key' }))).json()
    expect(b.event_id).toBe(a.event_id)
    expect(await sharedStorage.select({ tenant_id: TENANT, stream_id: PLAN })).toHaveLength(1)
  })

  it('misma correlación, mismo journey y mismo día pero OTRO flujo trabajador: son dos cierres distintos', async () => {
    const { POST } = await importRoute()
    await POST(makeReq(validBody({ worker_id: 'X9F0zp6LQ2xGEYVS', _journey_id: PLAN }), { 'x-api-key': 'test-callback-key' }))
    await POST(makeReq(validBody({ worker_id: 'PQdIgbuFexuBsoh8', _journey_id: PLAN }), { 'x-api-key': 'test-callback-key' }))
    expect(await sharedStorage.select({ tenant_id: TENANT, stream_id: PLAN })).toHaveLength(2)
  })
})

describe('GET /api/sala/callback · info', () => {
  it('canon · returns endpoint metadata + contract pointer', async () => {
    const { GET } = await importRoute()
    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.endpoint).toBe('/api/sala/callback')
    expect(body.contract).toMatch(/MODELB-ADAPTER/)
    expect(body.dedup_key).toBe('_sala_correlation_id + _journey_id + worker_id')
  })
})
