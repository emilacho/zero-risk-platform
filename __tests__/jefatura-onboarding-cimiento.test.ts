/**
 * Tests · JEFATURA enganche onboarding → cimiento (F2.1) · $0 · sólo mocks.
 * Cubre: fidelidad DECIDE ≥0.85 → promueve · <0.85 tras cap → HITL · CORRECTED → loop ·
 * grounding prose_only ⇒ promoción PROVISIONAL · adapter fidelity-lane · no-circularidad.
 */
import { describe, it, expect, vi } from 'vitest'
import type { JefaturaGradingPolicy } from '../src/lib/jefatura/contract'
import type { JefaturaDeps, CanonGrader, CanonGraderResult } from '../src/lib/jefatura/service'
import { makeFidelityCanonGrader, type FidelityScorer } from '../src/lib/jefatura/fidelity-lane'
import {
  gradeOnboardingCimiento,
  resolveCimientoAction,
  BRAND_BOOK_ARTIFACT_TYPE,
} from '../src/lib/jefatura/onboarding-cimiento'

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

// scorer mock · devuelve scores fijos por campo (NO LLM real · $0).
const mockScorer = (scores: Record<string, number>): FidelityScorer => ({
  score: vi.fn(async () => scores),
})

const makeDeps = (
  scorerScores: Record<string, number>,
  policyOver: Partial<JefaturaGradingPolicy> = {},
): JefaturaDeps => {
  const stub: CanonGrader = {
    grade: vi.fn(async (): Promise<CanonGraderResult> => ({ verdict: 'ESCALATE', scores: {}, corrections: [] })),
  }
  return {
    fetchPolicy: vi.fn(async () => cimientoPolicy(policyOver)),
    graders: {
      correction: { correct: vi.fn(async () => []) },
      fidelity: makeFidelityCanonGrader(mockScorer(scorerScores)),
      vote3ofN: stub,
    },
    genTraceId: () => 'trace-fixed',
  }
}

const baseParams = (over = {}) => ({
  clientId: 'client-1',
  journeyId: 'journey-1',
  artifactId: 'bb-1',
  brandBookDraft: { positioning: 'x', icp_summary: 'y' },
  evidence: { client_name: 'Peniche', industry: 'surf' },
  evidenceRefs: [] as never[],
  fidelityCycle: 1,
  cycle: 0,
  ...over,
})

describe('resolveCimientoAction', () => {
  it('mapea veredictos a acciones', () => {
    expect(resolveCimientoAction('PASS')).toBe('promote')
    expect(resolveCimientoAction('CORRECTED')).toBe('recorrect')
    expect(resolveCimientoAction('ESCALATE')).toBe('escalate_hitl')
    expect(resolveCimientoAction('REJECT')).toBe('escalate_hitl')
  })
})

describe('gradeOnboardingCimiento · fidelidad DECIDE', () => {
  it('≥0.85 en campos gateados → PROMUEVE', async () => {
    const deps = makeDeps({ positioning: 0.92, icp_summary: 0.88 })
    const r = await gradeOnboardingCimiento(baseParams(), deps)
    expect(r.output.verdict).toBe('PASS')
    expect(r.action).toBe('promote')
    expect(r.output.scores.fidelity).toBeCloseTo(0.88)
  })

  it('<0.85 con ciclos disponibles → RE-CORRIGE (loop)', async () => {
    const deps = makeDeps({ positioning: 0.5, icp_summary: 0.9 })
    const r = await gradeOnboardingCimiento(baseParams({ fidelityCycle: 1, cycle: 0 }), deps)
    expect(r.output.verdict).toBe('CORRECTED')
    expect(r.action).toBe('recorrect')
    expect(r.output.corrections.length).toBeGreaterThan(0) // no-pase con correcciones
  })

  it('<0.85 tras agotar el cap → HITL (ESCALATE)', async () => {
    const deps = makeDeps({ positioning: 0.5, icp_summary: 0.9 })
    const r = await gradeOnboardingCimiento(baseParams({ fidelityCycle: 3, cycle: 3 }), deps)
    expect(r.output.verdict).toBe('ESCALATE')
    expect(r.action).toBe('escalate_hitl')
  })
})

describe('grounding prose_only ⇒ promoción PROVISIONAL (§8-2)', () => {
  it('PASS + sin evidence_refs reales → provisional=true', async () => {
    const deps = makeDeps({ positioning: 0.92, icp_summary: 0.9 })
    const r = await gradeOnboardingCimiento(baseParams({ evidenceRefs: [] }), deps)
    expect(r.action).toBe('promote')
    expect(r.grounding).toBe('prose_only')
    expect(r.provisional).toBe(true)
  })

  it('PASS + evidence_refs chunk_linked → provisional=false', async () => {
    const deps = makeDeps({ positioning: 0.92, icp_summary: 0.9 })
    const refs = [{ field: 'positioning', chunk_id: 'ch-1', grounding: 'chunk_linked' as const }]
    const r = await gradeOnboardingCimiento(baseParams({ evidenceRefs: refs }), deps)
    expect(r.action).toBe('promote')
    expect(r.grounding).toBe('chunk_linked')
    expect(r.provisional).toBe(false)
  })
})

describe('no-circularidad (defensa del núcleo)', () => {
  it('cimiento con judgment_enabled=true → ESCALATE (nunca se juzga el cimiento)', async () => {
    const deps = makeDeps({ positioning: 0.92, icp_summary: 0.9 }, { judgment_enabled: true })
    const r = await gradeOnboardingCimiento(baseParams(), deps)
    expect(r.output.verdict).toBe('ESCALATE')
    expect(r.action).toBe('escalate_hitl')
  })

  it('política ausente/inactiva → ESCALATE (nunca aprobar a ciegas)', async () => {
    const deps = makeDeps({ positioning: 0.99, icp_summary: 0.99 })
    ;(deps.fetchPolicy as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null)
    const r = await gradeOnboardingCimiento(baseParams(), deps)
    expect(r.action).toBe('escalate_hitl')
  })
})
