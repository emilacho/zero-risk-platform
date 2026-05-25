/**
 * Sprint 8D · /api/brain/ingest-source canonical tests.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock embed
vi.mock('@/lib/brain/embed', () => ({
  generateEmbeddings: vi.fn(async (texts: string[]) => ({
    ok: true,
    embeddings: texts.map(() => new Array(1536).fill(0.001)),
    model: 'text-embedding-3-small',
    tokens: 100,
  })),
  estimateCost: vi.fn((t: number) => (t / 1000) * 0.00002),
  EMBEDDING_DIMENSIONS: 1536,
}))

// Mock auth
vi.mock('@/lib/internal-auth', () => ({
  checkInternalKey: vi.fn((r: Request) => {
    const k = r.headers.get('x-api-key')
    return k === 'test-key' ? { ok: true } : { ok: false, reason: 'missing' }
  }),
}))

// Mock supabase
const upsertMock = vi.fn(async () => ({
  data: [{ id: 'chunk-1' }, { id: 'chunk-2' }],
  error: null,
}))
const fromMock = vi.fn(() => ({
  upsert: vi.fn(() => ({ select: upsertMock })),
}))
vi.mock('@/lib/supabase', () => ({
  getSupabaseAdmin: vi.fn(() => ({ from: fromMock })),
}))

const VALID_UUID = '5c2d2dd5-a49e-4da3-87c3-03b504b734f6'
const SRC_UUID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'

async function importRoute() {
  return import('../src/app/api/brain/ingest-source/route')
}

function makeReq(body: unknown, key = 'test-key'): Request {
  return new Request('https://example.com/api/brain/ingest-source', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': key },
    body: JSON.stringify(body),
  })
}

describe('POST /api/brain/ingest-source', () => {
  beforeEach(() => {
    upsertMock.mockClear()
    fromMock.mockClear()
  })

  it('rejects without x-api-key', async () => {
    const { POST } = await importRoute()
    const res = await POST(makeReq({ client_id: VALID_UUID, source_table: 'client_brand_books', source_id: SRC_UUID, sections: [{ section_label: 's1', text: 'long enough text' }] }, ''))
    expect(res.status).toBe(401)
  })

  it('rejects invalid_json', async () => {
    const { POST } = await importRoute()
    const r = new Request('https://example.com/api/brain/ingest-source', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': 'test-key' },
      body: 'not-json',
    })
    const res = await POST(r)
    expect(res.status).toBe(400)
    const j = await res.json()
    expect(j.code).toBe('E-INPUT-PARSE')
  })

  it('rejects missing client_id', async () => {
    const { POST } = await importRoute()
    const res = await POST(makeReq({ source_table: 'client_brand_books', source_id: SRC_UUID, sections: [] }))
    expect(res.status).toBe(400)
    const j = await res.json()
    expect(j.code).toBe('E-BRAIN-INGEST-MISSING')
  })

  it('rejects invalid source_table', async () => {
    const { POST } = await importRoute()
    const res = await POST(makeReq({ client_id: VALID_UUID, source_table: 'arbitrary_table', source_id: SRC_UUID, sections: [{ section_label: 's', text: 'x'.repeat(50) }] }))
    expect(res.status).toBe(400)
    const j = await res.json()
    expect(j.code).toBe('E-BRAIN-INGEST-SOURCE-TABLE')
  })

  it('rejects empty sections', async () => {
    const { POST } = await importRoute()
    const res = await POST(makeReq({ client_id: VALID_UUID, source_table: 'client_brand_books', source_id: SRC_UUID, sections: [] }))
    expect(res.status).toBe(400)
    const j = await res.json()
    expect(j.code).toBe('E-BRAIN-INGEST-NO-SECTIONS')
  })

  it('returns 200 with no_valid_sections when all sections too short', async () => {
    const { POST } = await importRoute()
    const res = await POST(makeReq({ client_id: VALID_UUID, source_table: 'client_brand_books', source_id: SRC_UUID, sections: [{ section_label: 's', text: 'short' }] }))
    expect(res.status).toBe(200)
    const j = await res.json()
    expect(j.note).toContain('no_valid_sections')
  })

  it('happy path · embeds + upserts canonical', async () => {
    const { POST } = await importRoute()
    const res = await POST(makeReq({
      client_id: VALID_UUID,
      source_table: 'client_brand_books',
      source_id: SRC_UUID,
      sections: [
        { section_label: 'brand_purpose', text: 'We help SMBs grow with marketing automation.' },
        { section_label: 'tone_guidelines', text: 'Professional yet warm · avoid jargon.' },
      ],
    }))
    expect(res.status).toBe(200)
    const j = await res.json()
    expect(j.ok).toBe(true)
    expect(j.chunks_upserted).toBe(2)
    expect(j.sections_processed).toBe(2)
    expect(j.cost_usd).toBeGreaterThan(0)
    expect(j.embedding_model).toBe('text-embedding-3-small')
  })

  it('filters sections with text <10 chars', async () => {
    const { POST } = await importRoute()
    const res = await POST(makeReq({
      client_id: VALID_UUID,
      source_table: 'client_icp_documents',
      source_id: SRC_UUID,
      sections: [
        { section_label: 'ok_section', text: 'Long enough text here.' },
        { section_label: 'too_short', text: 'tiny' },
      ],
    }))
    expect(res.status).toBe(200)
    const j = await res.json()
    expect(j.sections_processed).toBe(1)
  })
})
