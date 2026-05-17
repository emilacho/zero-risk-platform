/**
 * creative-embeddings-endpoints.test.ts · Sprint #8 Workstream D
 *
 * Contract tests · OpenAI embeddings mocked + Supabase service-role mocked.
 *
 *   POST /api/embeddings/creative
 *     1. 401 when auth fails
 *     2. 503 when OPENAI_API_KEY missing
 *     3. 400 when creative_id missing
 *     4. 400 when content object missing
 *     5. 400 when content has no embeddable fields
 *     6. 502 when OpenAI returns 5xx
 *     7. 200 happy path · upserts with onConflict creative_id
 *     8. content_text built correctly from fields
 *
 *   GET /api/embeddings/recommend
 *     1. 401 when auth fails
 *     2. 400 when neither q nor from_creative_id provided
 *     3. 404 when from_creative_id not found
 *     4. 503 when OpenAI key missing for ad-hoc q
 *     5. 200 happy path · cross_cliente=true excludes client_id
 *     6. 200 happy path · cross_cliente=false (default) filters to client_id
 *     7. limit param clamped 1..50
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const mockAuth = vi.fn()
vi.mock('@/lib/internal-auth', () => ({
  checkInternalKey: (req: Request) => mockAuth(req),
}))

const mockUpsertCapture = vi.fn()
const mockSelectCapture = vi.fn()
const mockRpcCapture = vi.fn()
const mockMaybeSingleResult = { data: null as null | { embedding: number[] }, error: null as null | { message: string } }
const mockRpcResult = { data: [] as Array<Record<string, unknown>>, error: null as null | { message: string } }

vi.mock('@/lib/supabase', () => ({
  getSupabaseAdmin: () => ({
    from: (table: string) => ({
      upsert: (row: Record<string, unknown>, opts?: Record<string, unknown>) => {
        mockUpsertCapture(table, row, opts)
        return Promise.resolve({ data: null, error: null })
      },
      select: (cols: string) => ({
        eq: (col: string, val: string) => ({
          maybeSingle: () => {
            mockSelectCapture(table, cols, col, val)
            return Promise.resolve(mockMaybeSingleResult)
          },
        }),
      }),
    }),
    rpc: (fn: string, args: Record<string, unknown>) => {
      mockRpcCapture(fn, args)
      return Promise.resolve(mockRpcResult)
    },
  }),
}))

let originalFetch: typeof fetch
function setMockFetch(impl: (url: string, init?: RequestInit) => Promise<Response>) {
  globalThis.fetch = impl as unknown as typeof fetch
}

const fakeEmbedding = () => Array.from({ length: 1536 }, (_, i) => (i % 100) / 100)

const okEmbedResponse = () =>
  new Response(JSON.stringify({
    data: [{ embedding: fakeEmbedding(), index: 0 }],
    model: 'text-embedding-3-small',
    usage: { prompt_tokens: 42, total_tokens: 42 },
  }), { status: 200, headers: { 'Content-Type': 'application/json' } })

beforeEach(() => {
  mockAuth.mockReset()
  mockAuth.mockReturnValue({ ok: true })
  mockUpsertCapture.mockReset()
  mockSelectCapture.mockReset()
  mockRpcCapture.mockReset()
  mockMaybeSingleResult.data = null
  mockMaybeSingleResult.error = null
  mockRpcResult.data = []
  mockRpcResult.error = null
  originalFetch = globalThis.fetch
  vi.stubEnv('OPENAI_API_KEY', 'test-openai-key')
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
// POST /api/embeddings/creative
// ============================================================================

describe('POST /api/embeddings/creative', () => {
  it('returns 401 when auth fails', async () => {
    mockAuth.mockReturnValue({ ok: false, reason: 'missing' })
    const { POST } = await import('../src/app/api/embeddings/creative/route')
    const res = await POST(buildPost('/api/embeddings/creative', { creative_id: 'C1', content: { title: 'hi' } }))
    expect(res.status).toBe(401)
  })

  it('returns 503 when OPENAI_API_KEY missing', async () => {
    vi.unstubAllEnvs()
    const { POST } = await import('../src/app/api/embeddings/creative/route')
    const res = await POST(buildPost('/api/embeddings/creative', { creative_id: 'C1', content: { title: 'hi' } }))
    expect(res.status).toBe(503)
  })

  it('returns 400 when creative_id missing', async () => {
    const { POST } = await import('../src/app/api/embeddings/creative/route')
    const res = await POST(buildPost('/api/embeddings/creative', { content: { title: 'hi' } }))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.code).toBe('E-EMBED-CREATIVE-ID')
  })

  it('returns 400 when content missing', async () => {
    const { POST } = await import('../src/app/api/embeddings/creative/route')
    const res = await POST(buildPost('/api/embeddings/creative', { creative_id: 'C1' }))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.code).toBe('E-EMBED-CONTENT')
  })

  it('returns 400 when content has no embeddable fields', async () => {
    const { POST } = await import('../src/app/api/embeddings/creative/route')
    const res = await POST(buildPost('/api/embeddings/creative', { creative_id: 'C1', content: {} }))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.code).toBe('E-EMBED-EMPTY')
  })

  it('returns 502 when OpenAI returns 5xx', async () => {
    setMockFetch(async () => new Response('upstream down', { status: 500 }))
    const { POST } = await import('../src/app/api/embeddings/creative/route')
    const res = await POST(buildPost('/api/embeddings/creative', { creative_id: 'C1', content: { title: 'hi' } }))
    expect(res.status).toBe(502)
    const json = await res.json()
    expect(json.error).toBe('openai_embed_failed')
  })

  it('happy path · upserts with onConflict creative_id', async () => {
    setMockFetch(async () => okEmbedResponse())
    const { POST } = await import('../src/app/api/embeddings/creative/route')
    const res = await POST(buildPost('/api/embeddings/creative', {
      creative_id: 'CR_001',
      client_id: 'naufrago',
      campaign_id: 'CAMP_001',
      content: { title: 'V1', body: 'Body', image_url: 'https://x/a.jpg', industry: 'naval' },
      performance_score: 7.5,
    }))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.ok).toBe(true)
    expect(json.dimensions).toBe(1536)
    expect(json.model).toBe('text-embedding-3-small')
    expect(mockUpsertCapture).toHaveBeenCalledTimes(1)
    const [table, row, opts] = mockUpsertCapture.mock.calls[0]
    expect(table).toBe('creative_embeddings')
    expect(opts).toMatchObject({ onConflict: 'creative_id' })
    expect(row).toMatchObject({
      creative_id: 'CR_001',
      client_id: 'naufrago',
      campaign_id: 'CAMP_001',
      performance_score: 7.5,
      dimensions: 1536,
    })
    expect(Array.isArray(row.embedding)).toBe(true)
    expect((row.embedding as number[]).length).toBe(1536)
  })

  it('content_text built correctly from fields', async () => {
    setMockFetch(async () => okEmbedResponse())
    const { POST } = await import('../src/app/api/embeddings/creative/route')
    await POST(buildPost('/api/embeddings/creative', {
      creative_id: 'CR_002',
      content: { title: 'X', body: 'Y', industry: 'naval', campaign_objective: 'OUTCOME_TRAFFIC' },
    }))
    const [, row] = mockUpsertCapture.mock.calls[0]
    expect(row.content_text).toContain('Industry: naval')
    expect(row.content_text).toContain('Objective: OUTCOME_TRAFFIC')
    expect(row.content_text).toContain('Title: X')
    expect(row.content_text).toContain('Body: Y')
  })
})

// ============================================================================
// GET /api/embeddings/recommend
// ============================================================================

describe('GET /api/embeddings/recommend', () => {
  it('returns 401 when auth fails', async () => {
    mockAuth.mockReturnValue({ ok: false, reason: 'missing' })
    const { GET } = await import('../src/app/api/embeddings/recommend/route')
    const res = await GET(buildGet('/api/embeddings/recommend?q=hello'))
    expect(res.status).toBe(401)
  })

  it('returns 400 when neither q nor from_creative_id provided', async () => {
    const { GET } = await import('../src/app/api/embeddings/recommend/route')
    const res = await GET(buildGet('/api/embeddings/recommend'))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.code).toBe('E-RECOMMEND-QUERY')
  })

  it('returns 404 when from_creative_id not found', async () => {
    mockMaybeSingleResult.data = null
    const { GET } = await import('../src/app/api/embeddings/recommend/route')
    const res = await GET(buildGet('/api/embeddings/recommend?from_creative_id=DOESNT_EXIST'))
    expect(res.status).toBe(404)
  })

  it('returns 503 when OpenAI key missing for ad-hoc q', async () => {
    vi.unstubAllEnvs()
    const { GET } = await import('../src/app/api/embeddings/recommend/route')
    const res = await GET(buildGet('/api/embeddings/recommend?q=hello'))
    expect(res.status).toBe(503)
  })

  it('cross_cliente=1 excludes client_id from results', async () => {
    setMockFetch(async () => okEmbedResponse())
    mockRpcResult.data = [
      { id: 'a', creative_id: 'X1', client_id: 'otra', similarity: 0.91, performance_score: 9.2 },
    ]
    const { GET } = await import('../src/app/api/embeddings/recommend/route')
    const res = await GET(buildGet('/api/embeddings/recommend?q=cars&client_id=naufrago&cross_cliente=1&limit=3'))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.cross_cliente).toBe(true)
    expect(json.count).toBe(1)
    expect(mockRpcCapture).toHaveBeenCalledTimes(1)
    const [fn, args] = mockRpcCapture.mock.calls[0]
    expect(fn).toBe('match_creative_embeddings')
    expect(args).toMatchObject({ exclude_client_id: 'naufrago', match_count: 3 })
    expect(args).not.toHaveProperty('filter_client_id')
  })

  it('cross_cliente=false (default) filters to client_id', async () => {
    setMockFetch(async () => okEmbedResponse())
    const { GET } = await import('../src/app/api/embeddings/recommend/route')
    await GET(buildGet('/api/embeddings/recommend?q=cars&client_id=naufrago'))
    const [, args] = mockRpcCapture.mock.calls[0]
    expect(args).toMatchObject({ filter_client_id: 'naufrago' })
    expect(args).not.toHaveProperty('exclude_client_id')
  })

  it('limit param clamped to [1,50]', async () => {
    setMockFetch(async () => okEmbedResponse())
    const { GET } = await import('../src/app/api/embeddings/recommend/route')
    await GET(buildGet('/api/embeddings/recommend?q=cars&limit=9999'))
    const [, args1] = mockRpcCapture.mock.calls[0]
    expect(args1.match_count).toBe(50)
    mockRpcCapture.mockClear()
    await GET(buildGet('/api/embeddings/recommend?q=cars&limit=0'))
    const [, args2] = mockRpcCapture.mock.calls[0]
    expect(args2.match_count).toBe(1)
  })

  it('from_creative_id path uses stored embedding without OpenAI call', async () => {
    let openaiCalls = 0
    setMockFetch(async () => {
      openaiCalls++
      return okEmbedResponse()
    })
    mockMaybeSingleResult.data = { embedding: fakeEmbedding() }
    const { GET } = await import('../src/app/api/embeddings/recommend/route')
    const res = await GET(buildGet('/api/embeddings/recommend?from_creative_id=CR_001'))
    expect(res.status).toBe(200)
    expect(openaiCalls).toBe(0)
    const json = await res.json()
    expect(json.query_source).toBe('from_creative_id:CR_001')
  })

  it('min_performance is forwarded to RPC args', async () => {
    setMockFetch(async () => okEmbedResponse())
    const { GET } = await import('../src/app/api/embeddings/recommend/route')
    await GET(buildGet('/api/embeddings/recommend?q=cars&min_performance=5.0'))
    const [, args] = mockRpcCapture.mock.calls[0]
    expect(args.min_performance_score).toBe(5.0)
  })
})
