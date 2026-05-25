/**
 * Sprint 8D · /api/brain/reembed-source-row canonical tests.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/internal-auth', () => ({
  checkInternalKey: vi.fn((r: Request) => {
    const k = r.headers.get('x-api-key')
    return k === 'test-key' ? { ok: true } : { ok: false, reason: 'missing' }
  }),
}))

const maybeSingleMock = vi.fn<() => Promise<{ data: unknown; error: unknown }>>(async () => ({ data: null, error: null }))
const eqMock = vi.fn(() => ({ maybeSingle: maybeSingleMock }))
const selectMock = vi.fn(() => ({ eq: eqMock }))
const fromMock = vi.fn(() => ({ select: selectMock }))
vi.mock('@/lib/supabase', () => ({
  getSupabaseAdmin: vi.fn(() => ({ from: fromMock })),
}))

global.fetch = vi.fn() as unknown as typeof fetch

const VALID_CLIENT = '5c2d2dd5-a49e-4da3-87c3-03b504b734f6'
const VALID_SOURCE = '11111111-2222-3333-4444-555555555555'

function makeReq(body: unknown, key = 'test-key'): Request {
  return new Request('https://example.com/api/brain/reembed-source-row', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': key },
    body: JSON.stringify(body),
  })
}

describe('POST /api/brain/reembed-source-row', () => {
  beforeEach(() => {
    maybeSingleMock.mockClear()
    eqMock.mockClear()
    selectMock.mockClear()
    fromMock.mockClear()
    ;(global.fetch as unknown as ReturnType<typeof vi.fn>).mockClear()
  })

  it('rejects without x-api-key', async () => {
    const { POST } = await import('../src/app/api/brain/reembed-source-row/route')
    const res = await POST(makeReq({ source_table: 'client_brand_books', source_id: VALID_SOURCE, client_id: VALID_CLIENT }, ''))
    expect(res.status).toBe(401)
  })

  it('rejects missing fields', async () => {
    const { POST } = await import('../src/app/api/brain/reembed-source-row/route')
    const res = await POST(makeReq({ source_table: 'client_brand_books' }))
    expect(res.status).toBe(400)
    const j = await res.json()
    expect(j.code).toBe('E-BRAIN-REEMBED-MISSING')
  })

  it('rejects invalid source_table', async () => {
    const { POST } = await import('../src/app/api/brain/reembed-source-row/route')
    const res = await POST(makeReq({ source_table: 'arbitrary', source_id: VALID_SOURCE, client_id: VALID_CLIENT }))
    expect(res.status).toBe(400)
    const j = await res.json()
    expect(j.code).toBe('E-BRAIN-REEMBED-SOURCE-TABLE')
  })

  it('returns 404 when source row not found', async () => {
    maybeSingleMock.mockResolvedValueOnce({ data: null, error: null })
    const { POST } = await import('../src/app/api/brain/reembed-source-row/route')
    const res = await POST(makeReq({ source_table: 'client_brand_books', source_id: VALID_SOURCE, client_id: VALID_CLIENT }))
    expect(res.status).toBe(404)
  })

  it('happy path · fetches source · extracts sections · invokes ingest-source', async () => {
    maybeSingleMock.mockResolvedValueOnce({
      data: {
        id: VALID_SOURCE,
        client_id: VALID_CLIENT,
        updated_at: new Date().toISOString(),
        brand_purpose: 'Empower SMBs with marketing automation that saves 20 hours a week.',
        tone_guidelines: 'Professional but warm · short sentences.',
      },
      error: null,
    })
    ;(global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ ok: true, chunks_upserted: 2, cost_usd: 0.0000008 }),
    })

    const { POST } = await import('../src/app/api/brain/reembed-source-row/route')
    const res = await POST(makeReq({ source_table: 'client_brand_books', source_id: VALID_SOURCE, client_id: VALID_CLIENT, updated_at: new Date().toISOString() }))
    expect(res.status).toBe(200)
    const j = await res.json()
    expect(j.ok).toBe(true)
    expect(j.sections_extracted).toBe(2)
    expect(j.chunks_upserted).toBe(2)
    expect(global.fetch).toHaveBeenCalledTimes(1)
  })
})
