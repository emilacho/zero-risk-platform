/**
 * Tests · POST /api/sala/intake route handler · default-OFF + happy + refuse paths.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  InMemoryEventLogStorage,
  type EventLogStorage,
} from '@/lib/sala-event-log'
import {
  InMemoryIngressTables,
  type IngressTablesAdapter,
} from '@/lib/sala-ingress'

let sharedTables: InMemoryIngressTables
let sharedStorage: InMemoryEventLogStorage

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

vi.mock('@/lib/sala-ingress/supabase-adapter', () => ({
  SupabaseIngressTables: class FakeTables implements IngressTablesAdapter {
    getSource(source: string) {
      return sharedTables.getSource(source)
    }
    getRoutingRule(source: string, intent: string) {
      return sharedTables.getRoutingRule(source, intent)
    }
  },
}))

async function importRoute() {
  return import('../src/app/api/sala/intake/route')
}

function makeReq(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request('https://example.com/api/sala/intake', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

function validBody() {
  return {
    source: 'emilio-manual',
    intent: 'onboard',
    payload: { client_name: 'Naufrago' },
    idempotency_key: 'deal-1',
    logical_period: '2026-W23',
    tenant_id: 'naufrago',
    client_id: 'd69100b5-8ad7-4bb0-908c-68b5544065dc',
  }
}

beforeEach(() => {
  sharedTables = new InMemoryIngressTables()
    .seedSource({
      source: 'emilio-manual',
      tier: 'A',
      auth_method: 'internal_key',
      auth_secret_env_var: null,
      intents_allowed: ['onboard'],
      description: null,
      active: true,
    })
    .seedRule({
      id: 'rule-1',
      source: 'emilio-manual',
      intent: 'onboard',
      journey_type: 'ONBOARD',
      worker_workflow_id: 'LyVoKcrypS5uLyuu',
      active: true,
      priority: 100,
      description: null,
    })
  sharedStorage = new InMemoryEventLogStorage()
})

describe('POST /api/sala/intake · feature flag (default-OFF)', () => {
  const orig = process.env.SALA_INTAKE_ENABLED
  beforeEach(() => {
    delete process.env.SALA_INTAKE_ENABLED
  })
  afterEach(() => {
    if (orig === undefined) delete process.env.SALA_INTAKE_ENABLED
    else process.env.SALA_INTAKE_ENABLED = orig
  })

  it('returns 503 flag_disabled when env unset', async () => {
    const { POST } = await importRoute()
    const res = await POST(makeReq(validBody()))
    expect(res.status).toBe(503)
    const body = await res.json()
    expect(body.code).toBe('flag_disabled')
  })
})

describe('POST /api/sala/intake · enabled · refuse cases (200 with code)', () => {
  const orig = process.env.SALA_INTAKE_ENABLED
  const origKey = process.env.INTERNAL_API_KEY
  beforeEach(() => {
    process.env.SALA_INTAKE_ENABLED = 'true'
    process.env.INTERNAL_API_KEY = 'test-internal'
  })
  afterEach(() => {
    if (orig === undefined) delete process.env.SALA_INTAKE_ENABLED
    else process.env.SALA_INTAKE_ENABLED = orig
    if (origKey === undefined) delete process.env.INTERNAL_API_KEY
    else process.env.INTERNAL_API_KEY = origKey
  })

  it('refuses invalid JSON body', async () => {
    const { POST } = await importRoute()
    const res = await POST(makeReq('not-json{'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(false)
    expect(body.code).toBe('invalid_envelope')
  })

  it('refuses missing source', async () => {
    const { POST } = await importRoute()
    const b = validBody()
    delete (b as Record<string, unknown>).source
    const res = await POST(makeReq(b, { 'x-api-key': 'test-internal' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.code).toBe('invalid_envelope')
  })

  it('refuses unknown source', async () => {
    const { POST } = await importRoute()
    const res = await POST(
      makeReq(
        { ...validBody(), source: 'nope/no-such' },
        { 'x-api-key': 'test-internal' },
      ),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.code).toBe('unknown_source')
  })

  it('refuses unauthorized when key wrong', async () => {
    const { POST } = await importRoute()
    const res = await POST(
      makeReq(validBody(), { 'x-api-key': 'wrong-key' }),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.code).toBe('unauthorized')
  })

  it('refuses no_routing_rule when (source, intent) has no rule', async () => {
    sharedTables = new InMemoryIngressTables().seedSource({
      source: 'emilio-manual',
      tier: 'A',
      auth_method: 'internal_key',
      auth_secret_env_var: null,
      intents_allowed: ['onboard', 'lonely-intent'],
      description: null,
      active: true,
    })
    const { POST } = await importRoute()
    const res = await POST(
      makeReq(
        { ...validBody(), intent: 'lonely-intent' },
        { 'x-api-key': 'test-internal' },
      ),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.code).toBe('no_routing_rule')
  })
})

describe('POST /api/sala/intake · enabled · accepted path', () => {
  const orig = process.env.SALA_INTAKE_ENABLED
  const origKey = process.env.INTERNAL_API_KEY
  beforeEach(() => {
    process.env.SALA_INTAKE_ENABLED = 'true'
    process.env.INTERNAL_API_KEY = 'test-internal'
  })
  afterEach(() => {
    if (orig === undefined) delete process.env.SALA_INTAKE_ENABLED
    else process.env.SALA_INTAKE_ENABLED = orig
    if (origKey === undefined) delete process.env.INTERNAL_API_KEY
    else process.env.INTERNAL_API_KEY = origKey
  })

  it('accepts canonical Náufrago emilio-manual envelope', async () => {
    const { POST } = await importRoute()
    const res = await POST(
      makeReq(validBody(), { 'x-api-key': 'test-internal' }),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.kind).toBe('accepted')
    expect(body.journey_type).toBe('ONBOARD')
    expect(body.worker_workflow_id).toBe('LyVoKcrypS5uLyuu')
    expect(body.stream_id.startsWith('sala/v1/')).toBe(true)
    expect(body.inserted).toBe(true)
  })

  it('returns duplicate on replay (same envelope twice)', async () => {
    const { POST } = await importRoute()
    const headers = { 'x-api-key': 'test-internal' }
    await POST(makeReq(validBody(), headers))
    const res2 = await POST(makeReq(validBody(), headers))
    expect(res2.status).toBe(200)
    const body = await res2.json()
    expect(body.kind).toBe('duplicate')
    expect((await sharedStorage.select({ tenant_id: 'naufrago' })).length).toBe(1)
  })
})

describe('GET /api/sala/intake · info', () => {
  it('returns endpoint metadata + canon pointer', async () => {
    const { GET } = await importRoute()
    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.endpoint).toBe('/api/sala/intake')
    expect(body.canon).toMatch(/ESCALADA-Opus-arquitectura-entradas/)
    expect(body.feature_flag).toMatch(/SALA_INTAKE_ENABLED/)
    expect(body.auth_per_tier.A_internal_key).toMatch(/INTERNAL_API_KEY/)
    expect(body.auth_per_tier.B_hmac).toMatch(/sha256/)
  })
})
