/**
 * meta-social-endpoints.test.ts · CC#2 [DISPATCH-CC2-META-GRAPH-WIRE-SOCIAL-PUBLISHER-ACTIVATE]
 *
 * Contract tests · 6 cases per endpoint × 3 endpoints = 18 tests:
 *
 *   POST /api/meta-social/post/instagram
 *     1. 401 when auth fails
 *     2. 400 when image_url missing
 *     3. 503 when META env not configured
 *     4. 200 happy path · 2-step (container + publish)
 *     5. 502 when container Graph call fails (upstream 5xx)
 *     6. agent_invocations row landed on success
 *
 *   POST /api/meta-social/post/facebook
 *     1. 401 auth fails
 *     2. 400 message and image_url both missing
 *     3. 503 not_configured
 *     4. 200 /feed happy path (message only)
 *     5. 200 /photos happy path (image_url + caption)
 *     6. agent_invocations row landed on success
 *
 *   GET /api/meta-social/insights/[post_id]
 *     1. 401 auth fails
 *     2. 400 post_id missing
 *     3. 503 not_configured
 *     4. 200 happy path · default facebook metrics flatten
 *     5. 200 with explicit ?metrics= override
 *     6. 502 when Graph returns 500
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const mockAuth = vi.fn()
vi.mock('@/lib/internal-auth', () => ({
  checkInternalKey: (req: Request) => mockAuth(req),
}))

const mockInsertCapture = vi.fn()
vi.mock('@/lib/supabase', () => ({
  getSupabaseAdmin: () => ({
    from: () => ({
      insert: (row: Record<string, unknown>) => {
        mockInsertCapture(row)
        return Promise.resolve({ data: null, error: null })
      },
    }),
  }),
}))

let originalFetch: typeof fetch
function setMockFetch(impl: (url: string, init?: RequestInit) => Promise<Response>) {
  globalThis.fetch = impl as unknown as typeof fetch
}

beforeEach(() => {
  mockAuth.mockReset()
  mockAuth.mockReturnValue({ ok: true })
  mockInsertCapture.mockReset()
  originalFetch = globalThis.fetch
  // Defaults for tests that need env (each test that wants 503 stubs blank)
  vi.stubEnv('META_IG_BUSINESS_ACCOUNT_ID', '17841400000000000')
  vi.stubEnv('META_IG_ACCESS_TOKEN', 'test-ig-token')
  vi.stubEnv('META_FB_PAGE_ID', '101000000000000')
  vi.stubEnv('META_FB_PAGE_ACCESS_TOKEN', 'test-fb-token')
  vi.stubEnv('META_ACCESS_TOKEN', 'test-master-token')
})

afterEach(() => {
  globalThis.fetch = originalFetch
  vi.unstubAllEnvs()
})

const buildPost = (path: string, body: unknown) =>
  new Request(`http://localhost:3000${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

const buildGet = (path: string) => new Request(`http://localhost:3000${path}`)

// ============================================================================
// POST /api/meta-social/post/instagram
// ============================================================================

describe('POST /api/meta-social/post/instagram', () => {
  it('returns 401 when auth fails', async () => {
    mockAuth.mockReturnValue({ ok: false, reason: 'missing key' })
    const { POST } = await import('../src/app/api/meta-social/post/instagram/route')
    const res = await POST(buildPost('/api/meta-social/post/instagram', { image_url: 'https://x.com/a.jpg' }))
    expect(res.status).toBe(401)
  })

  it('returns 400 when image_url missing', async () => {
    const { POST } = await import('../src/app/api/meta-social/post/instagram/route')
    const res = await POST(buildPost('/api/meta-social/post/instagram', { caption: 'no image' }))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.code).toBe('E-META-IG-IMAGE-URL')
  })

  it('returns 503 when META env not configured', async () => {
    vi.stubEnv('META_IG_BUSINESS_ACCOUNT_ID', '')
    vi.stubEnv('META_IG_ACCESS_TOKEN', '')
    vi.stubEnv('META_ACCESS_TOKEN', '')
    const { POST } = await import('../src/app/api/meta-social/post/instagram/route')
    const res = await POST(buildPost('/api/meta-social/post/instagram', { image_url: 'https://x.com/a.jpg' }))
    expect(res.status).toBe(503)
    const json = await res.json()
    expect(json.error).toBe('not_configured')
    expect(json.missing).toContain('META_IG_BUSINESS_ACCOUNT_ID')
  })

  it('returns 200 on 2-step happy path (container + publish)', async () => {
    setMockFetch(async (url: string) => {
      if (url.includes('/media_publish')) {
        return new Response(JSON.stringify({ id: 'media-987' }), { status: 200 })
      }
      return new Response(JSON.stringify({ id: 'container-123' }), { status: 200 })
    })
    const { POST } = await import('../src/app/api/meta-social/post/instagram/route')
    const res = await POST(
      buildPost('/api/meta-social/post/instagram', {
        image_url: 'https://x.com/a.jpg',
        caption: 'hello',
        client_id: 'c-1',
      }),
    )
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.ok).toBe(true)
    expect(json.media_id).toBe('media-987')
    expect(json.creation_id).toBe('container-123')
    expect(json.client_id).toBe('c-1')
  })

  it('returns 502 when container Graph call fails', async () => {
    setMockFetch(async () => new Response(JSON.stringify({ error: { message: 'oauth fail' } }), { status: 500 }))
    const { POST } = await import('../src/app/api/meta-social/post/instagram/route')
    const res = await POST(
      buildPost('/api/meta-social/post/instagram', { image_url: 'https://x.com/a.jpg' }),
    )
    expect(res.status).toBe(502)
    const json = await res.json()
    expect(json.error).toBe('meta_container_failed')
    expect(json.stage).toBe('container')
  })

  it('persists agent_invocations row on success', async () => {
    setMockFetch(async (url: string) =>
      url.includes('/media_publish')
        ? new Response(JSON.stringify({ id: 'media-1' }), { status: 200 })
        : new Response(JSON.stringify({ id: 'container-1' }), { status: 200 }),
    )
    const { POST } = await import('../src/app/api/meta-social/post/instagram/route')
    await POST(
      buildPost('/api/meta-social/post/instagram', {
        image_url: 'https://x.com/a.jpg',
        caption: 'hi',
        client_id: 'c-2',
        agent_slug: 'social-publisher',
      }),
    )
    // The persist is fire-and-forget · give microtask a tick
    await new Promise(r => setTimeout(r, 5))
    expect(mockInsertCapture).toHaveBeenCalled()
    const row = mockInsertCapture.mock.calls[0][0] as Record<string, unknown>
    expect(row.status).toBe('completed')
    expect(row.agent_id).toBe('social-publisher')
    expect(row.client_id).toBe('c-2')
    expect((row.metadata as Record<string, unknown>).platform).toBe('instagram')
    expect((row.metadata as Record<string, unknown>).source).toBe('api_meta_social_instagram')
  })
})

// ============================================================================
// POST /api/meta-social/post/facebook
// ============================================================================

describe('POST /api/meta-social/post/facebook', () => {
  it('returns 401 when auth fails', async () => {
    mockAuth.mockReturnValue({ ok: false, reason: 'missing key' })
    const { POST } = await import('../src/app/api/meta-social/post/facebook/route')
    const res = await POST(buildPost('/api/meta-social/post/facebook', { message: 'hi' }))
    expect(res.status).toBe(401)
  })

  it('returns 400 when both message and image_url missing', async () => {
    const { POST } = await import('../src/app/api/meta-social/post/facebook/route')
    const res = await POST(buildPost('/api/meta-social/post/facebook', { link_url: 'https://x.com' }))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.code).toBe('E-META-FB-INPUT')
  })

  it('returns 503 when META env not configured', async () => {
    vi.stubEnv('META_FB_PAGE_ID', '')
    vi.stubEnv('META_FB_PAGE_ACCESS_TOKEN', '')
    vi.stubEnv('META_ACCESS_TOKEN', '')
    const { POST } = await import('../src/app/api/meta-social/post/facebook/route')
    const res = await POST(buildPost('/api/meta-social/post/facebook', { message: 'hi' }))
    expect(res.status).toBe(503)
    const json = await res.json()
    expect(json.error).toBe('not_configured')
  })

  it('returns 200 on /feed happy path (message only)', async () => {
    let capturedUrl = ''
    setMockFetch(async (url: string) => {
      capturedUrl = url
      return new Response(JSON.stringify({ id: 'fb-post-123' }), { status: 200 })
    })
    const { POST } = await import('../src/app/api/meta-social/post/facebook/route')
    const res = await POST(buildPost('/api/meta-social/post/facebook', { message: 'hello world' }))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.post_id).toBe('fb-post-123')
    expect(json.endpoint).toBe('feed')
    expect(capturedUrl).toContain('/feed')
  })

  it('returns 200 on /photos happy path (image_url + caption)', async () => {
    let capturedUrl = ''
    setMockFetch(async (url: string) => {
      capturedUrl = url
      return new Response(
        JSON.stringify({ id: 'photo-1', post_id: 'fb-photo-post-456' }),
        { status: 200 },
      )
    })
    const { POST } = await import('../src/app/api/meta-social/post/facebook/route')
    const res = await POST(
      buildPost('/api/meta-social/post/facebook', {
        message: 'caption text',
        image_url: 'https://x.com/a.jpg',
      }),
    )
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.post_id).toBe('fb-photo-post-456')
    expect(json.endpoint).toBe('photos')
    expect(capturedUrl).toContain('/photos')
  })

  it('persists agent_invocations row on success', async () => {
    setMockFetch(async () => new Response(JSON.stringify({ id: 'fb-post-9' }), { status: 200 }))
    const { POST } = await import('../src/app/api/meta-social/post/facebook/route')
    await POST(
      buildPost('/api/meta-social/post/facebook', { message: 'persist test', client_id: 'c-3' }),
    )
    await new Promise(r => setTimeout(r, 5))
    expect(mockInsertCapture).toHaveBeenCalled()
    const row = mockInsertCapture.mock.calls[0][0] as Record<string, unknown>
    expect(row.status).toBe('completed')
    expect(row.client_id).toBe('c-3')
    expect((row.metadata as Record<string, unknown>).platform).toBe('facebook')
  })
})

// ============================================================================
// GET /api/meta-social/insights/[post_id]
// ============================================================================

describe('GET /api/meta-social/insights/[post_id]', () => {
  it('returns 401 when auth fails', async () => {
    mockAuth.mockReturnValue({ ok: false, reason: 'missing key' })
    const { GET } = await import('../src/app/api/meta-social/insights/[post_id]/route')
    const res = await GET(buildGet('/api/meta-social/insights/123'), {
      params: Promise.resolve({ post_id: '123' }),
    })
    expect(res.status).toBe(401)
  })

  it('returns 400 when post_id missing', async () => {
    const { GET } = await import('../src/app/api/meta-social/insights/[post_id]/route')
    const res = await GET(buildGet('/api/meta-social/insights/'), {
      params: Promise.resolve({ post_id: '' }),
    })
    expect(res.status).toBe(400)
  })

  it('returns 503 when META env not configured', async () => {
    vi.stubEnv('META_ACCESS_TOKEN', '')
    vi.stubEnv('META_FB_PAGE_ACCESS_TOKEN', '')
    vi.stubEnv('META_IG_ACCESS_TOKEN', '')
    const { GET } = await import('../src/app/api/meta-social/insights/[post_id]/route')
    const res = await GET(buildGet('/api/meta-social/insights/123'), {
      params: Promise.resolve({ post_id: '123' }),
    })
    expect(res.status).toBe(503)
  })

  it('returns 200 happy path with flattened insights (default facebook metrics)', async () => {
    setMockFetch(async () =>
      new Response(
        JSON.stringify({
          data: [
            {
              name: 'post_impressions',
              period: 'lifetime',
              values: [{ value: 100 }],
              title: 'Impressions',
            },
            {
              name: 'post_clicks',
              period: 'lifetime',
              values: [{ value: 12 }],
              title: 'Clicks',
            },
          ],
        }),
        { status: 200 },
      ),
    )
    const { GET } = await import('../src/app/api/meta-social/insights/[post_id]/route')
    const res = await GET(buildGet('/api/meta-social/insights/fb-1'), {
      params: Promise.resolve({ post_id: 'fb-1' }),
    })
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.ok).toBe(true)
    expect(json.platform).toBe('facebook')
    expect(json.insights.post_impressions.value).toBe(100)
    expect(json.insights.post_clicks.value).toBe(12)
    expect(json.metrics_requested).toContain('post_impressions')
  })

  it('respects ?metrics= override', async () => {
    let capturedUrl = ''
    setMockFetch(async (url: string) => {
      capturedUrl = url
      return new Response(JSON.stringify({ data: [] }), { status: 200 })
    })
    const { GET } = await import('../src/app/api/meta-social/insights/[post_id]/route')
    const res = await GET(buildGet('/api/meta-social/insights/ig-1?platform=instagram&metrics=reach,saved'), {
      params: Promise.resolve({ post_id: 'ig-1' }),
    })
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.platform).toBe('instagram')
    expect(json.metrics_requested).toEqual(['reach', 'saved'])
    expect(capturedUrl).toContain('metric=reach%2Csaved')
  })

  it('returns 502 when Graph returns 500', async () => {
    setMockFetch(async () => new Response(JSON.stringify({ error: { message: 'boom' } }), { status: 500 }))
    const { GET } = await import('../src/app/api/meta-social/insights/[post_id]/route')
    const res = await GET(buildGet('/api/meta-social/insights/fb-2'), {
      params: Promise.resolve({ post_id: 'fb-2' }),
    })
    expect(res.status).toBe(502)
    const json = await res.json()
    expect(json.error).toBe('meta_insights_failed')
  })
})
