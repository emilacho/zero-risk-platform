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

// supabase stub STATEFUL · match-then-upsert · trackea inserts/updates para probar
// idempotencia (Lenovo agregado 2: 2 llamadas + count · verificalo, no lo asumas).
const dbState = { existingId: null as string | null, inserts: 0, updates: 0 }
const supabaseStub = {
  from: () => ({
    select: () => ({
      eq: () => ({
        eq: () => ({
          maybeSingle: () => ({ data: dbState.existingId ? { id: dbState.existingId } : null }),
        }),
      }),
    }),
    update: () => ({
      eq: () => {
        dbState.updates++
        return { data: null }
      },
    }),
    insert: () => ({
      select: () => ({
        single: () => {
          dbState.inserts++
          dbState.existingId = 'landscape-1' // fila ahora existe → 2ª llamada la encuentra
          return { data: { id: 'landscape-1' } }
        },
      }),
    }),
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
  dbState.existingId = null
  dbState.inserts = 0
  dbState.updates = 0
  process.env.APIFY_API_TOKEN = 'apify_test_token'
  delete process.env.SCRAPE_VERIFY_TIMEOUT_MS
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

  it('IDEMPOTENCIA (Lenovo 2 · 2 llamadas + count): re-correr NO duplica · 1 insert + 1 update', async () => {
    scrapeMock.mockResolvedValue(scrapedResult)
    const call = () =>
      POST(req({ client_id: 'client-1', competitors: [{ name: 'Peniche Surf Camp', handle: 'penichesurfcamp' }] }))
    await call() // 1ª: fila no existe → INSERT
    await call() // 2ª: fila ya existe (match) → UPDATE, NO 2º insert
    expect(dbState.inserts).toBe(1) // ← count: una sola fila creada
    expect(dbState.updates).toBe(1) // ← la 2ª tomó el camino idempotente (update)
  })

  it('TIMEOUT→advisory (Lenovo 1): scrape que no responde a tiempo → degrada a auto_discovery (no cuelga)', async () => {
    process.env.SCRAPE_VERIFY_TIMEOUT_MS = '30'
    // scrape que resuelve DESPUÉS del tope → el withTimeout gana → degradación honesta
    scrapeMock.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve(scrapedResult), 200)),
    )
    const res = await POST(req({ client_id: 'client-1', competitors: [{ name: 'Slow', handle: 'slow' }] }))
    const json = await res.json()
    expect(res.status).toBe(200) // el alta NO se cae
    expect(json.competitors[0].source).toBe('auto_discovery')
    expect(json.scraped_count).toBe(0)
    expect(persistChunksMock).not.toHaveBeenCalled()
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
