import { describe, it, expect, vi, beforeEach } from 'vitest'

const supabaseMockState: {
  selectResp: { data: unknown; error: unknown; count?: number | null }
  insertResp: { data: unknown; error: unknown }
} = {
  selectResp: { data: [], error: null },
  insertResp: { data: null, error: null },
}

function chainable() {
  return {
    from: () => ({
      select: () => {
        const wrapper = {
          eq: () => wrapper,
          order: () => wrapper,
          maybeSingle: () => Promise.resolve(supabaseMockState.selectResp),
          single: () => Promise.resolve(supabaseMockState.selectResp),
          then: (cb: (v: unknown) => unknown) => Promise.resolve(supabaseMockState.selectResp).then(cb),
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

vi.mock('@/lib/supabase', () => ({ getSupabaseAdmin: () => chainable() }))
vi.mock('@/lib/admin-auth', () => ({ requireAdmin: vi.fn() }))

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
  supabaseMockState.selectResp = { data: [], error: null }
  supabaseMockState.insertResp = { data: null, error: null }
})

describe('Sprint 4 · /api/landings', () => {
  it('GET returns 401 without admin auth', async () => {
    mockUnauthorized()
    const { GET } = await import('../src/app/api/landings/route')
    const res = await GET(new Request('http://localhost/api/landings'))
    expect(res.status).toBe(401)
  })

  it('GET returns 200 + landings list when admin', async () => {
    mockAdmin()
    supabaseMockState.selectResp = { data: [], error: null }
    const { GET } = await import('../src/app/api/landings/route')
    const res = await GET(new Request('http://localhost/api/landings'))
    expect(res.status).toBe(200)
    const body = (await res.json()) as { landings: unknown[]; count: number }
    expect(body.count).toBe(0)
  })

  it('POST returns 400 on invalid slug', async () => {
    mockAdmin()
    const { POST } = await import('../src/app/api/landings/route')
    const res = await POST(
      new Request('http://localhost/api/landings', {
        method: 'POST',
        body: JSON.stringify({ slug: 'INVALID_UPPERCASE', title: 't', hero_headline: 'h' }),
      }),
    )
    expect(res.status).toBe(400)
  })

  it('POST returns 400 when title missing', async () => {
    mockAdmin()
    const { POST } = await import('../src/app/api/landings/route')
    const res = await POST(
      new Request('http://localhost/api/landings', {
        method: 'POST',
        body: JSON.stringify({ slug: 'valid-slug', hero_headline: 'h' }),
      }),
    )
    expect(res.status).toBe(400)
  })

  it('POST returns 400 when hero_headline missing', async () => {
    mockAdmin()
    const { POST } = await import('../src/app/api/landings/route')
    const res = await POST(
      new Request('http://localhost/api/landings', {
        method: 'POST',
        body: JSON.stringify({ slug: 'valid-slug', title: 't' }),
      }),
    )
    expect(res.status).toBe(400)
  })
})

describe('Sprint 4 · /api/landings/[slug]', () => {
  it('GET returns 400 on invalid slug', async () => {
    mockAdmin()
    const { GET } = await import('../src/app/api/landings/[slug]/route')
    const res = await GET(new Request('http://localhost/api/landings/!BAD!'), { params: { slug: '!BAD!' } })
    expect(res.status).toBe(400)
  })

  it('GET returns 404 when landing not found', async () => {
    mockAdmin()
    supabaseMockState.selectResp = { data: null, error: null }
    const { GET } = await import('../src/app/api/landings/[slug]/route')
    const res = await GET(new Request('http://localhost/api/landings/naufrago-surf'), {
      params: { slug: 'naufrago-surf' },
    })
    expect(res.status).toBe(404)
  })

  it('DELETE returns 401 without admin', async () => {
    mockUnauthorized()
    const { DELETE } = await import('../src/app/api/landings/[slug]/route')
    const res = await DELETE(new Request('http://localhost/api/landings/naufrago-surf'), {
      params: { slug: 'naufrago-surf' },
    })
    expect(res.status).toBe(401)
  })
})
