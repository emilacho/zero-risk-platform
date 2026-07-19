/**
 * CANDADO #1 · /api/competitors/scrape-verify · el seam scrape→writer→re-gate.
 * Verifica el invariante de procedencia honesta + degradación + scrape_trace + idempotencia
 * de llamada. $0 · todo mockeado (sin actor vivo · sin DB real).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── mocks ──────────────────────────────────────────────────────────────────
const scrapeMock = vi.fn()
const persistChunksMock = vi.fn().mockResolvedValue({ ok: true, chunks_upserted: 1 })

vi.mock('@/lib/internal-auth', () => ({
  checkInternalKey: () => ({ ok: true }),
}))
vi.mock('@/lib/apify/scrape-competitor', () => ({
  scrapeCompetitorProfile: (...a: unknown[]) => scrapeMock(...a),
}))
vi.mock('@/lib/apify/client', () => ({
  ApifyClient: class {
    constructor() {}
  },
}))
vi.mock('@/lib/brain/persist-chunks', () => ({
  persistChunks: (...a: unknown[]) => persistChunksMock(...a),
}))

// supabase stub · match-then-upsert · devuelve un id para landscape
const supabaseStub = {
  from: () => ({
    select: () => ({
      eq: () => ({
        eq: () => ({ maybeSingle: () => ({ data: null }) }),
      }),
    }),
    update: () => ({ eq: () => ({ data: null }) }),
    insert: () => ({ select: () => ({ single: () => ({ data: { id: 'landscape-1' } }) }) }),
  }),
}
vi.mock('@/lib/supabase', () => ({
  getSupabaseAdmin: () => supabaseStub,
}))

const { POST } = await import('@/app/api/competitors/scrape-verify/route')

const req = (body: unknown) =>
  new Request('http://localhost/api/competitors/scrape-verify', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': 'test' },
    body: JSON.stringify(body),
  })

const scrapedResult = {
  ok: true,
  status: 'scraped',
  scraped_at: '2026-07-19T00:00:00.000Z',
  platform: 'instagram',
  actor_id: 'apify/instagram-profile-scraper',
  run_id: 'run-1',
  dataset_id: 'ds-1',
  competitor: {
    name: 'Peniche Surf Camp',
    website: 'https://www.penichesurfcamp.com',
    handles: { instagram: 'penichesurfcamp' },
    competitor_type: 'direct',
    positioning: 'Surf all day, party all night',
    why: 'scraped',
    source: 'apify_scrape',
    trust_level: 'untrusted',
    deep_scan_data: { followers_count: 45000, biography: 'Surf all day' },
  },
  raw_item_ref: { dataset_id: 'ds-1', item_index: 0 },
}

beforeEach(() => {
  scrapeMock.mockReset()
  persistChunksMock.mockClear()
  process.env.APIFY_API_TOKEN = 'apify_test_token'
})

describe('POST /api/competitors/scrape-verify', () => {
  it('scrape real → source apify_scrape + persistChunks con scrape_trace:true', async () => {
    scrapeMock.mockResolvedValue(scrapedResult)
    const res = await POST(
      req({
        client_id: 'client-1',
        competitors: [{ name: 'Peniche Surf Camp', handle: 'penichesurfcamp' }],
      }),
    )
    const json = await res.json()
    expect(json.scraped_count).toBe(1)
    expect(json.competitors[0].source).toBe('apify_scrape')
    expect(json.competitors[0].deep_scan_data.followers_count).toBe(45000)
    // el invariante: scrape_trace:true SÓLO en scrape real
    expect(persistChunksMock).toHaveBeenCalledTimes(1)
    expect(persistChunksMock.mock.calls[0][1]).toMatchObject({
      source: 'apify_scrape',
      scrapeTrace: true,
      sourceTable: 'client_competitive_landscape',
    })
  })

  it('scrape vacío (empty) → degrada a auto_discovery · SIN persistChunks · SIN scrape_trace', async () => {
    scrapeMock.mockResolvedValue({ ...scrapedResult, status: 'empty', competitor: null })
    const res = await POST(
      req({ client_id: 'client-1', competitors: [{ name: 'X', handle: 'x' }] }),
    )
    const json = await res.json()
    expect(json.scraped_count).toBe(0)
    expect(json.competitors[0].source).toBe('auto_discovery')
    expect(persistChunksMock).not.toHaveBeenCalled()
  })

  it('scrape error → degrada a auto_discovery (honesto · no tumba)', async () => {
    scrapeMock.mockResolvedValue({ ...scrapedResult, status: 'error', competitor: null })
    const res = await POST(req({ client_id: 'client-1', competitors: [{ name: 'X', website: 'https://x.com' }] }))
    const json = await res.json()
    expect(json.competitors[0].source).toBe('auto_discovery')
    expect(json.degraded_count).toBe(1)
  })

  it('sin token Apify → degraded_all (no 5xx · el alta sigue)', async () => {
    delete process.env.APIFY_API_TOKEN
    delete process.env.APIFY_TOKEN
    const res = await POST(req({ client_id: 'client-1', competitors: [{ name: 'X', handle: 'x' }] }))
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.degraded_all).toBe(true)
    expect(json.competitors[0].source).toBe('auto_discovery')
  })

  it('mezcla · uno scrapeado + uno vacío → 1 apify_scrape + 1 auto_discovery', async () => {
    scrapeMock
      .mockResolvedValueOnce(scrapedResult)
      .mockResolvedValueOnce({ ...scrapedResult, status: 'empty', competitor: null })
    const res = await POST(
      req({
        client_id: 'client-1',
        competitors: [
          { name: 'Peniche Surf Camp', handle: 'penichesurfcamp' },
          { name: 'Ghost', handle: 'ghost' },
        ],
      }),
    )
    const json = await res.json()
    expect(json.scraped_count).toBe(1)
    expect(json.degraded_count).toBe(1)
    const bySource = json.competitors.map((c: { source: string }) => c.source).sort()
    expect(bySource).toEqual(['apify_scrape', 'auto_discovery'])
  })

  it('rechaza sin client_id', async () => {
    const res = await POST(req({ competitors: [{ name: 'X', handle: 'x' }] }))
    expect(res.status).toBe(400)
  })

  it('rechaza competidores sin handle ni website', async () => {
    const res = await POST(req({ client_id: 'client-1', competitors: [{ name: 'X' }] }))
    expect(res.status).toBe(400)
  })
})
