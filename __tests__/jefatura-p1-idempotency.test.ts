/**
 * JEFATURA · Peldaño 1 · $0 · IDEMPOTENCIA (§153)
 * ================================================
 * Concern (consejero · plan de pruebas 2026-07-07 · "los bugs de callback fueron parte de
 * esto"): mismo input dos veces → mismo verdict · sin doble promoción / doble-write.
 *
 * A nivel LÓGICA ($0) la propiedad testeable es que el DECISOR es DETERMINISTA y SIN EFECTOS
 * SECUNDARIOS — la precondición de un replay idempotente. Se afirma:
 *   1. `runResolution` con el mismo (input, policy, ids, deps) → salida byte-idéntica (verdict,
 *      scores, cost, ciclos, traza) · replay seguro.
 *   2. el driver NO muta el `input` (correr no deja estado que haga divergir un segundo intento).
 *   3. los graders puros (`evaluateContentVoteGate`, `gradeFidelity`) son idempotentes.
 *
 * LÍMITE §148 · la garantía de "no doble-write" a nivel PERSISTENCIA (dedup key / unique
 * constraint en el callback n8n→DB) es un seam con I/O · se valida en real (Peldaño 2/3 ·
 * ADR-020 §153). Acá se prueba que aguas arriba el decisor no introduce no-determinismo.
 */
import { describe, it, expect } from 'vitest'
import { runResolution } from '../src/lib/jefatura/resolution'
import { goldenDeps, G_CIMIENTO_PASS, G_CIMIENTO_CORRECT_THEN_PASS, G_CIMIENTO_CAP_ESCALATE, G_CONTENIDO_VOTE_PASS } from '../src/lib/jefatura/testing/golden-graders'
import { evaluateContentVoteGate } from '../src/lib/jefatura/content-vote-gate'
import { gradeFidelity } from '../src/lib/jefatura/fidelity-grader'
import type { JefaturaInput, JefaturaGradingPolicy } from '../src/lib/jefatura/contract'
import type { VoteRecord } from '../src/lib/camino-iii/tabulate'

const cimientoPolicy = (max_cycles = 1): JefaturaGradingPolicy => ({
  artifact_type: 'brand_book', artifact_class: 'cimiento', correction_enabled: true,
  judgment_enabled: false, canon_grader: 'fidelity', counterweight: 'shadow_scorer',
  max_cycles, fidelity_threshold: 0.85, vote_config: null, is_active: true,
})
const contenidoPolicy: JefaturaGradingPolicy = {
  artifact_type: 'ad_creative', artifact_class: 'contenido', correction_enabled: true,
  judgment_enabled: true, canon_grader: 'vote_3_of_n', counterweight: 'gpt55_non_voting',
  max_cycles: 1, fidelity_threshold: null, vote_config: { expected_votes: 3, approve: 2 }, is_active: true,
}
const mkInput = (): JefaturaInput => ({
  artifact_type: 'brand_book', artifact_id: 'art-1', client_id: 'client-peniche',
  journey_id: 'journey-1', payload: { draft: { positioning: 'borrador' } },
})
const ids = { reviewId: 'rev-1', policyId: 'pol-1', workflowId: 'wf-1', workflowExecutionId: 'exec-1' }

describe('§153 · runResolution es determinista · replay byte-idéntico', () => {
  const cases = [
    { name: 'CIMIENTO PASS', s: G_CIMIENTO_PASS, p: cimientoPolicy(1), t: 'brand_book' },
    { name: 'CIMIENTO CORRECT→PASS', s: G_CIMIENTO_CORRECT_THEN_PASS, p: cimientoPolicy(2), t: 'brand_book' },
    { name: 'CIMIENTO CAP→ESCALATE', s: G_CIMIENTO_CAP_ESCALATE, p: cimientoPolicy(1), t: 'brand_book' },
    { name: 'CONTENIDO VOTE PASS', s: G_CONTENIDO_VOTE_PASS, p: contenidoPolicy, t: 'ad_creative' },
  ]
  for (const { name, s, p, t } of cases) {
    it(`${name} · dos corridas → misma salida (verdict · scores · cost · ciclos · traza)`, () => {
      const run = () => runResolution({ ...mkInput(), artifact_type: t }, p, ids, goldenDeps(s), { topN: 5 })
      const r1 = run()
      const r2 = run()
      expect(r2.output).toEqual(r1.output)
      expect(r2.verdictTrace).toEqual(r1.verdictTrace)
      expect(r2.cost_usd).toBe(r1.cost_usd)
      expect(r2.cycles_used).toBe(r1.cycles_used)
      expect(JSON.stringify(r2.output)).toBe(JSON.stringify(r1.output)) // byte-idéntico
    })
  }
})

describe('§153 · el driver NO muta el input (replay-safe · sin efectos secundarios)', () => {
  it('correr una resolución no altera el input original (deep-equal antes/después)', () => {
    const inp = mkInput()
    const snapshot = structuredClone(inp)
    runResolution(inp, cimientoPolicy(2), ids, goldenDeps(G_CIMIENTO_CORRECT_THEN_PASS), { topN: 5 })
    expect(inp).toEqual(snapshot) // payload.draft intacto · ninguna corrida deja estado
  })

  it('dos corridas sobre el MISMO objeto input → siguen siendo idénticas (no acumula estado)', () => {
    const inp = mkInput()
    const a = runResolution(inp, cimientoPolicy(2), ids, goldenDeps(G_CIMIENTO_CORRECT_THEN_PASS), { topN: 5 })
    const b = runResolution(inp, cimientoPolicy(2), ids, goldenDeps(G_CIMIENTO_CORRECT_THEN_PASS), { topN: 5 })
    expect(b.output).toEqual(a.output)
  })
})

describe('§153 · graders puros idempotentes', () => {
  const votes: VoteRecord[] = [
    { reviewer_agent: 'r1', vote: 'green', corrections: [] },
    { reviewer_agent: 'r2', vote: 'green', corrections: [] },
    { reviewer_agent: 'r3', vote: 'amber', corrections: [] },
  ]
  it('evaluateContentVoteGate · mismo voto 2× → mismo JefaturaOutput', () => {
    const o1 = evaluateContentVoteGate({ votes, expectedVotes: 3, trace_id: 'tr-1' })
    const o2 = evaluateContentVoteGate({ votes, expectedVotes: 3, trace_id: 'tr-1' })
    expect(o2).toEqual(o1)
    expect(o1.verdict).toBe('PASS') // ≥2 green · 0 red
  })

  it('gradeFidelity · mismos params 2× → mismo resultado (verdict · scores · grounding)', () => {
    const params = {
      scores: { positioning: 0.6, icp_summary: 0.7 }, fidelityCycle: 1, maxCycles: 1,
      evidenceRefs: [{ field: 'positioning', chunk_id: 'ch-1', grounding: 'chunk_linked' as const }],
      traceId: 'tr-1',
    }
    const a = gradeFidelity(params)
    const b = gradeFidelity(params)
    expect(b).toEqual(a)
    expect(a.verdict).toBe('ESCALATE') // <0.85 y cap agotado
  })
})
