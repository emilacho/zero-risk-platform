/**
 * Sprint 8D · /api/notion/create-agent-output-subpage canonical tests.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

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
}

describe('POST /api/notion/create-agent-output-subpage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
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
    // 250 lines markdown · should cap at 100
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
