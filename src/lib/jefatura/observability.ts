/**
 * JEFATURA · Observabilidad M1 · namespace `metadata.jefatura`
 * ============================================================
 * Sustrato de observabilidad de la Jefatura (ADR-020 Anexo M1 · P4 del sprint de
 * construcción · pre-build · vinculante). Cada resolución de la Jefatura deja una traza
 * §148-queryable ANTES de construirse el servicio (T.2 · lección postmortem #249). Es el
 * MISMO namespace que Braintrust consume (F4.3 · spans = `review_id`).
 *
 * $0 · SUSTRATO · este módulo SOLO define tipos + builders puros. NO se cablea a ninguna
 * invocación viva todavía (ese wiring es F2+ del sprint). Los graders futuros llaman a
 * estos builders y adjuntan el resultado a `agent_invocations.metadata.jefatura`.
 *
 * Herencia F1.2 · `nominal_agent` + `effective_model` · la traza NUNCA miente el modelo
 * (p.ej. un slug "gpt-5.5-advisor" que corre en Sonnet → effective_model=claude-sonnet-4-6).
 */

// ── vocabulario canónico (ADR-020) ──────────────────────────────────────────

/** Rol de ESTA invocación dentro del módulo (Anexo M1 §1). */
export type JefaturaRole = 'corrector' | 'votante' | 'fidelity_scorer' | 'shadow' | 'non_voting'

/** Cómo está anclada la evidencia (Anexo M1 §2). `chunk_linked` = claim→chunk real;
 *  `prose_only` = evidencia aplanada sin back-reference (estado actual · el `chunk_id`
 *  se descarta en la capa app · honesto hasta que exista el surfacing evidence_refs). */
export type GroundingKind = 'chunk_linked' | 'prose_only'

/** Veredicto de la resolución (Anexo M1 §2). */
export type JefaturaVerdictKind = 'pass' | 'corrections' | 'escalate'

/** Mecanismo del grader (fila de `jefatura_grading_policies`). */
export type JefaturaMechanism = 'fidelity' | 'vote_3_of_n' | 'correction_loop'

// ── estructuras del namespace ───────────────────────────────────────────────

/** Snapshot de la política VIGENTE al decidir · auditable aunque la tabla cambie después. */
export interface JefaturaPolicySnapshot {
  mecanismo: JefaturaMechanism
  threshold: number | null
  max_cycles: number
}

/** Una referencia de evidencia claim→chunk. `chunk_id` es null mientras el surfacing no
 *  exista (hoy: prosa aplanada · el chunk_id de la RPC del CEREBRO se descarta). */
export interface JefaturaEvidenceRef {
  /** Campo puntuado que esta evidencia ancla (p.ej. 'positioning'). */
  field: string
  /** chunk_id del CEREBRO (`client_brain_chunks`) · null si aún prose_only. */
  chunk_id: string | null
  source_table?: string
  section_label?: string
  similarity?: number
}

/**
 * Namespace `metadata.jefatura` — en CADA invocación de jefe/scorer dentro del módulo
 * (Anexo M1 §1). Agrupa las N invocaciones de una misma pieza por `review_id`.
 */
export interface JefaturaInvocationMeta {
  review_id: string
  // sobre del contrato (copiado literal del intake)
  artifact_type: string
  artifact_id: string
  client_id: string
  journey_id: string | null
  // política vigente al decidir
  policy_id: string
  policy_snapshot: JefaturaPolicySnapshot
  // esta invocación
  role: JefaturaRole
  cycle: number
  // herencia F1.2 · la traza NUNCA miente el modelo
  nominal_agent: string
  effective_model: string
  // §149 · obligatorio
  workflow_id: string
  workflow_execution_id: string
  // Braintrust fail-open honesto · declara si se exportó (no silencioso)
  braintrust_exported: boolean
  /** violaciones de contrato detectadas · §148-queryable (vacío = OK). */
  contract_violations: string[]
}

/**
 * El veredicto — una vez por resolución (invocación decisora + fila en
 * `editorial_decisions`) (Anexo M1 §2).
 */
export interface JefaturaVerdictMeta {
  review_id: string
  verdict: JefaturaVerdictKind
  /** solo contenido (voto 3-de-N). */
  vote_tally?: { green: number; amber: number; red: number }
  /** fidelidad por campo factual + `_aggregate` (cimiento) · o confidence (contenido). */
  scores: Record<string, number>
  /** el contrato exige ≥1 SIEMPRE (la Jefatura corrige siempre) · 0 = bug, se detecta acá. */
  corrections_count: number
  corrections_ref: string | null
  /** chunk_ids del CEREBRO usados como grounding (claim→chunk). */
  evidence_refs: JefaturaEvidenceRef[]
  /** declarado · mientras el surfacing no exista, dice `prose_only` en vez de aparentar. */
  grounding: GroundingKind
  /** costo de la resolución completa (suma de invocaciones) · alimenta §150 + T.3. */
  cost_usd: number
  braintrust_exported: boolean
  /** violaciones de contrato detectadas · §148-queryable (vacío = OK). */
  contract_violations: string[]
}

// ── builders puros ──────────────────────────────────────────────────────────

/** clases de artefacto que son CIMIENTO · el gate es fidelidad · evidence_refs meta 100%. */
export const CIMIENTO_ARTIFACT_TYPES: ReadonlySet<string> = new Set([
  'brand_book',
  'icp',
  'competitive',
])

/** Deriva el grounding HONESTO desde las referencias · `chunk_linked` solo si hay refs y
 *  TODAS traen chunk_id real · si no, `prose_only` (no se sobre-vende groundedness). */
export function deriveGrounding(evidenceRefs: JefaturaEvidenceRef[]): GroundingKind {
  if (evidenceRefs.length === 0) return 'prose_only'
  return evidenceRefs.every((r) => typeof r.chunk_id === 'string' && r.chunk_id.length > 0)
    ? 'chunk_linked'
    : 'prose_only'
}

export interface BuildInvocationInput {
  reviewId: string
  artifactType: string
  artifactId: string
  clientId: string
  journeyId?: string | null
  policyId: string
  policySnapshot: JefaturaPolicySnapshot
  role: JefaturaRole
  cycle: number
  nominalAgent: string
  effectiveModel: string
  workflowId: string | null | undefined
  workflowExecutionId: string | null | undefined
  braintrustExported?: boolean
}

/**
 * Construye el namespace por-invocación + detecta violaciones de contrato §148-queryable.
 * NO tira · deja SIEMPRE la traza (la violación se registra, no se pierde el registro).
 */
export function buildJefaturaInvocationMeta(input: BuildInvocationInput): JefaturaInvocationMeta {
  const violations: string[] = []
  // §149 · workflow_id + workflow_execution_id obligatorios
  if (!input.workflowId) violations.push('missing_workflow_id')
  if (!input.workflowExecutionId) violations.push('missing_workflow_execution_id')
  if (input.cycle < 0) violations.push('negative_cycle')
  if (input.cycle > input.policySnapshot.max_cycles) violations.push('cycle_exceeds_max_cycles')

  return {
    review_id: input.reviewId,
    artifact_type: input.artifactType,
    artifact_id: input.artifactId,
    client_id: input.clientId,
    journey_id: input.journeyId ?? null,
    policy_id: input.policyId,
    policy_snapshot: input.policySnapshot,
    role: input.role,
    cycle: input.cycle,
    nominal_agent: input.nominalAgent,
    effective_model: input.effectiveModel,
    workflow_id: input.workflowId ?? '',
    workflow_execution_id: input.workflowExecutionId ?? '',
    braintrust_exported: input.braintrustExported ?? false,
    contract_violations: violations,
  }
}

export interface BuildVerdictInput {
  reviewId: string
  artifactType: string
  verdict: JefaturaVerdictKind
  voteTally?: { green: number; amber: number; red: number }
  scores: Record<string, number>
  correctionsCount: number
  correctionsRef?: string | null
  evidenceRefs?: JefaturaEvidenceRef[]
  costUsd: number
  braintrustExported?: boolean
}

/**
 * Construye el veredicto + detecta violaciones (Anexo M1 §2):
 * - `corrections_count ≥ 1` SIEMPRE (0 = bug · la Jefatura corrige siempre).
 * - un `verdict === 'corrections'` con 0 correcciones es un bug duro (rojo sin correcciones).
 * - `grounding` derivado HONESTO · cimiento con `prose_only` se marca (no es groundedness real).
 * NO tira · registra las violaciones en `contract_violations` (§148-queryable).
 */
export function buildJefaturaVerdictMeta(input: BuildVerdictInput): JefaturaVerdictMeta {
  const violations: string[] = []
  const evidenceRefs = input.evidenceRefs ?? []
  const grounding = deriveGrounding(evidenceRefs)

  if (input.correctionsCount < 1) violations.push('corrections_count_zero')
  if (input.verdict === 'corrections' && input.correctionsCount < 1) {
    violations.push('rejection_without_corrections')
  }
  // cimiento calificado sobre prosa = "PROVISIONAL (grounded por prosa)" · NO groundedness real
  if (CIMIENTO_ARTIFACT_TYPES.has(input.artifactType) && grounding === 'prose_only') {
    violations.push('cimiento_prose_only')
  }
  if (input.costUsd < 0) violations.push('negative_cost')

  return {
    review_id: input.reviewId,
    verdict: input.verdict,
    ...(input.voteTally ? { vote_tally: input.voteTally } : {}),
    scores: input.scores,
    corrections_count: input.correctionsCount,
    corrections_ref: input.correctionsRef ?? null,
    evidence_refs: evidenceRefs,
    grounding,
    cost_usd: input.costUsd,
    braintrust_exported: input.braintrustExported ?? false,
    contract_violations: violations,
  }
}
