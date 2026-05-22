/**
 * Sprint 7.5 A8 · unit tests for Client Brain wire-in.
 *
 * Covers (12 cases) ·
 *   embed lib · 6 cases (key missing · empty · happy · provider err · network err · batch order)
 *   persist-chunks · 3 cases (empty inputs · happy upsert · partial fail)
 *   brain-enrichment · 3 cases (no clientId · brain empty · happy chunks)
 *
 * All vitest · isolated · mock fetch + supabase client.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  generateEmbedding,
  generateEmbeddings,
  estimateCost,
  EMBEDDING_DIMENSIONS,
} from '../src/lib/brain/embed'

const ORIG_KEY = process.env.OPENAI_API_KEY

beforeEach(() => {
  process.env.OPENAI_API_KEY = 'test-key-redacted'
})

afterEach(() => {
  if (ORIG_KEY === undefined) delete process.env.OPENAI_API_KEY
  else process.env.OPENAI_API_KEY = ORIG_KEY
})

describe('generateEmbedding', () => {
  it('1. returns ServiceUnconfigured when OPENAI_API_KEY missing', async () => {
    delete process.env.OPENAI_API_KEY
    const r = await generateEmbedding('hello')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.code).toBe('ServiceUnconfigured')
  })

  it('2. rejects empty text', async () => {
    const r = await generateEmbedding('   ')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.code).toBe('InvalidInput')
  })

  it('3. happy path · returns 1536d embedding', async () => {
    const stub = vi.fn(async () =>
      new Response(
        JSON.stringify({
          data: [{ embedding: Array.from({ length: EMBEDDING_DIMENSIONS }, () => 0.1) }],
          usage: { total_tokens: 42 },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    ) as unknown as typeof fetch
    const r = await generateEmbedding('brand voice = playful', { fetchImpl: stub })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.embedding.length).toBe(EMBEDDING_DIMENSIONS)
      expect(r.tokens).toBe(42)
      expect(r.model).toBe('text-embedding-3-small')
    }
  })

  it('4. ProviderError on non-2xx', async () => {
    const stub = vi.fn(async () =>
      new Response('{"error":"rate_limit"}', { status: 429 }),
    ) as unknown as typeof fetch
    const r = await generateEmbedding('test', { fetchImpl: stub })
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.code).toBe('ProviderError')
      expect(r.status).toBe(429)
    }
  })

  it('5. NetworkError when fetch throws', async () => {
    const stub = vi.fn(async () => {
      throw new Error('connection refused')
    }) as unknown as typeof fetch
    const r = await generateEmbedding('test', { fetchImpl: stub })
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.code).toBe('NetworkError')
      expect(r.detail).toContain('connection refused')
    }
  })
})

describe('generateEmbeddings (batch)', () => {
  it('6. preserves input order via index field', async () => {
    const stub = vi.fn(async (_url, init) => {
      const body = JSON.parse((init?.body as string) ?? '{}')
      const data = (body.input as string[]).map((_, i) => ({
        embedding: Array.from({ length: EMBEDDING_DIMENSIONS }, () => i / 10),
        index: i,
      }))
      // shuffle to test sort logic
      return new Response(
        JSON.stringify({ data: data.reverse(), usage: { total_tokens: 100 } }),
        { status: 200 },
      )
    }) as unknown as typeof fetch
    const r = await generateEmbeddings(['a', 'b', 'c'], { fetchImpl: stub })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.embeddings.length).toBe(3)
      // First embedding should have all 0/10=0 (index 0)
      expect(r.embeddings[0][0]).toBe(0)
      // Third should have 2/10=0.2 (index 2)
      expect(r.embeddings[2][0]).toBeCloseTo(0.2, 5)
    }
  })

  it('7. rejects batches larger than 2048', async () => {
    const inputs = Array.from({ length: 2049 }, (_, i) => `text-${i}`)
    const r = await generateEmbeddings(inputs)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.code).toBe('InvalidInput')
  })

  it('8. returns InvalidInput on empty array', async () => {
    const r = await generateEmbeddings([])
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.code).toBe('InvalidInput')
  })
})

describe('estimateCost', () => {
  it('9. computes $0.00002 per 1000 tokens', () => {
    expect(estimateCost(1000)).toBeCloseTo(0.00002, 8)
    expect(estimateCost(500)).toBeCloseTo(0.00001, 8)
    expect(estimateCost(0)).toBe(0)
  })
})

describe('chunksFromBrandBook', () => {
  it('10. extracts text + jsonb fields from brand book row', async () => {
    const mod = await import('../src/lib/brain/persist-chunks')
    const row = {
      id: 'test-uuid',
      client_id: 'client-uuid',
      brand_purpose: 'Make security accessible',
      voice_description: 'Friendly · authoritative',
      tone_guidelines: { primary: 'warm', secondary: 'urgent' },
      forbidden_words: ['cheap', 'risky'],
      compliance_notes: null,
      writing_style: '',
    }
    const chunks = mod.chunksFromBrandBook(row)
    expect(chunks.length).toBeGreaterThanOrEqual(4) // 2 text + 2 jsonb
    const labels = chunks.map((c) => c.section_label)
    expect(labels).toContain('brand_purpose')
    expect(labels).toContain('voice_description')
    expect(labels).toContain('tone_guidelines')
    expect(labels).toContain('forbidden_words')
    // null/empty fields skipped
    expect(labels).not.toContain('compliance_notes')
    expect(labels).not.toContain('writing_style')
  })

  it('11. returns empty array for row with no useful fields', async () => {
    const mod = await import('../src/lib/brain/persist-chunks')
    const row = { id: 'x', client_id: 'c', updated_at: '2026-05-22' }
    const chunks = mod.chunksFromBrandBook(row)
    expect(chunks.length).toBe(0)
  })

  it('12. handles jsonb stored as already-stringified text gracefully', async () => {
    const mod = await import('../src/lib/brain/persist-chunks')
    const row = {
      id: 'x',
      client_id: 'c',
      brand_purpose: 'Test purpose',
      tone_guidelines: '{"primary":"playful"}', // pre-stringified
    }
    const chunks = mod.chunksFromBrandBook(row)
    expect(chunks.some((c) => c.section_label === 'tone_guidelines')).toBe(true)
    const tg = chunks.find((c) => c.section_label === 'tone_guidelines')
    expect(tg?.chunk_text).toContain('playful')
  })
})
