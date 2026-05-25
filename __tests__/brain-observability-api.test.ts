/**
 * Sprint 8D · /api/agent-invocations/[id]/brain-chunks + recent tests.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const maybeSingleMock = vi.fn<() => Promise<{ data: unknown; error: unknown }>>(async () => ({ data: null, error: null }))
const rpcMock = vi.fn<() => Promise<{ data: unknown; error: unknown }>>(async () => ({ data: [], error: null }))
const eqMock = vi.fn(() => ({ maybeSingle: maybeSingleMock }))
const limitMock = vi.fn<() => Promise<{ data: unknown; error: unknown }>>(async () => ({ data: [], error: null }))
const orderMock = vi.fn(() => ({ limit: limitMock, eq: vi.fn(() => ({ limit: limitMock })) }))
const selectMock = vi.fn(() => ({ eq: eqMock, order: orderMock }))
const fromMock = vi.fn(() => ({ select: selectMock }))
vi.mock('@/lib/supabase', () => ({
  getSupabaseAdmin: vi.fn(() => ({ from: fromMock, rpc: rpcMock })),
}))

vi.mock('@/lib/brain/embed', () => ({
  generateEmbedding: vi.fn(async () => ({ ok: true, embedding: new Array(1536).fill(0.001), model: 'text-embedding-3-small', tokens: 50 })),
}))

const VALID_ID = '5c2d2dd5-a49e-4da3-87c3-03b504b734f6'

describe('GET /api/agent-invocations/[id]/brain-chunks', () => {
  beforeEach(() => {
    maybeSingleMock.mockClear()
    rpcMock.mockClear()
  })

  it('rejects invalid id', async () => {
    const { GET } = await import('../src/app/api/agent-invocations/[id]/brain-chunks/route')
    const res = await GET(new Request('https://example.com/api/agent-invocations/not-uuid/brain-chunks'), { params: Promise.resolve({ id: 'not-uuid' }) })
    expect(res.status).toBe(400)
  })

  it('returns 404 when invocation not found', async () => {
    maybeSingleMock.mockResolvedValueOnce({ data: null, error: null })
    const { GET } = await import('../src/app/api/agent-invocations/[id]/brain-chunks/route')
    const res = await GET(new Request(`https://example.com/api/agent-invocations/${VALID_ID}/brain-chunks`), { params: Promise.resolve({ id: VALID_ID }) })
    expect(res.status).toBe(404)
  })

  it('happy path · returns invocation + brain metadata + live replay', async () => {
    maybeSingleMock.mockResolvedValueOnce({
      data: {
        id: VALID_ID,
        agent_id: 'jefe-marketing',
        client_id: VALID_ID,
        model: 'claude-sonnet-4-6',
        cost_usd: 0.05,
        duration_ms: 10000,
        tokens_input: 100,
        tokens_output: 500,
        started_at: '2026-05-24T09:40:37.352Z',
        status: 'completed',
        metadata: {
          task_text: 'phase_execution',
          brain_hit: true,
          brain_chunks_count: 5,
          brain_query_ms: 611,
          brain_cost_usd: 4.65e-7,
        },
      },
      error: null,
    })
    rpcMock.mockResolvedValueOnce({
      data: [
        { chunk_id: 'c1', source_table: 'client_brand_books', source_id: 'src-1', section_label: 'brand_purpose', chunk_text: 'Empower SMBs.', similarity: 0.87 },
      ],
      error: null,
    })
    const { GET } = await import('../src/app/api/agent-invocations/[id]/brain-chunks/route')
    const res = await GET(new Request(`https://example.com/api/agent-invocations/${VALID_ID}/brain-chunks`), { params: Promise.resolve({ id: VALID_ID }) })
    expect(res.status).toBe(200)
    const j = await res.json()
    expect(j.invocation.agent).toBe('jefe-marketing')
    expect(j.brain_metadata.brain_chunks_count).toBe(5)
    expect(j.live_replay.chunks).toHaveLength(1)
    expect(j.live_replay.chunks[0].similarity).toBe(0.87)
  })
})

describe('GET /api/agent-invocations/recent', () => {
  it('returns recent invocations list', async () => {
    limitMock.mockResolvedValueOnce({
      data: [
        {
          id: VALID_ID,
          agent_id: 'jefe-marketing',
          agent_name: null,
          client_id: VALID_ID,
          model: 'claude-sonnet-4-6',
          cost_usd: 0.05,
          duration_ms: 1000,
          started_at: '2026-05-24T09:40:37.352Z',
          status: 'completed',
          metadata: { task_text: 'phase_execution', brain_hit: true, brain_chunks_count: 5 },
        },
      ],
      error: null,
    })
    const { GET } = await import('../src/app/api/agent-invocations/recent/route')
    const res = await GET(new Request('https://example.com/api/agent-invocations/recent?limit=10'))
    expect(res.status).toBe(200)
    const j = await res.json()
    expect(j.count).toBe(1)
    expect(j.invocations[0].agent).toBe('jefe-marketing')
    expect(j.invocations[0].brain_chunks_count).toBe(5)
  })
})
