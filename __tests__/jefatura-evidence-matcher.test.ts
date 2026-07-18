/**
 * Tests · JEFATURA matching claim→chunk (endurecimiento 2 · ADR-020 M1) +
 * calibración pre-P3 (sonda E2 2026-07-17 · ruling consejero 17-jul):
 *   fix 1 · grounding gateado SOLO por campos FÁCTICOS (DEFAULT_GATED_FIELDS)
 *   fix 2 · grounding por COVERAGE fáctica (no ALL-global) · vara TUNABLE
 *   fix 3 · brand_books EXCLUIDO del pool (mata self-match circular @1.000)
 *   + umbral v1 = 0.72 TUNABLE por config (env / param)
 * $0 · CEREBRO mockeado · sin LLM · sin red.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// Mock controlable de queryClientBrain: keyed por texto de query → resultados.
const state: { byQuery: Map<string, Array<{ chunk_id: string; source_table: string; similarity: number }>> } = {
  byQuery: new Map(),
}

vi.mock('@/lib/client-brain', () => ({
  queryClientBrain: (params: { query: string }) => {
    const rows = state.byQuery.get(params.query) ?? []
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

import {
  matchClaimsToChunks,
  resolveMatchThreshold,
  resolveGroundingCoverageMin,
  isBrandBookSource,
  DEFAULT_MATCH_THRESHOLD,
  DEFAULT_GROUNDING_COVERAGE_MIN,
  EVIDENCE_SECTIONS,
} from '../src/lib/jefatura/evidence-matcher'

beforeEach(() => {
  state.byQuery = new Map()
  delete process.env.JEFATURA_MATCH_THRESHOLD
  delete process.env.JEFATURA_GROUNDING_COVERAGE_MIN
})
afterEach(() => {
  delete process.env.JEFATURA_MATCH_THRESHOLD
  delete process.env.JEFATURA_GROUNDING_COVERAGE_MIN
})

describe('matchClaimsToChunks · grounding fáctico por coverage', () => {
  it('TODOS los campos fácticos matchean ≥ threshold → chunk_linked · factual_coverage 1', async () => {
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
    expect(out.factual_coverage).toBe(1)
    expect(out.factual_matched).toBe(2)
    expect(out.factual_total).toBe(2)
    expect(out.evidence_refs.sort()).toEqual(['ch-A', 'ch-B'])
    expect(out.matches[0]).toMatchObject({ field: 'positioning', chunk_id: 'ch-A', matched: true, gated: true, source_table: 'competitive_landscape' })
  })

  it('un campo fáctico por debajo del threshold → prose_only (coverage 0.5 < vara 1.0)', async () => {
    state.byQuery.set('grounded', [{ chunk_id: 'ch-A', source_table: 'icp_documents', similarity: 0.9 }])
    state.byQuery.set('ungrounded', [{ chunk_id: 'ch-Z', source_table: 'icp_documents', similarity: 0.4 }])
    const out = await matchClaimsToChunks({
      client_id: 'c1',
      claims: [
        { field: 'positioning', text: 'grounded' },
        { field: 'icp_summary', text: 'ungrounded' },
      ],
    })
    expect(out.grounding).toBe('prose_only')
    expect(out.factual_coverage).toBe(0.5)
    expect(out.evidence_refs).toEqual(['ch-A'])
    expect(out.matches[1]).toMatchObject({ field: 'icp_summary', chunk_id: null, matched: false })
  })

  it('claim fáctico sin resultados del CEREBRO → no matched · prose_only', async () => {
    state.byQuery.set('x', [])
    const out = await matchClaimsToChunks({ client_id: 'c1', claims: [{ field: 'positioning', text: 'x' }] })
    expect(out.grounding).toBe('prose_only')
    expect(out.matches[0]).toMatchObject({ chunk_id: null, similarity: 0, matched: false })
    expect(out.evidence_refs).toEqual([])
  })

  it('claims vacío → prose_only · coverage 0 · factual_total 0', async () => {
    const out = await matchClaimsToChunks({ client_id: 'c1', claims: [] })
    expect(out.grounding).toBe('prose_only')
    expect(out.coverage).toBe(0)
    expect(out.factual_total).toBe(0)
    expect(out.evidence_refs).toEqual([])
  })

  it('texto de claim vacío → no matched (no query)', async () => {
    const out = await matchClaimsToChunks({ client_id: 'c1', claims: [{ field: 'positioning', text: '   ' }] })
    expect(out.matches[0].matched).toBe(false)
    expect(out.grounding).toBe('prose_only')
  })

  it('dedup evidence_refs cuando dos campos fácticos fundamentan en el mismo chunk', async () => {
    state.byQuery.set('q1', [{ chunk_id: 'ch-SAME', source_table: 'icp_documents', similarity: 0.9 }])
    state.byQuery.set('q2', [{ chunk_id: 'ch-SAME', source_table: 'icp_documents', similarity: 0.88 }])
    const out = await matchClaimsToChunks({
      client_id: 'c1',
      claims: [{ field: 'positioning', text: 'q1' }, { field: 'icp_summary', text: 'q2' }],
    })
    expect(out.grounding).toBe('chunk_linked')
    expect(out.evidence_refs).toEqual(['ch-SAME'])
  })
})

describe('fix 1 · sólo los campos FÁCTICOS gatean groundedness', () => {
  it('un campo NO-fáctico (voz) matcheado NO entra en evidence_refs ni infla factual', async () => {
    state.byQuery.set('pos', [{ chunk_id: 'ch-P', source_table: 'competitive_landscape', similarity: 0.9 }])
    state.byQuery.set('voz', [{ chunk_id: 'ch-V', source_table: 'icp_documents', similarity: 0.95 }])
    const out = await matchClaimsToChunks({
      client_id: 'c1',
      claims: [
        { field: 'positioning', text: 'pos' },
        { field: 'voice_description', text: 'voz' },
      ],
    })
    expect(out.grounding).toBe('chunk_linked') // factual (positioning) 1/1
    expect(out.factual_total).toBe(1)
    expect(out.factual_coverage).toBe(1)
    expect(out.evidence_refs).toEqual(['ch-P']) // ch-V (voz) NO cuenta como groundedness
    const voz = out.matches.find((m) => m.field === 'voice_description')!
    expect(voz.gated).toBe(false)
    expect(voz.matched).toBe(true) // se reporta, pero no gatea
  })

  it('un campo NO-fáctico que FALLA no bloquea (antes ALL-global lo hacía prose_only)', async () => {
    state.byQuery.set('pos', [{ chunk_id: 'ch-P', source_table: 'competitive_landscape', similarity: 0.9 }])
    state.byQuery.set('voz', [{ chunk_id: 'ch-V', source_table: 'icp_documents', similarity: 0.3 }]) // falla
    const out = await matchClaimsToChunks({
      client_id: 'c1',
      claims: [
        { field: 'positioning', text: 'pos' },
        { field: 'voice_description', text: 'voz' },
      ],
    })
    expect(out.grounding).toBe('chunk_linked') // la voz que falla NO bloquea
    expect(out.factual_coverage).toBe(1)
    expect(out.coverage).toBe(0.5) // global sí refleja el fallo (verdad granular)
  })

  it('sin campos fácticos (todo voz) → prose_only aunque matcheen (nada fáctico que fundamentar)', async () => {
    state.byQuery.set('voz', [{ chunk_id: 'ch-V', source_table: 'icp_documents', similarity: 0.95 }])
    const out = await matchClaimsToChunks({ client_id: 'c1', claims: [{ field: 'voice_description', text: 'voz' }] })
    expect(out.grounding).toBe('prose_only')
    expect(out.factual_total).toBe(0)
    expect(out.evidence_refs).toEqual([])
  })

  it('gatedFields override · trata campos custom como fácticos', async () => {
    state.byQuery.set('q', [{ chunk_id: 'ch-A', source_table: 'icp_documents', similarity: 0.9 }])
    const out = await matchClaimsToChunks({
      client_id: 'c1',
      claims: [{ field: 'custom_fact', text: 'q' }],
      gatedFields: ['custom_fact'],
    })
    expect(out.factual_total).toBe(1)
    expect(out.grounding).toBe('chunk_linked')
  })
})

describe('fix 2 · grounding por COVERAGE fáctica (TUNABLE · no ALL-global)', () => {
  it('cobertura fáctica 0.5 · vara 1.0 → prose_only · vara 0.5 → chunk_linked', async () => {
    state.byQuery.set('a', [{ chunk_id: 'ch-A', source_table: 'competitive_landscape', similarity: 0.9 }])
    state.byQuery.set('b', [{ chunk_id: 'ch-B', source_table: 'icp_documents', similarity: 0.4 }])
    const claims = [
      { field: 'positioning', text: 'a' },
      { field: 'icp_summary', text: 'b' },
    ]
    const strict = await matchClaimsToChunks({ client_id: 'c1', claims })
    expect(strict.factual_coverage).toBe(0.5)
    expect(strict.grounding_coverage_min).toBe(1.0)
    expect(strict.grounding).toBe('prose_only')

    const lax = await matchClaimsToChunks({ client_id: 'c1', claims, groundingCoverageMin: 0.5 })
    expect(lax.grounding).toBe('chunk_linked')
    expect(lax.grounding_coverage_min).toBe(0.5)
  })

  it('la vara se lee de env JEFATURA_GROUNDING_COVERAGE_MIN', async () => {
    state.byQuery.set('a', [{ chunk_id: 'ch-A', source_table: 'competitive_landscape', similarity: 0.9 }])
    state.byQuery.set('b', [{ chunk_id: 'ch-B', source_table: 'icp_documents', similarity: 0.4 }])
    process.env.JEFATURA_GROUNDING_COVERAGE_MIN = '0.5'
    const out = await matchClaimsToChunks({
      client_id: 'c1',
      claims: [
        { field: 'positioning', text: 'a' },
        { field: 'icp_summary', text: 'b' },
      ],
    })
    expect(out.grounding).toBe('chunk_linked')
    expect(out.grounding_coverage_min).toBe(0.5)
  })
})

describe('fix 3 · brand_books EXCLUIDO del pool (mata self-match circular @1.000)', () => {
  it('el top es brand_books @1.000 · el matcher lo salta y usa el mejor de EVIDENCIA', async () => {
    state.byQuery.set('pos', [
      { chunk_id: 'bb-self', source_table: 'brand_books', similarity: 1.0 }, // self-match circular
      { chunk_id: 'ch-EV', source_table: 'competitive_landscape', similarity: 0.8 },
    ])
    const out = await matchClaimsToChunks({ client_id: 'c1', claims: [{ field: 'positioning', text: 'pos' }] })
    expect(out.matches[0].chunk_id).toBe('ch-EV') // NO bb-self
    expect(out.matches[0].similarity).toBe(0.8) // la real, no el 1.000 circular
    expect(out.matches[0].source_table).toBe('competitive_landscape')
    expect(out.evidence_refs).toEqual(['ch-EV'])
    expect(out.grounding).toBe('chunk_linked')
  })

  it('normaliza el prefijo · también salta client_brand_books', async () => {
    state.byQuery.set('pos', [
      { chunk_id: 'bb-self', source_table: 'client_brand_books', similarity: 1.0 },
      { chunk_id: 'ch-EV', source_table: 'client_competitive_landscape', similarity: 0.79 },
    ])
    const out = await matchClaimsToChunks({ client_id: 'c1', claims: [{ field: 'positioning', text: 'pos' }] })
    expect(out.matches[0].chunk_id).toBe('ch-EV')
  })

  it('SOLO hay brand_books en el pool → sin evidencia → prose_only (no se auto-fundamenta)', async () => {
    state.byQuery.set('pos', [{ chunk_id: 'bb-self', source_table: 'brand_books', similarity: 0.99 }])
    const out = await matchClaimsToChunks({ client_id: 'c1', claims: [{ field: 'positioning', text: 'pos' }] })
    expect(out.matches[0].matched).toBe(false)
    expect(out.matches[0].similarity).toBe(0)
    expect(out.grounding).toBe('prose_only')
  })

  it('EVIDENCE_SECTIONS no incluye brand_books', () => {
    expect(EVIDENCE_SECTIONS).not.toContain('brand_books')
    expect(EVIDENCE_SECTIONS).toContain('competitive_landscape')
    expect(EVIDENCE_SECTIONS).toContain('icp_documents')
  })

  it('isBrandBookSource · normaliza prefijo y maneja null', () => {
    expect(isBrandBookSource('brand_books')).toBe(true)
    expect(isBrandBookSource('client_brand_books')).toBe(true)
    expect(isBrandBookSource('competitive_landscape')).toBe(false)
    expect(isBrandBookSource(null)).toBe(false)
    expect(isBrandBookSource(undefined)).toBe(false)
  })
})

describe('umbral v1 = 0.72 · TUNABLE (config · no hardcode)', () => {
  it('DEFAULT_MATCH_THRESHOLD = 0.72 · DEFAULT_GROUNDING_COVERAGE_MIN = 1.0', () => {
    expect(DEFAULT_MATCH_THRESHOLD).toBe(0.72)
    expect(DEFAULT_GROUNDING_COVERAGE_MIN).toBe(1.0)
  })

  it('un 0.73 (que el viejo 0.75 rechazaba) matchea con el default 0.72', async () => {
    state.byQuery.set('q', [{ chunk_id: 'ch-A', source_table: 'competitive_landscape', similarity: 0.73 }])
    const out = await matchClaimsToChunks({ client_id: 'c1', claims: [{ field: 'positioning', text: 'q' }] })
    expect(out.threshold).toBe(0.72)
    expect(out.grounding).toBe('chunk_linked')
  })

  it('0.71 < 0.72 → no matchea', async () => {
    state.byQuery.set('q', [{ chunk_id: 'ch-A', source_table: 'competitive_landscape', similarity: 0.71 }])
    const out = await matchClaimsToChunks({ client_id: 'c1', claims: [{ field: 'positioning', text: 'q' }] })
    expect(out.grounding).toBe('prose_only')
  })

  it('threshold por param sobreescribe el default', async () => {
    state.byQuery.set('q', [{ chunk_id: 'ch-A', source_table: 'icp_documents', similarity: 0.82 }])
    const strict = await matchClaimsToChunks({ client_id: 'c1', claims: [{ field: 'positioning', text: 'q' }], threshold: 0.85 })
    expect(strict.threshold).toBe(0.85)
    expect(strict.grounding).toBe('prose_only') // 0.82 < 0.85
  })

  it('threshold por env JEFATURA_MATCH_THRESHOLD', async () => {
    state.byQuery.set('q', [{ chunk_id: 'ch-A', source_table: 'icp_documents', similarity: 0.82 }])
    process.env.JEFATURA_MATCH_THRESHOLD = '0.85'
    const out = await matchClaimsToChunks({ client_id: 'c1', claims: [{ field: 'positioning', text: 'q' }] })
    expect(out.threshold).toBe(0.85)
    expect(out.grounding).toBe('prose_only')
  })

  it('resolveMatchThreshold · precedencia override > env > default · valida rango', () => {
    expect(resolveMatchThreshold()).toBe(0.72)
    expect(resolveMatchThreshold(0.8)).toBe(0.8)
    process.env.JEFATURA_MATCH_THRESHOLD = '0.9'
    expect(resolveMatchThreshold()).toBe(0.9)
    expect(resolveMatchThreshold(0.8)).toBe(0.8) // override gana
    process.env.JEFATURA_MATCH_THRESHOLD = 'nope'
    expect(resolveMatchThreshold()).toBe(0.72) // invalido → default
    process.env.JEFATURA_MATCH_THRESHOLD = '1.5'
    expect(resolveMatchThreshold()).toBe(0.72) // fuera de (0,1] → default
  })

  it('resolveGroundingCoverageMin · precedencia override > env > default · valida rango', () => {
    expect(resolveGroundingCoverageMin()).toBe(1.0)
    expect(resolveGroundingCoverageMin(0.6)).toBe(0.6)
    process.env.JEFATURA_GROUNDING_COVERAGE_MIN = '0.5'
    expect(resolveGroundingCoverageMin()).toBe(0.5)
    process.env.JEFATURA_GROUNDING_COVERAGE_MIN = '0'
    expect(resolveGroundingCoverageMin()).toBe(1.0) // 0 fuera de (0,1] → default
  })
})
