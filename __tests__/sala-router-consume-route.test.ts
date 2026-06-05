/**
 * Tests · POST /api/sala/router/consume route handler · default-OFF + auth + tick.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  InMemoryEventLogStorage,
  type EventLogStorage,
} from '@/lib/sala-event-log'

let sharedStorage: InMemoryEventLogStorage

vi.mock('@/lib/internal-auth', () => ({
  checkInternalKey: vi.fn((r: Request) => {
    const k = r.headers.get('x-api-key')
    return k === 'test-key'
      ? { ok: true as const }
      : { ok: false as const, reason: 'missing or invalid x-api-key' }
  }),
}))

vi.mock('@/lib/supabase', () => ({
  getSupabaseAdmin: vi.fn(() => ({})),
}))

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
  return import('../src/app/api/sala/router/consume/route')
}

function makeReq(body: unknown = {}, headers: Record<string, string> = {}): Request {
  return new Request('https://example.com/api/sala/router/consume', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

describe('POST /api/sala/router/consume · feature flag (default-OFF)', () => {
  const orig = process.env.SALA_ROUTER_CONSUMER_ENABLED
  beforeEach(() => {
    sharedStorage = new InMemoryEventLogStorage()
    delete process.env.SALA_ROUTER_CONSUMER_ENABLED
  })
  afterEach(() => {
    if (orig === undefined) delete process.env.SALA_ROUTER_CONSUMER_ENABLED
    else process.env.SALA_ROUTER_CONSUMER_ENABLED = orig
  })

  it('returns 503 when flag unset', async () => {
    const { POST } = await importRoute()
    const res = await POST(makeReq())
    expect(res.status).toBe(503)
    const body = await res.json()
    expect(body.code).toBe('flag_disabled')
  })
})

describe('POST /api/sala/router/consume · auth', () => {
  const orig = process.env.SALA_ROUTER_CONSUMER_ENABLED
  beforeEach(() => {
    sharedStorage = new InMemoryEventLogStorage()
    process.env.SALA_ROUTER_CONSUMER_ENABLED = 'true'
  })
  afterEach(() => {
    if (orig === undefined) delete process.env.SALA_ROUTER_CONSUMER_ENABLED
    else process.env.SALA_ROUTER_CONSUMER_ENABLED = orig
  })

  it('returns 401 without x-api-key', async () => {
    const { POST } = await importRoute()
    const res = await POST(makeReq())
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.code).toBe('unauthorized')
  })

  it('returns 401 with wrong x-api-key', async () => {
    const { POST } = await importRoute()
    const res = await POST(makeReq({}, { 'x-api-key': 'wrong' }))
    expect(res.status).toBe(401)
  })
})

describe('POST /api/sala/router/consume · body validation', () => {
  const orig = process.env.SALA_ROUTER_CONSUMER_ENABLED
  beforeEach(() => {
    sharedStorage = new InMemoryEventLogStorage()
    process.env.SALA_ROUTER_CONSUMER_ENABLED = 'true'
  })
  afterEach(() => {
    if (orig === undefined) delete process.env.SALA_ROUTER_CONSUMER_ENABLED
    else process.env.SALA_ROUTER_CONSUMER_ENABLED = orig
  })

  it('returns 400 on invalid JSON', async () => {
    const { POST } = await importRoute()
    const res = await POST(makeReq('not-json{', { 'x-api-key': 'test-key' }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.code).toBe('invalid_body')
  })

  it('accepts empty body (all fields optional)', async () => {
    const { POST } = await importRoute()
    const res = await POST(makeReq({}, { 'x-api-key': 'test-key' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.tick.processed).toBe(0)
  })
})

describe('POST /api/sala/router/consume · happy path · runs one tick', () => {
  const orig = process.env.SALA_ROUTER_CONSUMER_ENABLED
  beforeEach(() => {
    sharedStorage = new InMemoryEventLogStorage()
    process.env.SALA_ROUTER_CONSUMER_ENABLED = 'true'
  })
  afterEach(() => {
    if (orig === undefined) delete process.env.SALA_ROUTER_CONSUMER_ENABLED
    else process.env.SALA_ROUTER_CONSUMER_ENABLED = orig
  })

  it('returns tick result with processed=0 when no pending intake', async () => {
    const { POST } = await importRoute()
    const res = await POST(
      makeReq({ tenant_id: 'naufrago' }, { 'x-api-key': 'test-key' }),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.tick.tick_id).toBeDefined()
    expect(body.tick.processed).toBe(0)
    expect(body.tick.outcomes).toEqual([])
  })
})

describe('GET /api/sala/router/consume · info endpoint', () => {
  it('returns endpoint metadata + canon pointer + chain description', async () => {
    const { GET } = await importRoute()
    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.endpoint).toBe('/api/sala/router/consume')
    expect(body.canon).toMatch(/ESCALADA-Opus/)
    expect(body.chain).toMatch(/ingress.*log.*consumer.*workflow-dispatcher/)
    expect(body.feature_flag).toMatch(/SALA_ROUTER_CONSUMER_ENABLED/)
    expect(body.outcome_kinds).toContain('dispatched_ok')
    expect(body.outcome_kinds).toContain('skipped_dispatcher_off')
  })
})
