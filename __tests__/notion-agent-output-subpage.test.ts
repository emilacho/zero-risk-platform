/**
 * Sprint 8D · /api/notion/create-agent-output-subpage canonical tests.
 * Sprint 9 cleanup A2 · agregadas tests canonical para paralelo brain RAG
 * ingest (best-effort canonical · helper exported mapSectionLabelToBrainTable +
 * ingestBrainRagParalelo).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@/lib/internal-auth', () => ({
  checkInternalKey: vi.fn((r: Request) => {
    const k = r.headers.get('x-api-key')
    return k === 'test-key' ? { ok: true } : { ok: false, reason: 'missing' }
  }),
}))

vi.mock('@/lib/notion-client', async () => {
  const createSubpageMock = vi.fn(async (input: { parentPageId: string; title: string; blocks: unknown[] }) => ({
    page_id: 'subpage-id-canonical',
    page_url: 'https://notion.so/subpage-canonical',
    created_time: '2026-05-25T13:00:00Z',
  }))
  class NotionConfigError extends Error {}
  return {
    createSubpage: createSubpageMock,
    NotionConfigError,
    paragraph: (t: string) => ({ type: 'paragraph', paragraph: { rich_text: [{ text: { content: t } }] } }),
    heading2: (t: string) => ({ type: 'heading_2', heading_2: { rich_text: [{ text: { content: t } }] } }),
    heading3: (t: string) => ({ type: 'heading_3', heading_3: { rich_text: [{ text: { content: t } }] } }),
    bullet: (t: string) => ({ type: 'bulleted_list_item', bulleted_list_item: { rich_text: [{ text: { content: t } }] } }),
    divider: () => ({ type: 'divider', divider: {} }),
  }
})

function makeReq(body: unknown, key = 'test-key'): Request {
  return new Request('https://example.com/api/notion/create-agent-output-subpage', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': key },
    body: JSON.stringify(body),
  })
}

const VALID = {
  workspace_id: '5c2d2dd5-a49e-4da3-87c3-03b504b734f6',
  agent_slug: 'brand-strategist',
  title: 'Brand Book v1 · canonical',
  content_markdown: '## Brand Purpose\n\nEmpower SMBs.\n\n## Tone\n\n- Professional\n- Warm',
  client_id: 'client-canonical-id',
  section_label: 'brand_book_v1',
}

// Helper canonical · mock fetch global con response configurable per test
function mockFetchOk(body: unknown) {
  return vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => body,
    text: async () => JSON.stringify(body),
  })) as unknown as typeof fetch
}
function mockFetchFail(status: number, text: string) {
  return vi.fn(async () => ({
    ok: false,
    status,
    json: async () => ({ error: 'fail' }),
    text: async () => text,
  })) as unknown as typeof fetch
}
function mockFetchThrow(msg: string) {
  return vi.fn(async () => { throw new Error(msg) }) as unknown as typeof fetch
}

describe('POST /api/notion/create-agent-output-subpage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Default · mock fetch returns brain RAG ingest success canonical
    vi.stubGlobal('fetch', mockFetchOk({ ok: true, chunks_upserted: 1, cost_usd: 0.00000104, tokens_used: 52 }))
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('rejects without x-api-key', async () => {
    const { POST } = await import('../src/app/api/notion/create-agent-output-subpage/route')
    const res = await POST(makeReq(VALID, ''))
    expect(res.status).toBe(401)
  })

  it('rejects missing fields', async () => {
    const { POST } = await import('../src/app/api/notion/create-agent-output-subpage/route')
    const res = await POST(makeReq({ agent_slug: 'brand-strategist' }))
    expect(res.status).toBe(400)
    const j = await res.json()
    expect(j.code).toBe('E-NOTION-AGENT-SUBPAGE-MISSING')
  })

  it('rejects invalid JSON body', async () => {
    const r = new Request('https://example.com/api/notion/create-agent-output-subpage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': 'test-key' },
      body: 'not-json',
    })
    const { POST } = await import('../src/app/api/notion/create-agent-output-subpage/route')
    const res = await POST(r)
    expect(res.status).toBe(400)
    const j = await res.json()
    expect(j.code).toBe('E-INPUT-PARSE')
  })

  it('happy path · creates subpage canonical + returns canonical response', async () => {
    const { POST } = await import('../src/app/api/notion/create-agent-output-subpage/route')
    const res = await POST(makeReq(VALID))
    expect(res.status).toBe(200)
    const j = await res.json()
    expect(j.ok).toBe(true)
    expect(j.subpage_id).toBe('subpage-id-canonical')
    expect(j.subpage_url).toBe('https://notion.so/subpage-canonical')
    expect(j.agent_slug).toBe('brand-strategist')
    expect(j.blocks_count).toBeGreaterThan(0)
    expect(j.blocks_capped).toBe(false)
  })

  it('caps blocks at 100 canonical', async () => {
    const md = Array.from({ length: 250 }, (_, i) => `Line ${i}`).join('\n')
    const { POST } = await import('../src/app/api/notion/create-agent-output-subpage/route')
    const res = await POST(makeReq({ ...VALID, content_markdown: md }))
    expect(res.status).toBe(200)
    const j = await res.json()
    expect(j.blocks_count).toBe(100)
    expect(j.blocks_capped).toBe(true)
  })

  it('returns 502 when Notion API fails', async () => {
    const notionMod = await import('@/lib/notion-client')
    const mock = notionMod.createSubpage as unknown as ReturnType<typeof vi.fn>
    mock.mockRejectedValueOnce(new Error('Notion API rate limit'))
    const { POST } = await import('../src/app/api/notion/create-agent-output-subpage/route')
    const res = await POST(makeReq(VALID))
    expect(res.status).toBe(502)
    const j = await res.json()
    expect(j.ok).toBe(false)
    expect(j.error).toBe('notion_api_failed')
  })
})

describe('Sprint 9 cleanup A2 · paralelo brain RAG ingest canonical', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('happy path · Notion success + brain RAG paralelo success · brain_rag_paralelo field populated canonical', async () => {
    vi.stubGlobal('fetch', mockFetchOk({ ok: true, chunks_upserted: 1, cost_usd: 0.00000104, tokens_used: 52 }))
    const { POST } = await import('../src/app/api/notion/create-agent-output-subpage/route')
    const res = await POST(makeReq(VALID))
    expect(res.status).toBe(200)
    const j = await res.json()
    expect(j.brain_rag_paralelo).toBeDefined()
    expect(j.brain_rag_paralelo.attempted).toBe(true)
    expect(j.brain_rag_paralelo.success).toBe(true)
    expect(j.brain_rag_paralelo.source_table).toBe('client_brand_books')
    expect(j.brain_rag_paralelo.chunks_upserted).toBe(1)
  })

  it('best-effort canon · brain RAG fail · Notion sub-page STILL success canonical · NO rollback', async () => {
    vi.stubGlobal('fetch', mockFetchFail(502, 'Brain RAG upstream error'))
    const { POST } = await import('../src/app/api/notion/create-agent-output-subpage/route')
    const res = await POST(makeReq(VALID))
    expect(res.status).toBe(200) // sub-page canonical persiste
    const j = await res.json()
    expect(j.ok).toBe(true) // canonical primary deliverable
    expect(j.subpage_id).toBe('subpage-id-canonical')
    expect(j.brain_rag_paralelo.attempted).toBe(true)
    expect(j.brain_rag_paralelo.success).toBe(false)
    expect(j.brain_rag_paralelo.error).toContain('http_502')
    expect(console.error).toHaveBeenCalled() // log canon best-effort
  })

  it('best-effort canon · brain RAG throws exception · Notion sub-page STILL success', async () => {
    vi.stubGlobal('fetch', mockFetchThrow('ECONNREFUSED'))
    const { POST } = await import('../src/app/api/notion/create-agent-output-subpage/route')
    const res = await POST(makeReq(VALID))
    expect(res.status).toBe(200)
    const j = await res.json()
    expect(j.ok).toBe(true)
    expect(j.brain_rag_paralelo.attempted).toBe(true)
    expect(j.brain_rag_paralelo.success).toBe(false)
    expect(j.brain_rag_paralelo.error).toContain('exception')
  })

  it('skip canon · client_id missing · attempted=false · skip_reason=client_id_missing', async () => {
    vi.stubGlobal('fetch', mockFetchOk({ ok: true }))
    const { POST } = await import('../src/app/api/notion/create-agent-output-subpage/route')
    const res = await POST(makeReq({ ...VALID, client_id: '' }))
    expect(res.status).toBe(200)
    const j = await res.json()
    expect(j.brain_rag_paralelo.attempted).toBe(false)
    expect(j.brain_rag_paralelo.skip_reason).toBe('client_id_missing')
  })

  it('skip canon · content too short · attempted=false · skip_reason=content_too_short_for_embed', async () => {
    vi.stubGlobal('fetch', mockFetchOk({ ok: true }))
    const { POST } = await import('../src/app/api/notion/create-agent-output-subpage/route')
    const res = await POST(makeReq({ ...VALID, content_markdown: 'short' }))
    expect(res.status).toBe(200)
    const j = await res.json()
    expect(j.brain_rag_paralelo.attempted).toBe(false)
    expect(j.brain_rag_paralelo.skip_reason).toBe('content_too_short_for_embed')
  })
})

describe('mapSectionLabelToBrainTable canonical · reconciled mapping vs ALLOWED_SOURCE_TABLES canon', () => {
  it('brand_book_v1 → client_brand_books canonical', async () => {
    const { mapSectionLabelToBrainTable } = await import('../src/app/api/notion/create-agent-output-subpage/route')
    expect(mapSectionLabelToBrainTable('brand_book_v1')).toBe('client_brand_books')
    expect(mapSectionLabelToBrainTable('brand_book_v0')).toBe('client_brand_books')
    expect(mapSectionLabelToBrainTable('brand_book')).toBe('client_brand_books')
  })

  it('icp_v1 → client_icp_documents canonical', async () => {
    const { mapSectionLabelToBrainTable } = await import('../src/app/api/notion/create-agent-output-subpage/route')
    expect(mapSectionLabelToBrainTable('icp_v1')).toBe('client_icp_documents')
    expect(mapSectionLabelToBrainTable('icp')).toBe('client_icp_documents')
    expect(mapSectionLabelToBrainTable('icp_document')).toBe('client_icp_documents')
  })

  it('competitive_v2 → client_competitive_landscape canonical', async () => {
    const { mapSectionLabelToBrainTable } = await import('../src/app/api/notion/create-agent-output-subpage/route')
    expect(mapSectionLabelToBrainTable('competitive_v2')).toBe('client_competitive_landscape')
    expect(mapSectionLabelToBrainTable('competitive')).toBe('client_competitive_landscape')
  })

  it('kickoff_deck | first_sprint_plan | onboarding | layout → client_historical_outputs canonical fallback', async () => {
    const { mapSectionLabelToBrainTable } = await import('../src/app/api/notion/create-agent-output-subpage/route')
    expect(mapSectionLabelToBrainTable('kickoff_deck')).toBe('client_historical_outputs')
    expect(mapSectionLabelToBrainTable('first_sprint_plan')).toBe('client_historical_outputs')
    expect(mapSectionLabelToBrainTable('onboarding')).toBe('client_historical_outputs')
    expect(mapSectionLabelToBrainTable('intake_form_v0')).toBe('client_historical_outputs')
    expect(mapSectionLabelToBrainTable('layout')).toBe('client_historical_outputs')
  })

  it('unknown label OR null OR empty → client_historical_outputs canonical default fallback', async () => {
    const { mapSectionLabelToBrainTable } = await import('../src/app/api/notion/create-agent-output-subpage/route')
    expect(mapSectionLabelToBrainTable('unknown_canonical_label')).toBe('client_historical_outputs')
    expect(mapSectionLabelToBrainTable(null)).toBe('client_historical_outputs')
    expect(mapSectionLabelToBrainTable(undefined)).toBe('client_historical_outputs')
    expect(mapSectionLabelToBrainTable('')).toBe('client_historical_outputs')
  })

  it('case-insensitive canonical normalization', async () => {
    const { mapSectionLabelToBrainTable } = await import('../src/app/api/notion/create-agent-output-subpage/route')
    expect(mapSectionLabelToBrainTable('BRAND_BOOK_V1')).toBe('client_brand_books')
    expect(mapSectionLabelToBrainTable('ICP_V1')).toBe('client_icp_documents')
  })
})
