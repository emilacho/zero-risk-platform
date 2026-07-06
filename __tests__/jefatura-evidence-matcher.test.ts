/**
 * Tests · JEFATURA matching claim→chunk (endurecimiento 2 · ADR-020 M1).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

// Controllable mock of queryClientBrain: keyed by query text → results.
const state: { byQuery: Map<string, Array<{ chunk_id: string; source_table: string; similarity: number }>> } = {
  byQuery: new Map(),
}

vi.mock('@/lib/client-brain', () => ({
  queryClientBrain: (params: { query: string }) => {
    const rows = state.byQuery.get(params.query) ?? []
    // matcher expects BrainSearchResult shape (chunk_id + similarity + source_table)
    return Promise.resolve(
      rows.map((r) => ({
        chunk_id: r.chunk_id,
        source_table: r.source_table,
        source_id: 'sid',
        label: 'lbl',
        content_text: 'txt',
        similarity: r.similarity,
      })),
    )
  },
}))

import { matchClaimsToChunks, DEFAULT_MATCH_THRESHOLD } from '../src/lib/jefatura/evidence-matcher'

beforeEach(() => {
  state.byQuery = new Map()
})

describe('matchClaimsToChunks · claim→chunk real', () => {
  it('TODAS las claims matchean ≥ threshold → chunk_linked · coverage 1 · evidence_refs', async () => {
    state.byQuery.set('positioning claim', [{ chunk_id: 'ch-A', source_table: 'competitive_landscape', similarity: 0.91 }])
    state.byQuery.set('icp claim', [{ chunk_id: 'ch-B', source_table: 'icp_documents', similarity: 0.82 }])
    const out = await matchClaimsToChunks({
      client_id: 'c1',
      claims: [
        { field: 'positioning', text: 'positioning claim' },
        { field: 'icp_summary', text: 'icp claim' },
      ],
    })
    expect(out.grounding).toBe('chunk_linked')
    expect(out.coverage).toBe(1)
    expect(out.evidence_refs.sort()).toEqual(['ch-A', 'ch-B'])
    expect(out.matches[0]).toMatchObject({ field: 'positioning', chunk_id: 'ch-A', matched: true, source_table: 'competitive_landscape' })
  })

  it('una claim por debajo del threshold → prose_only · coverage parcial · esa claim sin chunk', async () => {
    state.byQuery.set('grounded', [{ chunk_id: 'ch-A', source_table: 'icp_documents', similarity: 0.9 }])
    state.byQuery.set('ungrounded', [{ chunk_id: 'ch-Z', source_table: 'icp_documents', similarity: 0.4 }])
    const out = await matchClaimsToChunks({
      client_id: 'c1',
      claims: [
        { field: 'a', text: 'grounded' },
        { field: 'b', text: 'ungrounded' },
      ],
    })
    expect(out.grounding).toBe('prose_only') // no sobre-vende: 1 sin fundamentar
    expect(out.coverage).toBe(0.5)
    expect(out.evidence_refs).toEqual(['ch-A'])
    expect(out.matches[1]).toMatchObject({ field: 'b', chunk_id: null, matched: false })
  })

  it('claim sin resultados del CEREBRO → no matched · prose_only', async () => {
    state.byQuery.set('x', [])
    const out = await matchClaimsToChunks({ client_id: 'c1', claims: [{ field: 'a', text: 'x' }] })
    expect(out.grounding).toBe('prose_only')
    expect(out.matches[0]).toMatchObject({ chunk_id: null, similarity: 0, matched: false })
    expect(out.evidence_refs).toEqual([])
  })

  it('claims vacío → prose_only · coverage 0 (nada que fundamentar ≠ fundamentado)', async () => {
    const out = await matchClaimsToChunks({ client_id: 'c1', claims: [] })
    expect(out.grounding).toBe('prose_only')
    expect(out.coverage).toBe(0)
    expect(out.evidence_refs).toEqual([])
  })

  it('texto de claim vacío → no matched (no query)', async () => {
    const out = await matchClaimsToChunks({ client_id: 'c1', claims: [{ field: 'a', text: '   ' }] })
    expect(out.matches[0].matched).toBe(false)
    expect(out.grounding).toBe('prose_only')
  })

  it('dedup evidence_refs cuando dos claims fundamentan en el mismo chunk', async () => {
    state.byQuery.set('q1', [{ chunk_id: 'ch-SAME', source_table: 'icp_documents', similarity: 0.9 }])
    state.byQuery.set('q2', [{ chunk_id: 'ch-SAME', source_table: 'icp_documents', similarity: 0.88 }])
    const out = await matchClaimsToChunks({
      client_id: 'c1',
      claims: [{ field: 'a', text: 'q1' }, { field: 'b', text: 'q2' }],
    })
    expect(out.grounding).toBe('chunk_linked')
    expect(out.evidence_refs).toEqual(['ch-SAME']) // deduped
  })

  it('threshold configurable · 0.85 excluye un 0.82 que el default 0.75 incluiría', async () => {
    state.byQuery.set('q', [{ chunk_id: 'ch-A', source_table: 'icp_documents', similarity: 0.82 }])
    const lax = await matchClaimsToChunks({ client_id: 'c1', claims: [{ field: 'a', text: 'q' }] })
    expect(lax.grounding).toBe('chunk_linked') // 0.82 ≥ 0.75 default
    const strict = await matchClaimsToChunks({ client_id: 'c1', claims: [{ field: 'a', text: 'q' }], threshold: 0.85 })
    expect(strict.grounding).toBe('prose_only') // 0.82 < 0.85
    expect(strict.threshold).toBe(0.85)
  })

  it('DEFAULT_MATCH_THRESHOLD exportado = 0.75', () => {
    expect(DEFAULT_MATCH_THRESHOLD).toBe(0.75)
  })
})
