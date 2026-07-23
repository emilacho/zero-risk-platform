/**
 * JEFATURA · núcleo del servicio · Sprint JEFATURA F1.1 · ADR-020.
 *
 * UN servicio de calificación: recibe el contrato (`JefaturaInput`) · lee la
 * política del registry (`jefatura_grading_policies`) · rutea por `artifact_type`
 * al grader correcto · devuelve el veredicto único (`JefaturaOutput`).
 *
 * Este archivo es el SHELL. Los 3 graders reales (corrección · fidelidad ·
 * voto 3-de-N) ENCHUFAN por `JefaturaGraders` (F1.2 · F1.3 · la lane de fidelidad).
 * El shell NO reimplementa calidad · sólo rutea y ensambla (ADR-020 §36).
 *
 * §148 · construcción $0 · nada se cablea a prod aquí (los graders siguen stub
 * hasta F1.2/F1.3 · el apply de la tabla es build post-GO).
 */
import { randomUUID } from 'node:crypto'
import type {
  JefaturaInput,
  JefaturaOutput,
  JefaturaGradingPolicy,
  JefaturaCorrection,
  JefaturaScores,
  JefaturaVerdict,
} from './contract'

// ─── Plug-in points · aquí enchufan los graders ─────────────────────────────

/** Resultado de un grader canónico (el que DECIDE el veredicto). */
export interface CanonGraderResult {
  readonly verdict: JefaturaVerdict
  readonly scores: JefaturaScores
  readonly corrections: readonly JefaturaCorrection[]
}

/** CORRECCIÓN (siempre) · emite objetos accionables · NO reescribe (F1.2). */
export interface CorrectionGrader {
  correct(
    input: JefaturaInput,
    policy: JefaturaGradingPolicy,
  ): Promise<readonly JefaturaCorrection[]>
}

/** Grader CANÓNICO que decide verdict · fidelidad (cimiento) | voto 3-de-N (contenido · F1.3). */
export interface CanonGrader {
  grade(input: JefaturaInput, policy: JefaturaGradingPolicy): Promise<CanonGraderResult>
}

/** Los graders que enchufan al núcleo. Se resuelve por `policy.canon_grader`. */
export interface JefaturaGraders {
  readonly correction: CorrectionGrader
  /** canon_grader = 'fidelity' (cimiento). */
  readonly fidelity: CanonGrader
  /** canon_grader = 'vote_3_of_n' (contenido). */
  readonly vote3ofN: CanonGrader
}

/** Dependencias inyectables · el núcleo es testeable sin DB ni red. */
export interface JefaturaDeps {
  /** Lee la fila de `jefatura_grading_policies` por artifact_type (null si no existe). */
  fetchPolicy(artifactType: string): Promise<JefaturaGradingPolicy | null>
  graders: JefaturaGraders
  /** Override del trace_id para tests · default `randomUUID`. */
  genTraceId?: () => string
}

// ─── Loop-cap central (ADR-020 §7 · §121 · un solo lugar que acota) ─────────

/** true si ya se agotaron los ciclos de corrección permitidos por la política. */
export function atLoopCap(cycle: number, policy: JefaturaGradingPolicy): boolean {
  return cycle >= policy.max_cycles
}

// ─── Núcleo ─────────────────────────────────────────────────────────────────

/**
 * Califica un artefacto (una pasada). El productor re-invoca por ciclo tras
 * corregir; el cap vive acá (`atLoopCap`) — imposible de olvidar per-workflow.
 *
 * @param cycle ciclo de corrección actual (0-based · default 0).
 */
export async function gradeArtifact(
  input: JefaturaInput,
  deps: JefaturaDeps,
  cycle = 0,
): Promise<JefaturaOutput> {
  const trace_id = (deps.genTraceId ?? randomUUID)()

  const policy = await deps.fetchPolicy(input.artifact_type)

  // Tipo desconocido / política inactiva → a humano (NUNCA aprobar a ciegas).
  if (!policy || !policy.is_active) {
    return { corrections: [], verdict: 'ESCALATE', scores: {}, trace_id }
  }

  // Defensa en profundidad de la no-circularidad (ADR-020 §4 · además del CHECK DB):
  // el cimiento jamás se rutea por juicio.
  if (policy.artifact_class === 'cimiento' && policy.judgment_enabled) {
    return { corrections: [], verdict: 'ESCALATE', scores: {}, trace_id }
  }

  // CORRECCIÓN · siempre encendida (función base).
  const baseCorrections: JefaturaCorrection[] = policy.correction_enabled
    ? [...(await deps.graders.correction.correct(input, policy))]
    : []

  // JUICIO canónico · rutea por canon_grader (fidelidad | voto 3-de-N).
  const canonGrader =
    policy.canon_grader === 'vote_3_of_n' ? deps.graders.vote3ofN : deps.graders.fidelity
  const result = await canonGrader.grade(input, policy)

  const corrections = mergeCorrections(baseCorrections, result.corrections)

  // Invariante ADR-020 §58 · un REJECT SIEMPRE trae correcciones (un rojo sin
  // correcciones es un bug, no un voto) → sin correcciones, a humano.
  let verdict: JefaturaVerdict =
    result.verdict === 'REJECT' && corrections.length === 0 ? 'ESCALATE' : result.verdict

  // Loop-cap central · si el artefacto YA está en el cap (cycle ≥ max_cycles) y aún
  // pide otro ciclo (CORRECTED), NO se puede seguir corrigiendo → decide humano.
  // §144 · `atLoopCap(cycle)` (NO `cycle + 1`): con `max_cycles = N`, el cap central
  // debe coincidir con el fidelity-grader (`fidelityCycle >= maxCycles`) · el `+ 1`
  // previo escalaba en el PRIMER grade (cycle 0 · max_cycles 1 → 1>=1) · resucita el
  // bug cap-agotado-al-primer-grade que #301 sólo tapó en el otro contador. Ahora
  // max_cycles=1 = EXACTAMENTE 1 recorrect (cycle 0 → recorrect · cycle 1 → escalate).
  if (verdict === 'CORRECTED' && atLoopCap(cycle, policy)) {
    verdict = 'ESCALATE'
  }

  return { corrections, verdict, scores: result.scores, trace_id }
}

/** Une correcciones de-duplicando por (eje, donde) · las del grader canónico ganan. */
function mergeCorrections(
  base: readonly JefaturaCorrection[],
  canon: readonly JefaturaCorrection[],
): JefaturaCorrection[] {
  const byKey = new Map<string, JefaturaCorrection>()
  for (const c of base) byKey.set(`${c.eje}::${c.donde}`, c)
  for (const c of canon) byKey.set(`${c.eje}::${c.donde}`, c)
  return [...byKey.values()]
}
