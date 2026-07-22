/**
 * JEFATURA · lane de FIDELIDAD · Sprint JEFATURA F2.1 · ADR-020 §7.
 *
 * Adapta el grader puro de fidelidad (`gradeFidelity` · F1.4) al plug-in
 * `CanonGrader` que el núcleo (`gradeArtifact`) resuelve para `canon_grader =
 * 'fidelity'` (artefactos de clase cimiento). El núcleo NO conoce el scoring: le
 * enchufa esta lane.
 *
 * El SCORING (groundedness 0..1 por campo · tool `emit_fidelity_scores`) es un
 * `FidelityScorer` INYECTABLE · en prod llama al LLM · en tests se mockea ($0 · el
 * núcleo y esta lane son testeables sin red ni LLM real).
 */
import type { JefaturaInput, JefaturaGradingPolicy } from './contract'
import type { CanonGrader, CanonGraderResult } from './service'
import {
  gradeFidelity,
  DEFAULT_FIDELITY_THRESHOLD,
  type FidelityEvidenceRef,
} from './fidelity-grader'

/** Produce los scores de groundedness 0..1 por campo (LLM `emit_fidelity_scores`). */
export interface FidelityScorer {
  score(
    input: JefaturaInput,
    policy: JefaturaGradingPolicy,
  ): Promise<Record<string, number>>
}

/** Shape esperado del payload del cimiento (lo arma el productor tras Persist Canon). */
interface CimientoPayload {
  readonly fidelity_cycle?: number
  readonly evidence_refs?: readonly FidelityEvidenceRef[]
  readonly gated_fields?: readonly string[]
}

/**
 * Construye el `CanonGrader` de fidelidad. Extrae del payload el ciclo de fidelidad
 * y los evidence_refs, obtiene los scores del `scorer`, y delega la DECISIÓN a
 * `gradeFidelity` (PASS / CORRECTED / ESCALATE · decide, no vota). El `trace_id`
 * lo pone el núcleo · acá se descarta el del grader.
 */
export function makeFidelityCanonGrader(scorer: FidelityScorer): CanonGrader {
  return {
    async grade(input: JefaturaInput, policy: JefaturaGradingPolicy): Promise<CanonGraderResult> {
      const payload = (input.payload ?? {}) as CimientoPayload
      const scores = await scorer.score(input, policy)
      const graded = gradeFidelity({
        scores,
        // §144 · el ciclo es INTELIGENCIA DEL MÓDULO, no memoria del caller · default 0 (pasada
        // fresca) y aceptar el 0 EXPLÍCITO (el `|| 1` previo coerce 0→1 · resucita el bug
        // cap-agotado-al-primer-grade · exec 62841). Un caller desnudo NO puede escalar directo.
        fidelityCycle: Number.isFinite(Number(payload.fidelity_cycle))
          ? Number(payload.fidelity_cycle)
          : 0,
        maxCycles: policy.max_cycles,
        evidenceRefs: payload.evidence_refs,
        threshold: policy.fidelity_threshold ?? DEFAULT_FIDELITY_THRESHOLD,
        gatedFields: payload.gated_fields,
        traceId: input.artifact_id, // descartado por el núcleo · sólo requerido por el tipo
      })
      return {
        verdict: graded.verdict,
        scores: graded.scores,
        corrections: graded.corrections,
      }
    },
  }
}
