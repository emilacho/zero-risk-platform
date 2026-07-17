/**
 * JEFATURA · Peldaño 1 · hueco B2 · FLIP de grounding assert END-TO-END · $0 (mocks).
 * =================================================================================
 * Cobertura que faltaba: el flip `chunk_linked` ↔ `prose_only` se prueba HOY sólo en
 * piezas AISLADAS —
 *   - `jefatura-evidence-matcher.test.ts` · el matcher (claim→chunk) en isolation.
 *   - `jefatura-onboarding-cimiento.test.ts` · el `provisional` desde refs HECHOS A MANO.
 * NADIE cablea el matcher REAL (`matchClaimsToChunks`, CEREBRO mockeado) hasta la
 * promoción PROVISIONAL final. B2 = ese end-to-end: la similaridad del CEREBRO flipea el
 * grounding y esa flip se PROPAGA HASTA EL FINAL (`CimientoGradingResult.provisional`).
 *
 * Hallazgo del seam (endurecimiento honesto · §8-2): prod tiene DOS derivadores de
 * grounding con semántica DISTINTA —
 *   - `matchClaimsToChunks`/`deriveGrounding` · `chunk_linked` solo si TODAS las claims
 *     trazan a un chunk (ALL · conservador).
 *   - `resolveGrounding` (fidelity-grader) · `chunk_linked` si ALGUNA ref es chunk_linked
 *     (ANY · permisivo).
 * En cobertura PARCIAL divergen: un puente ingenuo claim-por-claim haría `resolveGrounding`
 * decir chunk_linked (ANY) mientras el matcher dice prose_only (ALL) → sobre-venta (el
 * mismo falso-verde que §8-2 prohíbe). El adapter honesto `refsFromMatch` estampa el
 * grounding GENERAL (conservador) por-claim → los TRES derivadores coinciden con el matcher
 * → `provisional` es honesto end-to-end. Este test PINEA ese contrato para F2.
 *
 * §144 STOP · $0 · sin LLM · sin apply. `refsFromMatch` NO es wiring de prod (F2 lo
 * construye) · acá documenta el contrato que ese wiring DEBE cumplir.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

// CEREBRO controlable · keyed por texto de query → resultados (mismo patrón #285).
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

import { matchClaimsToChunks, type ClaimInput, type EvidenceMatchResult } from '../src/lib/jefatura/evidence-matcher'
import {
  resolveGrounding,
  type FidelityEvidenceRef,
} from '../src/lib/jefatura/fidelity-grader'
import { deriveGrounding, type JefaturaEvidenceRef } from '../src/lib/jefatura/observability'
import type { JefaturaGradingPolicy } from '../src/lib/jefatura/contract'
import type { JefaturaDeps, CanonGrader, CanonGraderResult } from '../src/lib/jefatura/service'
import { makeFidelityCanonGrader, type FidelityScorer } from '../src/lib/jefatura/fidelity-lane'
import { gradeOnboardingCimiento, BRAND_BOOK_ARTIFACT_TYPE } from '../src/lib/jefatura/onboarding-cimiento'

// ── el ADAPTER HONESTO que F2 debe cumplir (matcher → refs del cimiento) ──────
// Una ref por claim: chunk_id real si matcheó, null si no. El `grounding` de CADA ref
// es el GENERAL conservador del matcher (ALL) — NO el per-claim (ANY) — para que
// `resolveGrounding` (ANY) y `deriveGrounding` (ALL) coincidan ambos con el matcher y
// la cobertura PARCIAL nunca se sobre-venda como fundamentada.
function refsFromMatch(result: EvidenceMatchResult): FidelityEvidenceRef[] {
  return result.matches.map((m) => ({
    field: m.field,
    chunk_id: m.chunk_id, // real o null (null en parcial → deriveGrounding conservador)
    grounding: result.grounding, // GENERAL conservador (ALL) estampado por-claim
  }))
}
// Refs para la traza M1 (observability) · mismo puente honesto.
function verdictRefsFromMatch(result: EvidenceMatchResult): JefaturaEvidenceRef[] {
  return result.matches.map((m) => ({ field: m.field, chunk_id: m.chunk_id }))
}

// ── deps del cimiento · scorer PASS fijo (aisla la variable: sólo el grounding cambia) ──
const cimientoPolicy = (over: Partial<JefaturaGradingPolicy> = {}): JefaturaGradingPolicy => ({
  artifact_type: BRAND_BOOK_ARTIFACT_TYPE,
  artifact_class: 'cimiento',
  correction_enabled: true,
  judgment_enabled: false,
  canon_grader: 'fidelity',
  counterweight: null,
  max_cycles: 3,
  fidelity_threshold: 0.85,
  vote_config: null,
  is_active: true,
  ...over,
})
const passScorer: FidelityScorer = { score: vi.fn(async () => ({ positioning: 0.95, icp_summary: 0.92 })) }
const passDeps = (): JefaturaDeps => {
  const stub: CanonGrader = { grade: vi.fn(async (): Promise<CanonGraderResult> => ({ verdict: 'ESCALATE', scores: {}, corrections: [] })) }
  return {
    fetchPolicy: vi.fn(async () => cimientoPolicy()),
    graders: { correction: { correct: vi.fn(async () => []) }, fidelity: makeFidelityCanonGrader(passScorer), vote3ofN: stub },
    genTraceId: () => 'trace-b2',
  }
}
const CLAIMS: readonly ClaimInput[] = [
  { field: 'positioning', text: 'positioning claim' },
  { field: 'icp_summary', text: 'icp claim' },
]
const gradeWith = async (refs: FidelityEvidenceRef[]) =>
  gradeOnboardingCimiento(
    {
      clientId: 'c1',
      journeyId: 'j1',
      artifactId: 'bb-1',
      brandBookDraft: { positioning: 'x', icp_summary: 'y' },
      evidence: { client_name: 'Peniche' },
      evidenceRefs: refs,
      fidelityCycle: 1,
      cycle: 0,
    },
    passDeps(),
  )

beforeEach(() => {
  state.byQuery = new Map()
})

describe('B2 · el flip del CEREBRO se propaga a la promoción PROVISIONAL (end-to-end)', () => {
  it('TODAS las claims ≥ threshold → chunk_linked → PROMUEVE no-provisional', async () => {
    state.byQuery.set('positioning claim', [{ chunk_id: 'ch-A', source_table: 'competitive_landscape', similarity: 0.91 }])
    state.byQuery.set('icp claim', [{ chunk_id: 'ch-B', source_table: 'icp_documents', similarity: 0.88 }])
    const match = await matchClaimsToChunks({ client_id: 'c1', claims: CLAIMS })
    expect(match.grounding).toBe('chunk_linked')

    const r = await gradeWith(refsFromMatch(match))
    expect(r.action).toBe('promote')
    expect(r.grounding).toBe('chunk_linked')
    expect(r.provisional).toBe(false) // groundedness real → NO provisional
  })

  it('NINGUNA claim ≥ threshold → prose_only → PROMUEVE PROVISIONAL', async () => {
    state.byQuery.set('positioning claim', [{ chunk_id: 'ch-A', source_table: 'icp_documents', similarity: 0.4 }])
    state.byQuery.set('icp claim', [{ chunk_id: 'ch-B', source_table: 'icp_documents', similarity: 0.3 }])
    const match = await matchClaimsToChunks({ client_id: 'c1', claims: CLAIMS })
    expect(match.grounding).toBe('prose_only')

    const r = await gradeWith(refsFromMatch(match))
    expect(r.action).toBe('promote')
    expect(r.grounding).toBe('prose_only')
    expect(r.provisional).toBe(true) // score sobre prosa → provisional (no sobre-vende)
  })

  it('cobertura PARCIAL (1 de 2) → prose_only conservador → PROVISIONAL (sin sobre-venta)', async () => {
    state.byQuery.set('positioning claim', [{ chunk_id: 'ch-A', source_table: 'competitive_landscape', similarity: 0.9 }])
    state.byQuery.set('icp claim', [{ chunk_id: 'ch-Z', source_table: 'icp_documents', similarity: 0.4 }]) // < 0.75
    const match = await matchClaimsToChunks({ client_id: 'c1', claims: CLAIMS })
    expect(match.grounding).toBe('prose_only')
    expect(match.coverage).toBe(0.5)

    const refs = refsFromMatch(match)
    const r = await gradeWith(refs)
    expect(r.action).toBe('promote')
    expect(r.provisional).toBe(true) // parcial NUNCA promueve como fundamentado real

    // El adapter HONESTO reconcilia ANY vs ALL: ambos derivadores de prod coinciden con el matcher.
    expect(resolveGrounding(refs)).toBe('prose_only') // ANY, pero estampado conservador
    expect(deriveGrounding(verdictRefsFromMatch(match))).toBe('prose_only') // ALL (una ref con chunk_id=null)
  })

  it('la trampa de sobre-venta: un puente per-claim (ANY) rompería la honestidad en parcial', async () => {
    // Documenta POR QUÉ `refsFromMatch` estampa el grounding general. Un puente ingenuo que
    // marca cada ref matcheada como chunk_linked haría `resolveGrounding` (ANY) decir
    // chunk_linked en cobertura parcial → provisional=false = falso-verde. Este assert
    // captura esa divergencia para que F2 NO caiga en ella.
    const naiveRefs: FidelityEvidenceRef[] = [
      { field: 'positioning', chunk_id: 'ch-A', grounding: 'chunk_linked' }, // matcheó
      { field: 'icp_summary', chunk_id: null, grounding: 'prose_only' }, // no matcheó
    ]
    expect(resolveGrounding(naiveRefs)).toBe('chunk_linked') // ANY → sobre-venta latente
    expect(deriveGrounding(naiveRefs as JefaturaEvidenceRef[])).toBe('prose_only') // ALL → honesto
    // Divergen ⇒ el wiring DEBE usar el grounding general (ALL) del matcher, no per-claim.
    expect(resolveGrounding(naiveRefs)).not.toBe(deriveGrounding(naiveRefs as JefaturaEvidenceRef[]))
  })
})

describe('B2 · el threshold flipea la cadena entera (sensibilidad end-to-end)', () => {
  it('misma similaridad 0.82: threshold 0.75 → no-provisional · 0.85 → provisional', async () => {
    // Caveat del consejero (E2): un threshold demasiado alto → chunk_linked NUNCA se logra
    // (falla silenciosa · todo prose_only/provisional para siempre). Se pinea el flip.
    state.byQuery.set('positioning claim', [{ chunk_id: 'ch-A', source_table: 'competitive_landscape', similarity: 0.82 }])
    state.byQuery.set('icp claim', [{ chunk_id: 'ch-B', source_table: 'icp_documents', similarity: 0.82 }])

    const lax = await matchClaimsToChunks({ client_id: 'c1', claims: CLAIMS }) // default 0.75
    expect(lax.grounding).toBe('chunk_linked')
    const rLax = await gradeWith(refsFromMatch(lax))
    expect(rLax.provisional).toBe(false)

    state.byQuery.set('positioning claim', [{ chunk_id: 'ch-A', source_table: 'competitive_landscape', similarity: 0.82 }])
    state.byQuery.set('icp claim', [{ chunk_id: 'ch-B', source_table: 'icp_documents', similarity: 0.82 }])
    const strict = await matchClaimsToChunks({ client_id: 'c1', claims: CLAIMS, threshold: 0.85 })
    expect(strict.grounding).toBe('prose_only')
    const rStrict = await gradeWith(refsFromMatch(strict))
    expect(rStrict.provisional).toBe(true)
  })
})
