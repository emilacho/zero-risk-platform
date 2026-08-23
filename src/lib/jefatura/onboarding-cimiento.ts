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
import { DEFAULT_GATED_FIELDS, type FidelityEvidenceRef, type GroundingProvenance } from './fidelity-grader'
import { matchClaimsToChunks, type ClaimInput } from './evidence-matcher'

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
  /** H1.4 · matcher inyectable · sólo para probar sin CEREBRO ni red ($0). */
  readonly matcher?: ClaimMatcher
  /** H1.4 · umbral de similaridad · override > env > 0.72 (calibrado · no subirlo "por
   *  prudencia": un umbral alto hace `chunk_linked` inalcanzable y todo queda provisional). */
  readonly matchThreshold?: number
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
  /** H1.4 · el detalle de la verificación (cobertura fáctica · refs reales · umbral).
   *  `verified:false` = no se pudo consultar el CEREBRO ≠ "no tiene fundamento". */
  readonly groundingResult: CimientoGroundingResult
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

/** Veredicto de procedencia del cimiento · el REAL, contra evidencia de descubrimiento. */
export interface CimientoGroundingResult {
  readonly grounding: GroundingProvenance
  /** ¿se pudo verificar contra el CEREBRO? `false` = no sabemos, y por eso no afirmamos. */
  readonly verified: boolean
  /** chunk_ids de EVIDENCIA que fundamentan hechos (nunca del propio manual). */
  readonly evidence_refs: readonly string[]
  readonly factual_matched: number
  readonly factual_total: number
  readonly factual_coverage: number
  readonly threshold: number
}

/** Inyectable para poder probar sin CEREBRO ni red ($0). */
export type ClaimMatcher = typeof matchClaimsToChunks

/**
 * H1.4 · resuelve la procedencia del cimiento **verificándola**, no creyéndole a las refs.
 *
 * Por qué no alcanza con `resolveGrounding(evidenceRefs)` (el camino anterior):
 * `FidelityEvidenceRef` NO lleva `source_table` (`fidelity-grader.ts:40-46`), así que no
 * hay forma de saber de qué tabla salió el fragmento · y con semántica ANY
 * (`fidelity-grader.ts:161-167`) **una sola** referencia basta para declarar
 * `chunk_linked`. Un calce del manual contra el manual mismo @1.000 pasaba como
 * fundamentado. Eso es auto-fundamento: circular, y por lo tanto vacío.
 *
 * Acá se re-deriva consultando el CEREBRO a través de `matchClaimsToChunks`, que
 * **excluye `brand_books` del pool** (fix 3 · `evidence-matcher.ts:173`). El filtro ya
 * estaba bien escrito y NO se toca · lo que faltaba era que alguien lo llamara.
 *
 * Las dos calibraciones vienen del módulo, no se pisan desde acá:
 *  · umbral **0.72** (medido · evidencia real 0.74-0.89 · ruido ≤0.69)
 *  · gatea **sólo campos fácticos** (`DEFAULT_GATED_FIELDS`) · aplicarlo a todo haría
 *    `chunk_linked` inalcanzable por diseño y dejaría todo manual en borrador para siempre.
 *
 * Si no se puede verificar (sin cliente), devuelve `prose_only` con `verified:false`:
 * no sabemos ≠ no tiene fundamento, pero tampoco se afirma lo que no se comprobó.
 */
export async function resolveCimientoGrounding(params: {
  readonly clientId: string | null
  readonly brandBookDraft: Record<string, unknown>
  readonly evidenceRefs?: readonly FidelityEvidenceRef[]
  readonly matcher?: ClaimMatcher
  readonly matchThreshold?: number
}): Promise<CimientoGroundingResult> {
  const vacio = (verified: boolean, threshold = 0): CimientoGroundingResult => ({
    grounding: 'prose_only',
    verified,
    evidence_refs: [],
    factual_matched: 0,
    factual_total: 0,
    factual_coverage: 0,
    threshold,
  })

  // Sin cliente no hay CEREBRO que consultar ⇒ no se puede verificar ⇒ no se afirma.
  if (!params.clientId) return vacio(false)

  const claims: ClaimInput[] = Object.entries(params.brandBookDraft ?? {})
    .filter(([, v]) => typeof v === 'string' && v.trim().length > 0)
    .map(([field, v]) => ({ field, text: (v as string).trim() }))

  // Sin campos fácticos no hay nada que fundamentar · el matcher ya lo resuelve así,
  // pero cortamos antes para no gastar una consulta de embedding por nada.
  const hayFacticos = claims.some((c) => (DEFAULT_GATED_FIELDS as readonly string[]).includes(c.field))
  if (!hayFacticos) return vacio(true)

  const matcher = params.matcher ?? matchClaimsToChunks
  let r: Awaited<ReturnType<ClaimMatcher>>
  try {
    r = await matcher({ client_id: params.clientId, claims, threshold: params.matchThreshold })
  } catch {
    // El CEREBRO no respondió (sin credencial · red · RPC caído). Verificar la
    // procedencia NO puede tumbar la calificación entera: el cimiento se sigue
    // calificando y se promueve PROVISIONAL. `verified:false` deja dicho que no se
    // pudo comprobar — que no es lo mismo que "se comprobó y no tiene fundamento".
    return vacio(false)
  }

  return {
    grounding: r.grounding,
    verified: true,
    evidence_refs: r.evidence_refs,
    factual_matched: r.factual_matched,
    factual_total: r.factual_total,
    factual_coverage: r.factual_coverage,
    threshold: r.threshold,
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
  // H1.4 · la procedencia se VERIFICA contra evidencia de descubrimiento · antes se
  // le creía a `evidence_refs` con semántica ANY y un calce del manual contra sí mismo
  // @1.000 pasaba como fundamentado (auto-fundamento circular).
  const groundingResult = await resolveCimientoGrounding({
    clientId: params.clientId,
    brandBookDraft: params.brandBookDraft,
    evidenceRefs: params.evidenceRefs,
    matcher: params.matcher,
    matchThreshold: params.matchThreshold,
  })
  const grounding = groundingResult.grounding
  const provisional = action === 'promote' && grounding === 'prose_only'

  return { action, output, grounding, provisional, groundingResult }
}
