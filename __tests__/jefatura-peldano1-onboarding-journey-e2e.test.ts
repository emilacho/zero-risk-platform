/**
 * JEFATURA · Peldaño 1 · E2E mock-driven del journey onboarding → Jefatura · $0 (mocks).
 * =====================================================================================
 * Cobertura que faltaba (plan §5.1): `jefatura-onboarding-cimiento.test.ts` prueba UNA
 * llamada por veredicto (unit). El HARNESS #284 prueba el driver `runResolution` (contenido/
 * cimiento genérico). NADIE prueba el LOOP DEL PRODUCTOR: deal-won → Persist Canon → la
 * Jefatura DECIDE → si `recorrect`, el CREADOR re-sintetiza → re-invoca → hasta promote/HITL.
 * Este test simula ese journey con transcripciones GOLDEN (scorer mock por ciclo · $0).
 *
 * Patrón #284 · las "bocas" LLM (el scorer de fidelidad) se mockean con un guion golden
 * por ciclo → la orquestación/convergencia del PRODUCTOR corre gratis. Se assertea sobre la
 * traza observable del cimiento (verdict · action · scores · trace_id · grounding/provisional).
 *
 * LÍMITE §148 · mock verde ≠ real verde · AMPLITUD, JAMÁS cierra el hito. UNA corrida real
 * (Peniche · Peldaño 3) cierra + siembra estos fixtures. §144 STOP · $0 · sin LLM · sin apply.
 */
import { describe, it, expect, vi } from 'vitest'
import type { JefaturaGradingPolicy } from '../src/lib/jefatura/contract'
import type { JefaturaDeps, CanonGrader, CanonGraderResult } from '../src/lib/jefatura/service'
import { makeFidelityCanonGrader, type FidelityScorer } from '../src/lib/jefatura/fidelity-lane'
import {
  gradeOnboardingCimiento,
  type CimientoAction,
  type CimientoGradingResult,
  BRAND_BOOK_ARTIFACT_TYPE,
} from '../src/lib/jefatura/onboarding-cimiento'
import type { FidelityEvidenceRef } from '../src/lib/jefatura/fidelity-grader'

const cimientoPolicy = (over: Partial<JefaturaGradingPolicy> = {}): JefaturaGradingPolicy => ({
  artifact_type: BRAND_BOOK_ARTIFACT_TYPE,
  artifact_class: 'cimiento',
  correction_enabled: true,
  judgment_enabled: false, // no-circularidad · el cimiento NUNCA vota
  canon_grader: 'fidelity',
  counterweight: null,
  max_cycles: 3,
  fidelity_threshold: 0.85,
  vote_config: null,
  is_active: true,
  ...over,
})

/**
 * Scorer GOLDEN · devuelve los scores del ciclo de fidelidad actual (lee
 * `payload.fidelity_cycle`). Modela al creador re-sintetizando: los scores MEJORAN
 * ciclo a ciclo según el guion. Sin ciclo en el guion → repite el último (meseta).
 */
const goldenScorer = (byCycle: Record<number, Record<string, number>>): FidelityScorer => ({
  score: vi.fn(async (input) => {
    const fc = Number((input.payload as { fidelity_cycle?: number }).fidelity_cycle) || 1
    const cycles = Object.keys(byCycle).map(Number).sort((a, b) => a - b)
    const key = byCycle[fc] ? fc : cycles.filter((k) => k <= fc).pop() ?? cycles[0]
    return byCycle[key]
  }),
})

const makeDeps = (
  scorer: FidelityScorer,
  policyOver: Partial<JefaturaGradingPolicy> = {},
): JefaturaDeps => {
  const stub: CanonGrader = { grade: vi.fn(async (): Promise<CanonGraderResult> => ({ verdict: 'ESCALATE', scores: {}, corrections: [] })) }
  return {
    fetchPolicy: vi.fn(async () => cimientoPolicy(policyOver)),
    graders: { correction: { correct: vi.fn(async () => []) }, fidelity: makeFidelityCanonGrader(scorer), vote3ofN: stub },
    genTraceId: () => 'trace-journey',
  }
}

interface JourneyStep {
  readonly cycle: number
  readonly action: CimientoAction
  readonly verdict: string
  readonly result: CimientoGradingResult
}
interface JourneyOutcome {
  readonly steps: JourneyStep[]
  readonly actions: CimientoAction[]
  readonly final: CimientoGradingResult
  readonly cyclesConsumed: number
}

/**
 * Corre el journey del PRODUCTOR: invoca la Jefatura, y mientras el veredicto sea
 * `recorrect`, simula al creador re-sintetizando (bump de ciclo) y RE-INVOCA. Termina en
 * `promote` o `escalate_hitl`. El loop-cap vive en el núcleo (`gradeArtifact`) · acá hay un
 * guard duro anti-runaway (el test verifica que el núcleo corta ANTES).
 */
async function runOnboardingJourney(
  scorer: FidelityScorer,
  opts: { evidenceRefs?: readonly FidelityEvidenceRef[]; policyOver?: Partial<JefaturaGradingPolicy> } = {},
): Promise<JourneyOutcome> {
  const deps = makeDeps(scorer, opts.policyOver)
  const maxCycles = cimientoPolicy(opts.policyOver).max_cycles
  const steps: JourneyStep[] = []
  let cycle = 0
  for (;;) {
    const r = await gradeOnboardingCimiento(
      {
        clientId: 'client-peniche',
        journeyId: 'journey-deal-won',
        artifactId: 'bb-peniche',
        brandBookDraft: { positioning: `borrador-v${cycle}`, icp_summary: 'surfers' },
        evidence: { client_name: 'Peniche', industry: 'surf' },
        evidenceRefs: opts.evidenceRefs ?? [],
        fidelityCycle: cycle + 1, // 1-based · el productor lo lleva
        cycle, // 0-based · loop-cap del núcleo
      },
      deps,
    )
    steps.push({ cycle, action: r.action, verdict: r.output.verdict, result: r })
    if (r.action !== 'recorrect') break
    cycle++
    // el CREADOR re-sintetiza (mock) → siguiente ciclo. Guard anti-runaway (nunca debería pegar).
    if (cycle > maxCycles + 2) throw new Error('journey runaway · el núcleo no cortó el loop')
  }
  return {
    steps,
    actions: steps.map((s) => s.action),
    final: steps[steps.length - 1].result,
    cyclesConsumed: cycle,
  }
}

const linkedRefs: FidelityEvidenceRef[] = [{ field: 'positioning', chunk_id: 'ch-1', grounding: 'chunk_linked' }]

describe('journey onboarding → Jefatura · ruta feliz (golden E2E)', () => {
  it('scores ≥0.85 al primer intento → PROMUEVE en 1 paso · 0 re-corrección', async () => {
    const j = await runOnboardingJourney(goldenScorer({ 1: { positioning: 0.93, icp_summary: 0.9 } }), {
      evidenceRefs: linkedRefs,
    })
    expect(j.actions).toEqual(['promote'])
    expect(j.final.output.verdict).toBe('PASS')
    expect(j.cyclesConsumed).toBe(0)
    expect(j.final.provisional).toBe(false) // chunk_linked
    expect(j.final.output.trace_id).toBe('trace-journey')
  })

  it('falla, el creador re-sintetiza, PASA en ciclo 1 → [recorrect, promote]', async () => {
    const j = await runOnboardingJourney(
      goldenScorer({ 1: { positioning: 0.6, icp_summary: 0.8 }, 2: { positioning: 0.9, icp_summary: 0.9 } }),
      { evidenceRefs: linkedRefs },
    )
    expect(j.actions).toEqual(['recorrect', 'promote'])
    expect(j.final.output.verdict).toBe('PASS')
    expect(j.cyclesConsumed).toBe(1)
    // el paso de re-corrección viajó con correcciones accionables (ADR-020 §58)
    expect(j.steps[0].result.output.corrections.length).toBeGreaterThan(0)
  })
})

describe('journey onboarding → Jefatura · rutas de FALLA', () => {
  it('scores por debajo hasta agotar el cap → ESCALATE a humano (nunca auto-promueve)', async () => {
    const j = await runOnboardingJourney(goldenScorer({ 1: { positioning: 0.5, icp_summary: 0.6 } }), {
      evidenceRefs: linkedRefs,
    })
    // recorrect en cada ciclo con presupuesto, terminal escalate_hitl al agotar el cap
    expect(j.final.action).toBe('escalate_hitl')
    expect(j.final.output.verdict).toBe('ESCALATE')
    expect(j.actions[j.actions.length - 1]).toBe('escalate_hitl')
    expect(j.actions).not.toContain('promote') // JAMÁS promueve un cimiento no-fundamentado
    // el núcleo cortó DENTRO del cap (guard anti-runaway nunca pegó)
    expect(j.cyclesConsumed).toBeLessThanOrEqual(cimientoPolicy().max_cycles)
  })

  it('cap=1 · falla en el primer intento → ESCALATE inmediato ([escalate_hitl])', async () => {
    const j = await runOnboardingJourney(goldenScorer({ 1: { positioning: 0.4, icp_summary: 0.5 } }), {
      policyOver: { max_cycles: 1 },
      evidenceRefs: linkedRefs,
    })
    expect(j.actions).toEqual(['escalate_hitl'])
    expect(j.final.output.verdict).toBe('ESCALATE')
  })
})

describe('journey onboarding → Jefatura · invariantes §8-2 + no-circularidad', () => {
  it('PROMUEVE pero grounding prose_only → provisional se propaga por TODO el journey', async () => {
    // corrige una vez y pasa, pero sin evidence_refs reales → la promoción final es PROVISIONAL
    const j = await runOnboardingJourney(
      goldenScorer({ 1: { positioning: 0.7, icp_summary: 0.8 }, 2: { positioning: 0.92, icp_summary: 0.9 } }),
      { evidenceRefs: [] }, // sin refs → prose_only
    )
    expect(j.final.action).toBe('promote')
    expect(j.final.grounding).toBe('prose_only')
    expect(j.final.provisional).toBe(true)
  })

  it('política con judgment_enabled=true (mis-config) → escalate_hitl aun con scores altos', async () => {
    const j = await runOnboardingJourney(goldenScorer({ 1: { positioning: 0.99, icp_summary: 0.99 } }), {
      policyOver: { judgment_enabled: true },
      evidenceRefs: linkedRefs,
    })
    expect(j.actions).toEqual(['escalate_hitl']) // el cimiento NUNCA se juzga · defensa del núcleo
    expect(j.final.action).toBe('escalate_hitl')
  })

  it('la secuencia de acciones es monótona: recorrect* seguido de UN terminal', async () => {
    const j = await runOnboardingJourney(
      goldenScorer({ 1: { positioning: 0.6, icp_summary: 0.7 }, 2: { positioning: 0.7, icp_summary: 0.72 }, 3: { positioning: 0.95, icp_summary: 0.95 } }),
      { evidenceRefs: linkedRefs },
    )
    const terminal = ['promote', 'escalate_hitl']
    // todos menos el último son recorrect · el último es terminal · uno solo
    expect(j.actions.slice(0, -1).every((a) => a === 'recorrect')).toBe(true)
    expect(terminal).toContain(j.actions[j.actions.length - 1])
    expect(j.actions.filter((a) => terminal.includes(a)).length).toBe(1)
  })
})
