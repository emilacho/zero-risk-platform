/**
 * voc-ingest.test.ts · Sprint-brain §144 · Task 2
 *
 * Covers src/lib/brain/voc-ingest.ts · doble escritura VOC → estructurada + chunks.
 * Mock de @/lib/brain/embed (OpenAI) · Supabase se inyecta como fake chainable.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

type EmbedResult =
  | { ok: true; embeddings: number[][]; model: string; tokens: number }
  | { ok: false; code: string; detail: string }

const state: {
  embed: () => EmbedResult
  vocUpsert: () => { data: unknown; error: unknown }
  chunkUpsert: () => { data: unknown; error: unknown }
  calls: { table: string; op: string; rows: unknown; onConflict?: string }[]
} = {
  embed: () => ({ ok: true, embeddings: [], model: 'text-embedding-3-small', tokens: 10 }),
  vocUpsert: () => ({ data: [], error: null }),
  chunkUpsert: () => ({ data: [], error: null }),
  calls: [],
}

vi.mock('@/lib/brain/embed', () => ({
  generateEmbeddings: (texts: string[]) => {
    const r = state.embed()
    // Default: echo a fake embedding per text when test didn't set explicit embeddings.
    if (r.ok && r.embeddings.length === 0) {
      return Promise.resolve({ ...r, embeddings: texts.map(() => [0.1, 0.2]) })
    }
    return Promise.resolve(r)
  },
  EMBEDDING_DIMENSIONS: 1536,
}))

import { ingestVocEntries, buildVocContentText } from '../src/lib/brain/voc-ingest'

// Minimal chainable Supabase fake · supports .from().upsert().select()
function makeSupabase() {
  return {
    from(table: string) {
      return {
        upsert(rows: unknown, opts: { onConflict?: string }) {
          state.calls.push({ table, op: 'upsert', rows, onConflict: opts?.onConflict })
          return {
            select() {
              if (table === 'client_voc_library') return Promise.resolve(state.vocUpsert())
              if (table === 'client_brain_chunks') return Promise.resolve(state.chunkUpsert())
              return Promise.resolve({ data: [], error: null })
            },
          }
        },
      }
    },
  } as never
}

const ENTRY = {
  quote_text: 'El ceviche llegó fresquísimo y bien empacado, mejor que cualquier delivery.',
  source: 'google_review',
  customer_segment: 'B2C Guayaquil',
  sentiment: 'positive' as const,
  category: 'product_quality',
  themes: ['frescura', 'empaque'],
}

beforeEach(() => {
  state.embed = () => ({ ok: true, embeddings: [], model: 'text-embedding-3-small', tokens: 10 })
  state.vocUpsert = () => ({
    data: [{ id: 'voc-1', dedup_hash: 'h1', quote_text: ENTRY.quote_text }],
    error: null,
  })
  state.chunkUpsert = () => ({ data: [{ id: 'chunk-1' }], error: null })
  state.calls = []
})

describe('buildVocContentText', () => {
  it('wraps the quote + light context (name/segment/source/sentiment/themes)', () => {
    const txt = buildVocContentText({ ...ENTRY, customer_name: 'María' })
    expect(txt).toContain('"El ceviche')
    expect(txt).toContain('— María')
    expect(txt).toContain('(B2C Guayaquil)')
    expect(txt).toContain('source: google_review')
    expect(txt).toContain('sentiment: positive')
    expect(txt).toContain('themes: frescura, empaque')
  })
})

describe('ingestVocEntries · validation', () => {
  it('fails on missing client_id', async () => {
    const r = await ingestVocEntries(makeSupabase(), { clientId: '', entries: [ENTRY] })
    expect(r.ok).toBe(false)
    expect(r.error).toBe('missing_client_id')
  })

  it('fails when no valid entries (empty quote / missing source filtered out)', async () => {
    const r = await ingestVocEntries(makeSupabase(), {
      clientId: 'c-1',
      entries: [{ quote_text: 'x', source: '' } as never, { quote_text: '', source: 'y' } as never],
    })
    expect(r.error).toBe('no_valid_entries')
  })

  it('coerces invalid sentiment to neutral', async () => {
    await ingestVocEntries(makeSupabase(), {
      clientId: 'c-1',
      entries: [{ ...ENTRY, sentiment: 'angry' as never }],
    })
    const vocCall = state.calls.find((c) => c.table === 'client_voc_library')
    const rows = vocCall?.rows as Array<{ sentiment: string }>
    expect(rows[0].sentiment).toBe('neutral')
  })
})

describe('ingestVocEntries · happy path', () => {
  it('upserts structured row + chunk with correct keys + provenance evidence/tenant_trusted', async () => {
    const r = await ingestVocEntries(makeSupabase(), { clientId: 'c-1', entries: [ENTRY] })

    expect(r.ok).toBe(true)
    expect(r.entries_ingested).toBe(1)
    expect(r.chunks_upserted).toBe(1)
    expect(r.cost_usd).toBeGreaterThan(0)

    const vocCall = state.calls.find((c) => c.table === 'client_voc_library')
    expect(vocCall?.onConflict).toBe('dedup_hash')
    const vocRows = vocCall?.rows as Array<{ provenance_tag: { type: string; trust_level: string } }>
    expect(vocRows[0].provenance_tag.type).toBe('evidence')
    expect(vocRows[0].provenance_tag.trust_level).toBe('tenant_trusted')

    const chunkCall = state.calls.find((c) => c.table === 'client_brain_chunks')
    expect(chunkCall?.onConflict).toBe('client_id,source_table,source_id,section_label')
    const chunkRows = chunkCall?.rows as Array<{
      source_table: string
      source_id: string
      section_label: string
      provenance_tag: { type: string }
      metadata: { ingest_source: string }
    }>
    expect(chunkRows[0].source_table).toBe('client_voc_library')
    expect(chunkRows[0].source_id).toBe('voc-1') // paired back by quote_text
    expect(chunkRows[0].section_label).toBe('quote')
    expect(chunkRows[0].provenance_tag.type).toBe('evidence')
    expect(chunkRows[0].metadata.ingest_source).toBe('api/voc/ingest')
  })

  it('honors per-entry trust_level override', async () => {
    await ingestVocEntries(makeSupabase(), {
      clientId: 'c-1',
      entries: [{ ...ENTRY, trust_level: 'untrusted' }],
    })
    const vocRows = state.calls.find((c) => c.table === 'client_voc_library')?.rows as Array<{
      provenance_tag: { trust_level: string }
    }>
    expect(vocRows[0].provenance_tag.trust_level).toBe('untrusted')
  })
})

describe('ingestVocEntries · failure modes', () => {
  it('returns hard failure when the structured upsert errors', async () => {
    state.vocUpsert = () => ({ data: null, error: { message: 'unique violation' } })
    const r = await ingestVocEntries(makeSupabase(), { clientId: 'c-1', entries: [ENTRY] })
    expect(r.ok).toBe(false)
    expect(r.entries_ingested).toBe(0)
    expect(r.error).toMatch(/voc_upsert_failed/)
  })

  it('partial success when embed fails (structured landed · chunks skipped)', async () => {
    state.embed = () => ({ ok: false, code: 'ProviderError', detail: 'openai 500' })
    const r = await ingestVocEntries(makeSupabase(), { clientId: 'c-1', entries: [ENTRY] })
    expect(r.ok).toBe(false)
    expect(r.entries_ingested).toBe(1)
    expect(r.chunks_upserted).toBe(0)
    expect(r.error).toMatch(/embed_failed/)
  })

  it('reports chunk_upsert_failed when chunk write errors', async () => {
    state.chunkUpsert = () => ({ data: null, error: { message: 'check violation' } })
    const r = await ingestVocEntries(makeSupabase(), { clientId: 'c-1', entries: [ENTRY] })
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/chunk_upsert_failed/)
  })
})
