/**
 * JEFATURA · enganche onboarding → cimiento · Sprint JEFATURA F2.1 · ADR-020 §68-74.
 *
 * En el journey deal-won, TRAS `Persist Canon` (el brand book draft ya existe con su
 * evidencia rica #279 + evidence_refs #278), el productor llama a la Jefatura POR
 * CONTRATO con el artefacto de clase `cimiento`. La FIDELIDAD decide:
 *   - PASS      → PROMOVER el brand book a canon.
 *   - CORRECTED → RE-CORREGIR (otro ciclo · el creador corrige · loop-cap central).
 *   - ESCALATE  → HITL (a humano · <0.85 tras cap · nunca auto-aprobar).
 *
 * §148 · esto es la lógica de enganche ($0 · testeable con mocks). El `gradeArtifact`
 * inyecta la política (registry) y los graders · el LLM del scorer se mockea. NO
 * aplica migración ni dispara LLM real.
 */
import { gradeArtifact, type JefaturaDeps } from './service'
import type { JefaturaInput, JefaturaOutput } from './contract'
import { resolveGrounding, type FidelityEvidenceRef, type GroundingProvenance } from './fidelity-grader'

/** artifact_type canónico del cimiento del onboarding. */
export const BRAND_BOOK_ARTIFACT_TYPE = 'brand_book'

/** Acción que el productor ejecuta según el veredicto de la Jefatura. */
export type CimientoAction = 'promote' | 'recorrect' | 'escalate_hitl'

export interface GradeCimientoParams {
  readonly clientId: string | null
  readonly journeyId: string | null
  /** Id del brand book / artefacto (uuid o clave de negocio). */
  readonly artifactId: string
  /** Los campos del draft a calificar (positioning, icp_summary, …). */
  readonly brandBookDraft: Record<string, unknown>
  /** Evidencia rica (#279) que consume el scorer: client_name·industry·competitors·icp_signals·discovery_summary. */
  readonly evidence: Record<string, unknown>
  /** Refs claim→chunk (#278) · determinan la procedencia del grounding. */
  readonly evidenceRefs?: readonly FidelityEvidenceRef[]
  /** Ciclo de fidelidad independiente (1-based) · lo lleva el productor. */
  readonly fidelityCycle?: number
  /** Ciclo de corrección (0-based · para el loop-cap del núcleo). */
  readonly cycle?: number
}

export interface CimientoGradingResult {
  readonly action: CimientoAction
  readonly output: JefaturaOutput
  /** Procedencia real del grounding · `prose_only` ⇒ promoción PROVISIONAL. */
  readonly grounding: GroundingProvenance
  /**
   * true cuando se promueve pero el grounding es sólo prosa (§8 endurecimiento 2):
   * el consumidor debe marcar el brand book "calificado PROVISIONAL (grounded por
   * prosa)", NO "gateado por groundedness real". Un score de fidelidad sobre prosa
   * haciéndose pasar por groundedness = el mismo falso-verde.
   */
  readonly provisional: boolean
}

/** Mapea el veredicto único de la Jefatura a la acción del productor. */
export function resolveCimientoAction(verdict: JefaturaOutput['verdict']): CimientoAction {
  switch (verdict) {
    case 'PASS':
      return 'promote'
    case 'CORRECTED':
      return 'recorrect'
    // REJECT no aplica al cimiento (es del voto) · si llegara, a humano. ESCALATE → HITL.
    case 'REJECT':
    case 'ESCALATE':
    default:
      return 'escalate_hitl'
  }
}

/**
 * Califica el brand book (cimiento) por contrato y devuelve la acción a ejecutar.
 * NO promueve/escala por sí mismo · devuelve la DECISIÓN · el productor (n8n / el
 * endpoint) ejecuta la acción (promover a client_brand_books · re-síntesis · HITL).
 */
export async function gradeOnboardingCimiento(
  params: GradeCimientoParams,
  deps: JefaturaDeps,
): Promise<CimientoGradingResult> {
  const input: JefaturaInput = {
    artifact_type: BRAND_BOOK_ARTIFACT_TYPE,
    artifact_id: params.artifactId,
    client_id: params.clientId,
    journey_id: params.journeyId,
    payload: {
      brand_book_draft: params.brandBookDraft,
      evidence: params.evidence,
      evidence_refs: params.evidenceRefs ?? [],
      fidelity_cycle: params.fidelityCycle ?? 1,
    },
  }

  const output = await gradeArtifact(input, deps, params.cycle ?? 0)
  const action = resolveCimientoAction(output.verdict)
  const grounding = resolveGrounding(params.evidenceRefs)
  const provisional = action === 'promote' && grounding === 'prose_only'

  return { action, output, grounding, provisional }
}
