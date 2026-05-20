import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock Supabase admin chainable builder.
const supabaseMockState: {
  selectResp: { data: unknown; error: unknown; count?: number | null }
  insertResp: { data: unknown; error: unknown }
} = {
  selectResp: { data: [], error: null, count: 0 },
  insertResp: { data: null, error: null },
}

function chainable() {
  return {
    from: () => ({
      select: (_cols?: string, opts?: { count?: string; head?: boolean }) => {
        const wrapper: Record<string, unknown> = {}
        wrapper.eq = () => wrapper
        wrapper.in = () => wrapper
        wrapper.order = () => wrapper
        wrapper.maybeSingle = () => Promise.resolve(supabaseMockState.selectResp)
        wrapper.single = () => Promise.resolve(supabaseMockState.selectResp)
        wrapper.then = (cb: (v: unknown) => unknown) =>
          Promise.resolve(supabaseMockState.selectResp).then(cb)
        // head:true count query returns count directly
        if (opts?.head) {
          wrapper.eq = () =>
            Object.assign(wrapper, {
              then: (cb: (v: unknown) => unknown) =>
                Promise.resolve({ count: supabaseMockState.selectResp.count ?? 0, error: null }).then(cb),
            })
        }
        return wrapper
      },
      insert: () => ({
        select: () => ({
          single: () => Promise.resolve(supabaseMockState.insertResp),
          maybeSingle: () => Promise.resolve(supabaseMockState.insertResp),
        }),
      }),
      update: () => ({
        eq: () => ({
          select: () => ({
            single: () => Promise.resolve(supabaseMockState.insertResp),
            maybeSingle: () => Promise.resolve(supabaseMockState.insertResp),
          }),
        }),
      }),
    }),
  }
}

vi.mock('@/lib/supabase', () => ({
  getSupabaseAdmin: () => chainable(),
}))

vi.mock('@/lib/admin-auth', () => ({
  requireAdmin: vi.fn(),
}))

import { requireAdmin } from '@/lib/admin-auth'

const mockUnauthorized = () => {
  ;(requireAdmin as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
    ok: false,
    response: new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 }),
  })
}
const mockAdmin = () => {
  ;(requireAdmin as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
    ok: true,
    userId: 'admin-uuid',
    email: 'emilio@zero-risk.test',
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  supabaseMockState.selectResp = { data: [], error: null, count: 0 }
  supabaseMockState.insertResp = { data: null, error: null }
})

describe('Sprint 4 · /api/forms', () => {
  it('returns 401 without admin auth', async () => {
    mockUnauthorized()
    const { GET } = await import('../src/app/api/forms/route')
    const res = await GET(new Request('http://localhost/api/forms'))
    expect(res.status).toBe(401)
  })

  it('returns 200 + empty list when admin', async () => {
    mockAdmin()
    supabaseMockState.selectResp = { data: [], error: null }
    const { GET } = await import('../src/app/api/forms/route')
    const res = await GET(new Request('http://localhost/api/forms'))
    expect(res.status).toBe(200)
    const body = (await res.json()) as { forms: unknown[]; count: number }
    expect(body.count).toBe(0)
    expect(Array.isArray(body.forms)).toBe(true)
  })

  it('POST · returns 400 when name missing', async () => {
    mockAdmin()
    const { POST } = await import('../src/app/api/forms/route')
    const res = await POST(new Request('http://localhost/api/forms', { method: 'POST', body: '{}' }))
    expect(res.status).toBe(400)
  })

  it('POST · returns 400 on invalid JSON', async () => {
    mockAdmin()
    const { POST } = await import('../src/app/api/forms/route')
    const res = await POST(new Request('http://localhost/api/forms', { method: 'POST', body: 'not-json' }))
    expect(res.status).toBe(400)
  })
})

describe('Sprint 4 · /api/forms/submit Tally webhook', () => {
  it('returns 401 when TALLY_SIGNING_SECRET set + signature invalid', async () => {
    const prev = process.env.TALLY_SIGNING_SECRET
    process.env.TALLY_SIGNING_SECRET = 'test-secret-do-not-use'
    const { POST } = await import('../src/app/api/forms/submit/route')
    const res = await POST(
      new Request('http://localhost/api/forms/submit', {
        method: 'POST',
        body: JSON.stringify({ eventId: 'evt_1', formId: 'tally-x' }),
        headers: { 'tally-signature': 'invalid-sig' },
      }),
    )
    expect(res.status).toBe(401)
    process.env.TALLY_SIGNING_SECRET = prev
  })

  it('accepts payload without signing secret (dev mode)', async () => {
    const prev = process.env.TALLY_SIGNING_SECRET
    delete process.env.TALLY_SIGNING_SECRET
    supabaseMockState.insertResp = { data: { id: 'sub-uuid' }, error: null }
    supabaseMockState.selectResp = { data: null, error: null }
    const { POST } = await import('../src/app/api/forms/submit/route')
    const res = await POST(
      new Request('http://localhost/api/forms/submit', {
        method: 'POST',
        body: JSON.stringify({
          eventId: 'evt_test_1',
          formId: 'tally-form-test',
          data: { fields: [{ key: 'email', value: 'lead@example.com', type: 'INPUT_EMAIL' }] },
        }),
      }),
    )
    expect([201, 200]).toContain(res.status)
    if (prev !== undefined) process.env.TALLY_SIGNING_SECRET = prev
  })

  it('returns 400 on invalid JSON body', async () => {
    delete process.env.TALLY_SIGNING_SECRET
    const { POST } = await import('../src/app/api/forms/submit/route')
    const res = await POST(
      new Request('http://localhost/api/forms/submit', {
        method: 'POST',
        body: 'definitely-not-json{',
      }),
    )
    expect(res.status).toBe(400)
  })
})

describe('Sprint 4 · /api/forms/[id]', () => {
  it('GET returns 400 on non-uuid id', async () => {
    mockAdmin()
    const { GET } = await import('../src/app/api/forms/[id]/route')
    const res = await GET(new Request('http://localhost/api/forms/bad-id'), { params: { id: 'bad-id' } })
    expect(res.status).toBe(400)
  })

  it('GET returns 404 when form not found', async () => {
    mockAdmin()
    supabaseMockState.selectResp = { data: null, error: null }
    const { GET } = await import('../src/app/api/forms/[id]/route')
    const res = await GET(
      new Request('http://localhost/api/forms/11111111-1111-1111-1111-111111111111'),
      { params: { id: '11111111-1111-1111-1111-111111111111' } },
    )
    expect(res.status).toBe(404)
  })
})
