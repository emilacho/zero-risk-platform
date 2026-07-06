/**
 * JEFATURA · harness de test $0 · protocolo del consejero (19:37)
 * ==============================================================
 * Runner en modo MOCK con transcripciones golden → toda la orquestación/convergencia corre
 * gratis. Aserciones sobre la traza M1 (`metadata.jefatura`) reflejando las queries §148 (#277).
 *
 * LÍMITE §148 (regla Q1/dry_run) · esto da AMPLITUD, JAMÁS cierra un hito · mock verde ≠ real
 * verde. UNA corrida real (F2.2 · Peniche) cierra + siembra los fixtures.
 */
import { describe, it, expect } from 'vitest'
import { runResolution, type ResolutionResult } from '../src/lib/jefatura/resolution'
import {
  goldenDeps,
  G_CIMIENTO_PASS,
  G_CIMIENTO_CORRECT_THEN_PASS,
  G_CIMIENTO_CAP_ESCALATE,
  G_CIMIENTO_MONOTONIC_STOP,
  G_CIMIENTO_IRRECONCILABLE,
  G_CONTENIDO_VOTE_PASS,
  type GoldenScenario,
} from '../src/lib/jefatura/testing/golden-graders'
import type { JefaturaInput, JefaturaGradingPolicy } from '../src/lib/jefatura/contract'
import type { JefaturaInvocationMeta, JefaturaVerdictMeta } from '../src/lib/jefatura/observability'

const cimientoPolicy = (max_cycles = 1): JefaturaGradingPolicy => ({
  artifact_type: 'brand_book',
  artifact_class: 'cimiento',
  correction_enabled: true,
  judgment_enabled: false, // no-circularidad · el cimiento NUNCA vota
  canon_grader: 'fidelity',
  counterweight: 'shadow_scorer',
  max_cycles,
  fidelity_threshold: 0.85,
  vote_config: null,
  is_active: true,
})
const contenidoPolicy: JefaturaGradingPolicy = {
  artifact_type: 'ad_creative',
  artifact_class: 'contenido',
  correction_enabled: true,
  judgment_enabled: true,
  canon_grader: 'vote_3_of_n',
  counterweight: 'gpt55_non_voting',
  max_cycles: 1,
  fidelity_threshold: null,
  vote_config: { expected_votes: 3, approve: 2 },
  is_active: true,
}
const input = (artifact_type: string): JefaturaInput => ({
  artifact_type,
  artifact_id: 'art-peniche-1',
  client_id: 'client-peniche',
  journey_id: 'journey-1',
  payload: { draft: { positioning: 'borrador' } },
})
const ids = {
  reviewId: 'rev-harness-1',
  policyId: 'pol-1',
  workflowId: 'wf-harness',
  workflowExecutionId: 'exec-harness',
}

const run = (scenario: GoldenScenario, policy: JefaturaGradingPolicy, artifactType: string): ResolutionResult =>
  runResolution(input(artifactType), policy, ids, goldenDeps(scenario), { topN: 5 })

// ── espejos JS de las queries §148 (#277 · Anexo M1) · verificación POR TRAZA ──
const q = {
  costPerResolution: (r: ResolutionResult) => r.verdictTrace.cost_usd,
  cyclesUsed: (traces: JefaturaInvocationMeta[]) => Math.max(...traces.map((t) => t.cycle)),
  evidenceNonEmpty: (v: JefaturaVerdictMeta) => v.evidence_refs.length > 0,
  grounding: (v: JefaturaVerdictMeta) => v.grounding,
  violations: (r: ResolutionResult) => [
    ...r.invocationTraces.flatMap((t) => t.contract_violations),
    ...r.verdictTrace.contract_violations,
  ],
}

describe('harness $0 · rutas felices (golden E2E)', () => {
  it('CIMIENTO PASS · fidelidad ≥0.85 al primer intento · 0 ciclos', () => {
    const r = run(G_CIMIENTO_PASS, cimientoPolicy(1), 'brand_book')
    expect(r.output.verdict).toBe('PASS')
    expect(r.cycles_used).toBe(0)
    expect(r.verdictTrace.review_id).toBe('rev-harness-1')
    expect(r.verdictTrace.grounding).toBe('chunk_linked') // evidence con chunk_id
  })

  it('CIMIENTO CORRECT→PASS · corrige el rojo factual y pasa en ciclo 1 (cap 2)', () => {
    const r = run(G_CIMIENTO_CORRECT_THEN_PASS, cimientoPolicy(2), 'brand_book')
    expect(r.output.verdict).toBe('PASS')
    expect(r.cycles_used).toBe(1)
    // hay traza de scorer + jefes en ciclo 0 y 1
    expect(q.cyclesUsed(r.invocationTraces)).toBe(1)
  })

  it('CONTENIDO · el voto 3-de-N aprueba → PASS', () => {
    const r = run(G_CONTENIDO_VOTE_PASS, contenidoPolicy, 'ad_creative')
    expect(r.output.verdict).toBe('PASS')
  })
})

describe('harness $0 · rutas de FALLA (fixtures · mejor que en vivo)', () => {
  it('CAP agotado → ESCALATE a humano', () => {
    const r = run(G_CIMIENTO_CAP_ESCALATE, cimientoPolicy(1), 'brand_book')
    expect(r.output.verdict).toBe('ESCALATE')
  })

  it('§7.6 progreso no-monótono → ESCALATE (stop_best · toma la mejor)', () => {
    const r = run(G_CIMIENTO_MONOTONIC_STOP, cimientoPolicy(2), 'brand_book')
    expect(r.output.verdict).toBe('ESCALATE')
  })

  it('§7.4 irreconciliable → ESCALATE', () => {
    const r = run(G_CIMIENTO_IRRECONCILABLE, cimientoPolicy(1), 'brand_book')
    expect(r.output.verdict).toBe('ESCALATE')
  })
})

describe('aserción NEGATIVA de no-circularidad (§4 · el cimiento NUNCA vota)', () => {
  it('ninguna traza de un cimiento tiene rol votante · el grader es fidelidad, jamás voto', () => {
    for (const s of [G_CIMIENTO_PASS, G_CIMIENTO_CORRECT_THEN_PASS, G_CIMIENTO_CAP_ESCALATE]) {
      const r = run(s, cimientoPolicy(2), 'brand_book')
      expect(r.invocationTraces.some((t) => t.role === 'votante')).toBe(false)
      expect(r.invocationTraces.some((t) => t.role === 'fidelity_scorer')).toBe(true)
      expect(r.verdictTrace.vote_tally).toBeUndefined()
    }
  })
  it('el contenido SÍ vota · el cimiento NO · nunca se cruzan', () => {
    const contenido = run(G_CONTENIDO_VOTE_PASS, contenidoPolicy, 'ad_creative')
    expect(contenido.invocationTraces.some((t) => t.role === 'votante')).toBe(true)
    expect(contenido.invocationTraces.some((t) => t.role === 'fidelity_scorer')).toBe(false)
  })
})

describe('verificación POR TRAZA · queries §148 (#277) sobre metadata.jefatura', () => {
  it('review_id · scores · verdict · corrections · evidence_refs · cost presentes', () => {
    const r = run(G_CIMIENTO_PASS, cimientoPolicy(1), 'brand_book')
    const v = r.verdictTrace
    expect(v.review_id).toBe('rev-harness-1')
    expect(v.scores.positioning).toBe(0.95)
    expect(v.verdict).toBe('pass')
    expect(v.corrections_count).toBeGreaterThanOrEqual(1) // ámbar cuenta · ≥1 siempre
    expect(q.evidenceNonEmpty(v)).toBe(true)
    expect(q.costPerResolution(r)).toBeGreaterThan(0)
  })

  it('cost_per_resolution = suma de invocaciones (scorer + 3 jefes + creador)', () => {
    const r = run(G_CIMIENTO_CORRECT_THEN_PASS, cimientoPolicy(2), 'brand_book')
    // 2 ciclos · (scorer + 3 jefes) x2 + 1 creador · todos con costo golden > 0
    expect(q.costPerResolution(r)).toBeGreaterThan(0.03)
  })

  it('evidence_refs coverage · chunk_linked cuando hay chunk_id · prose_only si no', () => {
    const linked = run(G_CIMIENTO_PASS, cimientoPolicy(1), 'brand_book')
    expect(q.grounding(linked.verdictTrace)).toBe('chunk_linked')
    const proseOnly = run(G_CIMIENTO_CAP_ESCALATE, cimientoPolicy(1), 'brand_book') // evidence_refs vacío
    expect(q.grounding(proseOnly.verdictTrace)).toBe('prose_only')
    expect(q.violations(proseOnly)).toContain('cimiento_prose_only') // §148-queryable · no se sobre-vende
  })

  it('cycles_vs_cap · el cycle nunca excede max_cycles en las rutas felices', () => {
    const r = run(G_CIMIENTO_CORRECT_THEN_PASS, cimientoPolicy(2), 'brand_book')
    expect(q.cyclesUsed(r.invocationTraces)).toBeLessThanOrEqual(2)
    expect(r.invocationTraces.every((t) => t.contract_violations.length === 0 || !t.contract_violations.includes('cycle_exceeds_max_cycles'))).toBe(true)
  })
})
