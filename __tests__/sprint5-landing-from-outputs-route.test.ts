/**
 * Sprint 5 Track B · /api/cascade/landing-from-outputs route tests.
 *
 * Verifies · INTERNAL_API_KEY gate · validation · UPSERT path · response shape.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const supabaseMockState: { upsertResp: { data: unknown; error: unknown } } = {
  upsertResp: { data: { id: 'landing-uuid-1', slug: 'test-abc123', title: 'TestCo · campaign', is_active: true }, error: null },
}

function chainable() {
  return {
    from: () => ({
      upsert: () => ({
        select: () => ({
          single: () => Promise.resolve(supabaseMockState.upsertResp),
        }),
      }),
    }),
  }
}

vi.mock('@/lib/supabase', () => ({ getSupabaseAdmin: () => chainable() }))

const checkInternalKeyMock = vi.fn()
vi.mock('@/lib/internal-auth', () => ({ checkInternalKey: checkInternalKeyMock }))

const VALID_BODY = {
  client_id: 'client-uuid-1',
  campaign_id: 'campaign-abc-123',
  client_name: 'Náufrago Surf',
  vertical: 'surf',
  outputs: {
    'content-creator': {
      headline: 'Aprende surf en Mompiche',
      cta_label: 'Reservá',
      cta_url: 'https://tally.so/r/x',
    },
    'competitive-strategist': { differentiators: ['A', 'B', 'C'] },
  },
}

beforeEach(() => {
  vi.clearAllMocks()
  supabaseMockState.upsertResp = {
    data: { id: 'landing-uuid-1', slug: 'naufrago-surf-abc123', title: 'Náufrago Surf · surf', is_active: true },
    error: null,
  }
  checkInternalKeyMock.mockReturnValue({ ok: true })
})

describe('Sprint 5 · /api/cascade/landing-from-outputs', () => {
  it('401 without x-api-key', async () => {
    checkInternalKeyMock.mockReturnValueOnce({ ok: false, reason: 'Missing x-api-key header' })
    const { POST } = await import('../src/app/api/cascade/landing-from-outputs/route')
    const res = await POST(
      new Request('http://localhost/api/cascade/landing-from-outputs', {
        method: 'POST',
        body: JSON.stringify(VALID_BODY),
      }),
    )
    expect(res.status).toBe(401)
  })

  it('400 invalid JSON body', async () => {
    const { POST } = await import('../src/app/api/cascade/landing-from-outputs/route')
    const res = await POST(
      new Request('http://localhost/api/cascade/landing-from-outputs', {
        method: 'POST',
        body: 'not-json{',
      }),
    )
    expect(res.status).toBe(400)
  })

  it('400 missing campaign_id', async () => {
    const { POST } = await import('../src/app/api/cascade/landing-from-outputs/route')
    const res = await POST(
      new Request('http://localhost/api/cascade/landing-from-outputs', {
        method: 'POST',
        body: JSON.stringify({ ...VALID_BODY, campaign_id: '' }),
      }),
    )
    expect(res.status).toBe(400)
  })

  it('400 missing client_name', async () => {
    const { POST } = await import('../src/app/api/cascade/landing-from-outputs/route')
    const res = await POST(
      new Request('http://localhost/api/cascade/landing-from-outputs', {
        method: 'POST',
        body: JSON.stringify({ ...VALID_BODY, client_name: '' }),
      }),
    )
    expect(res.status).toBe(400)
  })

  it('400 missing outputs', async () => {
    const { POST } = await import('../src/app/api/cascade/landing-from-outputs/route')
    const res = await POST(
      new Request('http://localhost/api/cascade/landing-from-outputs', {
        method: 'POST',
        body: JSON.stringify({ ...VALID_BODY, outputs: null }),
      }),
    )
    expect(res.status).toBe(400)
  })

  it('200 happy path · UPSERT returns landing + url', async () => {
    const { POST } = await import('../src/app/api/cascade/landing-from-outputs/route')
    const res = await POST(
      new Request('http://localhost/api/cascade/landing-from-outputs', {
        method: 'POST',
        body: JSON.stringify(VALID_BODY),
      }),
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      ok: boolean
      landing: { id: string; slug: string }
      url: string
      slug: string
      sections_count: number
    }
    expect(body.ok).toBe(true)
    expect(body.landing.id).toBe('landing-uuid-1')
    expect(body.slug).toMatch(/^naufrago-surf-[a-z0-9]{1,6}$/)
    expect(body.url).toContain('/landings/')
    expect(body.sections_count).toBeGreaterThan(0)
  })

  it('500 on DB error · returns error code', async () => {
    supabaseMockState.upsertResp = { data: null, error: { message: 'duplicate key foo' } }
    const { POST } = await import('../src/app/api/cascade/landing-from-outputs/route')
    const res = await POST(
      new Request('http://localhost/api/cascade/landing-from-outputs', {
        method: 'POST',
        body: JSON.stringify(VALID_BODY),
      }),
    )
    expect(res.status).toBe(500)
    const body = (await res.json()) as { ok: boolean; code: string }
    expect(body.ok).toBe(false)
    expect(body.code).toBe('E-LANDING-UPSERT')
  })

  it('GET returns endpoint metadata', async () => {
    const { GET } = await import('../src/app/api/cascade/landing-from-outputs/route')
    const res = await GET()
    expect(res.status).toBe(200)
    const body = (await res.json()) as { endpoint: string; auth: string }
    expect(body.endpoint).toBe('/api/cascade/landing-from-outputs')
    expect(body.auth).toContain('INTERNAL_API_KEY')
  })
})
