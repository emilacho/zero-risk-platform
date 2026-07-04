/**
 * Tests · persist-brain · Discovery → competitive_landscape + icp_documents
 * + chunks (SPEC lazo agentico 2026-06-05 · gap D).
 *
 * Strategy · in-memory Supabase mock · validates the orchestration ·
 * UPSERT calls + chunk count + outcome shape · flag gate.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  competitorChunks,
  icpChunks,
  isDiscoveryBrainPushEnabled,
  persistDiscoveryToBrain,
  type DiscoveryOutput,
} from '@/lib/discovery-output'

const NAUFRAGO = 'd69100b5-8ad7-4bb0-908c-68b5544065dc'

const DISCOVERY: DiscoveryOutput = {
  client_id: NAUFRAGO,
  own_handles: { instagram: '@naufrago_ec' },
  competitors: [
    {
      name: 'La Pinta Quito',
      website: 'https://lapintaquito.com',
      handles: { instagram: '@lapintaquito' },
      why: 'Direct local rival · stronger brand',
      competitor_type: 'direct',
      positioning: 'Premium seafood ceviche',
    },
    {
      name: 'Mercado Carcelén',
      handles: { instagram: '@mercado_carcelen' },
    },
  ],
  icp: {
    audience_segment: 'Young professionals · F&B explorers',
    pain_points: ['Limited late-night options'],
    goals: ['Quick quality meal'],
  },
  competitive_landscape_summary:
    'Quito ghost-kitchen F&B is fragmented with 3-5 strong direct competitors.',
}

function makeFakeSupabase() {
  const inserted: Array<{ table: string; row: Record<string, unknown> }> = []
  const chunksUpserted: Array<Record<string, unknown>> = []

  function from(table: string) {
    return {
      upsert(row: Record<string, unknown>) {
        inserted.push({ table, row })
        if (table === 'client_brain_chunks') {
          chunksUpserted.push(row)
          return Promise.resolve({ error: null })
        }
        return {
          select(_cols: string) {
            return {
              maybeSingle: () =>
                Promise.resolve({
                  data: { id: `synthetic-${table}-${inserted.length}` },
                  error: null,
                }),
            }
          },
        }
      },
    }
  }
  return {
    fake: { from } as never,
    inserted,
    chunksUpserted,
  }
}

describe('isDiscoveryBrainPushEnabled · flag gate', () => {
  const orig = process.env.SALA_DISCOVERY_BRAIN_PUSH_ENABLED
  afterEach(() => {
    if (orig === undefined) delete process.env.SALA_DISCOVERY_BRAIN_PUSH_ENABLED
    else process.env.SALA_DISCOVERY_BRAIN_PUSH_ENABLED = orig
  })

  it('default-OFF when env missing', () => {
    delete process.env.SALA_DISCOVERY_BRAIN_PUSH_ENABLED
    expect(isDiscoveryBrainPushEnabled()).toBe(false)
  })
  it('on when env=true literal', () => {
    process.env.SALA_DISCOVERY_BRAIN_PUSH_ENABLED = 'true'
    expect(isDiscoveryBrainPushEnabled()).toBe(true)
  })
  it('any other value off', () => {
    process.env.SALA_DISCOVERY_BRAIN_PUSH_ENABLED = '1'
    expect(isDiscoveryBrainPushEnabled()).toBe(false)
  })
  it('explicit override wins', () => {
    process.env.SALA_DISCOVERY_BRAIN_PUSH_ENABLED = 'true'
    expect(isDiscoveryBrainPushEnabled({ enabled: false })).toBe(false)
  })
})

describe('persistDiscoveryToBrain · flag OFF', () => {
  it('returns flag_off outcome without touching supabase', async () => {
    const { fake, inserted } = makeFakeSupabase()
    const r = await persistDiscoveryToBrain({
      supabase: fake,
      discovery: DISCOVERY,
      enabled: false,
    })
    expect(r.errors).toContain('flag_off')
    expect(inserted.length).toBe(0)
  })
})

describe('persistDiscoveryToBrain · flag ON · happy path', () => {
  // Mock embed fetch so persistChunks's generateEmbedding works.
  beforeEach(() => {
    process.env.OPENAI_API_KEY = 'test-key'
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({ data: [{ embedding: new Array(1536).fill(0) }], usage: { total_tokens: 10 } }),
          { status: 200 },
        ),
      ),
    )
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('UPSERTs one competitor row per competitor + summary row', async () => {
    const { fake, inserted } = makeFakeSupabase()
    const r = await persistDiscoveryToBrain({
      supabase: fake,
      discovery: DISCOVERY,
      enabled: true,
    })
    const competitorInserts = inserted.filter(
      (i) => i.table === 'client_competitive_landscape',
    )
    // 2 competitors + 1 summary row = 3
    expect(competitorInserts.length).toBe(3)
    expect(r.competitor_landscape_rows).toBe(2) // summary not counted as competitor
  })

  it('UPSERTs one ICP document per segment', async () => {
    const { fake, inserted } = makeFakeSupabase()
    const r = await persistDiscoveryToBrain({
      supabase: fake,
      discovery: DISCOVERY,
      enabled: true,
    })
    const icpInserts = inserted.filter((i) => i.table === 'client_icp_documents')
    expect(icpInserts.length).toBe(1)
    expect(r.icp_document_rows).toBe(1)
  })

  it('writes chunks to client_brain_chunks via persistChunks helper', async () => {
    const { fake, chunksUpserted } = makeFakeSupabase()
    const r = await persistDiscoveryToBrain({
      supabase: fake,
      discovery: DISCOVERY,
      enabled: true,
    })
    expect(chunksUpserted.length).toBeGreaterThan(0)
    expect(r.brain_chunks_upserted).toBe(chunksUpserted.length)
  })

  // ── F1.1 · contract · etiqueta de procedencia de scrapes ──────────────
  it('F1.1 · scrape writes (competitive_landscape) llevan provenance source apify_scrape', async () => {
    const { fake, chunksUpserted } = makeFakeSupabase()
    await persistDiscoveryToBrain({ supabase: fake, discovery: DISCOVERY, enabled: true })

    // Competidores + landscape summary = data scrapeada por Apify → apify_scrape.
    const scrapeChunks = chunksUpserted.filter(
      (row) => row.source_table === 'client_competitive_landscape',
    )
    expect(scrapeChunks.length).toBeGreaterThan(0)
    for (const row of scrapeChunks) {
      const pt = row.provenance_tag as { source?: string; trust_level?: string }
      expect(pt.source).toBe('apify_scrape')
      expect(pt.trust_level).toBe('untrusted') // piso de confianza intacto (FASE C)
    }

    // ICP es DERIVADO (no scrape) → mantiene onboarding_discovery · no se toca.
    const icpChunkRows = chunksUpserted.filter(
      (row) => row.source_table === 'client_icp_documents',
    )
    expect(icpChunkRows.length).toBeGreaterThan(0)
    for (const row of icpChunkRows) {
      const pt = row.provenance_tag as { source?: string }
      expect(pt.source).toBe('onboarding_discovery')
    }
  })

  it('handles discovery without ICP gracefully', async () => {
    const { fake } = makeFakeSupabase()
    const { icp: _icp, ...withoutIcp } = DISCOVERY
    const r = await persistDiscoveryToBrain({
      supabase: fake,
      discovery: withoutIcp,
      enabled: true,
    })
    expect(r.icp_document_rows).toBe(0)
    expect(r.competitor_landscape_rows).toBe(2)
  })

  it('handles discovery without summary gracefully', async () => {
    const { fake } = makeFakeSupabase()
    const { competitive_landscape_summary: _s, ...withoutSummary } = DISCOVERY
    const r = await persistDiscoveryToBrain({
      supabase: fake,
      discovery: withoutSummary,
      enabled: true,
    })
    // Only competitor rows · no summary row
    expect(r.competitor_landscape_rows).toBe(2)
  })
})

describe('competitorChunks · per-section extraction', () => {
  it('always emits name chunk', () => {
    const chunks = competitorChunks({ name: 'La Pinta' })
    expect(chunks.find((c) => c.section_label === 'name')?.chunk_text).toBe('La Pinta')
  })

  it('emits positioning + why + social_handles when present', () => {
    const chunks = competitorChunks({
      name: 'X',
      positioning: 'Premium seafood',
      why: 'Local rival',
      handles: { instagram: '@x' },
    })
    const labels = chunks.map((c) => c.section_label).sort()
    expect(labels).toEqual(['name', 'positioning', 'social_handles', 'why_competitor'].sort())
  })

  it('skips empty fields', () => {
    const chunks = competitorChunks({ name: 'X' })
    expect(chunks.length).toBe(1)
  })
})

describe('icpChunks · per-section extraction', () => {
  it('always emits segment_name chunk', () => {
    const chunks = icpChunks({ audience_segment: 'CTOs' })
    expect(chunks[0].section_label).toBe('segment_name')
    expect(chunks[0].chunk_text).toBe('CTOs')
  })

  it('emits pains + goals + jtbd when populated', () => {
    const chunks = icpChunks({
      audience_segment: 'CTOs',
      pain_points: ['Time'],
      goals: ['Ship faster'],
      jobs_to_be_done: ['Reduce deploy friction'],
    })
    const labels = chunks.map((c) => c.section_label).sort()
    expect(labels).toContain('pain_points')
    expect(labels).toContain('goals')
    expect(labels).toContain('jtbd')
  })
})
