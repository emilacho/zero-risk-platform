/**
 * JEFATURA · grader de FIDELIDAD del cimiento · Sprint JEFATURA F1.4 · ADR-020 §7.
 *
 * Generaliza el scorer de fidelidad que hoy vive embebido en el brand-book-track
 * (`faithfulness-judge.js`) a una función pura del módulo Jefatura, invocable por
 * el contrato único para cualquier artefacto de clase `cimiento`.
 *
 * QUÉ HACE (ADR-020 §7 · §4 no-circularidad):
 *  - Puntúa groundedness (0..1) por campo FÁCTICO y **DECIDE** listo/no listo
 *    contra un umbral (≥0.85) · NO vota · NO tabula · la vara re-puntúa el resultado.
 *  - No-circularidad: el cimiento se califica SOLO por fidelidad · nunca por el
 *    voto de contenido. Esta función jamás lee votos.
 *  - <umbral tras el loop-cap central → ESCALATE (HITL) · nunca se auto-aprueba.
 *  - Consume la evidencia RICA (client_name·industry·competitors·icp_signals · #279)
 *    vía los scores que produce el juez, y los `evidence_refs` (claim→chunk · #278)
 *    para declarar la PROCEDENCIA del grounding. Con `prose_only` el veredicto NO se
 *    sobre-vende (§8 endurecimiento 2 · un score sobre prosa ≠ groundedness real).
 *
 * §148 · esto es lógica pura ($0 · tipos + decisión) · el scoring LLM (emit_fidelity_
 * scores) y el cableado n8n son build post-GO. Esta función recibe los scores ya
 * emitidos y produce el `JefaturaOutput` del cimiento.
 */
import type {
  JefaturaCorrection,
  JefaturaOutput,
  JefaturaScores,
  JefaturaVerdict,
} from './contract'

/** Campos fácticos que GATEAN el cimiento (verificables contra la evidencia). Las
 * derivaciones creativas de marca (voz/ángulo/retención) se puntúan pero NO bloquean
 * — el gate frena hechos inventados, no decisiones de marca (consejero · Opción 1). */
export const DEFAULT_GATED_FIELDS = ['positioning', 'icp_summary'] as const
export const DEFAULT_FIDELITY_THRESHOLD = 0.85

/** Procedencia del grounding de la evidencia (ADR-020 M1 · #278). */
export type GroundingProvenance = 'chunk_linked' | 'prose_only'

/** Ref de evidencia (claim→chunk · #278). `prose_only` = sin chunk real detrás. */
export interface FidelityEvidenceRef {
  readonly field?: string
  readonly claim?: string
  readonly chunk_id?: string | null
  readonly grounding?: GroundingProvenance
}

export interface FidelityGradeParams {
  /** Scores de groundedness 0..1 por campo (del tool `emit_fidelity_scores`). */
  readonly scores: Record<string, unknown>
  /** Contador de ciclo de fidelidad INDEPENDIENTE (1-based · hard-cap real). */
  readonly fidelityCycle: number
  /** Loop-cap CENTRAL (de `jefatura_grading_policies.max_cycles`). */
  readonly maxCycles: number
  /** Refs claim→chunk (#278) · determinan la procedencia del grounding. */
  readonly evidenceRefs?: readonly FidelityEvidenceRef[]
  /** Trazabilidad (agent_invocations.metadata.jefatura · M1). */
  readonly traceId: string
  /** Campos que gatean · default fácticos. */
  readonly gatedFields?: readonly string[]
  /** Umbral de groundedness · default 0.85. */
  readonly threshold?: number
  /** Todos los campos puntuados (para transparencia · default = gated). */
  readonly scoredFields?: readonly string[]
}

export interface FidelityGradeResult extends JefaturaOutput {
  /** min de los campos gateados · lo que decide el pase. */
  readonly scores: JefaturaScores
  /** Campos gateados por debajo del umbral (los que bloquean). */
  readonly low_fields: readonly string[]
  /** Procedencia real de la evidencia · `prose_only` ⇒ veredicto NO sobre-vendido. */
  readonly grounding: GroundingProvenance
  /** true cuando falló Y se agotó el loop-cap (→ ESCALATE). */
  readonly exhausted: boolean
}

const clamp01 = (v: unknown): number => {
  const n = Number(v)
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0
}

/** Los 5 campos que el judge puntúa vía `emit_fidelity_scores`. */
export const FIDELITY_SCORE_FIELDS = [
  'positioning',
  'icp_summary',
  'voice_description',
  'customer_angle',
  'retention_notes',
] as const

/**
 * Normaliza la EMISIÓN de scores del judge ANTES de que el consumidor la indexe.
 *
 * Quirk de Haiku (observado en la sonda P2): el judge a veces emite `scores` como un STRING
 * pseudo-JSON con centinelas `<UNKNOWN>` en los campos que no puntúa, en vez de un objeto. Si
 * el consumidor (worker `faithfulness-judge.js:41-45` · o `grade-cimiento`→`clamp01`) indexa un
 * string, `scores[campo]` es undefined para TODOS los campos → todo se pisa a 0 → over-ESCALATE
 * de un cimiento legítimo → desperdicia la corrida pagada. Esta función recupera los scores
 * numéricos reales que el modelo SÍ emitió dentro del string.
 *
 * CONSERVADOR · nunca fabrica: solo devuelve valores que el modelo emitió como número. Un valor
 * no-numérico (`<UNKNOWN>`), no-parseable o ausente se OMITE → cae al floor-0 seguro del consumidor
 * (jamás falso-verde). Un objeto se devuelve tal cual (sin coerce). String no-recuperable → `{}`.
 */
export function normalizeFidelityScores(raw: unknown): Record<string, number> {
  let obj: Record<string, unknown> | null = null
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    obj = raw as Record<string, unknown>
  } else if (typeof raw === 'string') {
    // 1 · intento honesto de JSON.parse (string bien-formado sin centinelas).
    try {
      const parsed: unknown = JSON.parse(raw)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        obj = parsed as Record<string, unknown>
      }
    } catch {
      // string con `<UNKNOWN>` u otro token inválido → extracción tolerante por campo abajo.
    }
    // 2 · extracción tolerante · solo pares campo:número (omite `<UNKNOWN>`/no-numérico).
    if (!obj) {
      obj = {}
      for (const f of FIDELITY_SCORE_FIELDS) {
        const m = raw.match(new RegExp('"' + f + '"\\s*:\\s*"?(-?\\d+(?:\\.\\d+)?)"?'))
        if (m) obj[f] = m[1]
      }
    }
  }
  if (!obj) return {}
  // coerción final · SOLO sobreviven los valores numéricos-finito · un `<UNKNOWN>`/no-numérico
  // se OMITE (cae al floor-0 seguro del consumidor · nunca falso-verde). Nunca fabrica.
  const out: Record<string, number> = {}
  for (const [k, v] of Object.entries(obj)) {
    const n = Number(v)
    if (Number.isFinite(n)) out[k] = n
  }
  return out
}

/**
 * Normaliza el objeto emitido por el tool (`{ scores, ... }`) preservando el resto de claves ·
 * garantiza que `scores` sea siempre un objeto de números antes de surface-arlo al consumidor.
 */
export function normalizeFidelityToolInput(
  input: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { scores: {} }
  return { ...input, scores: normalizeFidelityScores((input as { scores?: unknown }).scores) }
}

/** eje de corrección por campo · factual salvo posicionamiento. */
function ejeFor(field: string): JefaturaCorrection['eje'] {
  return field === 'positioning' ? 'posicionamiento' : 'factual'
}

/**
 * Determina la procedencia del grounding a partir de los evidence_refs.
 * Regla §8 endurecimiento 2: solo es `chunk_linked` si HAY al menos una ref con un
 * chunk real vinculado; en cualquier otro caso (vacío · sin chunk) es `prose_only`
 * y el veredicto se marca PROVISIONAL (no se sobre-vende como groundedness real).
 */
export function resolveGrounding(refs?: readonly FidelityEvidenceRef[]): GroundingProvenance {
  if (!refs || refs.length === 0) return 'prose_only'
  const anyLinked = refs.some(
    (r) => r.grounding === 'chunk_linked' && typeof r.chunk_id === 'string' && r.chunk_id.length > 0,
  )
  return anyLinked ? 'chunk_linked' : 'prose_only'
}

/**
 * Califica el CIMIENTO por fidelidad y DECIDE el veredicto.
 *  - PASS      · todos los campos gateados ≥ umbral (grounding marca la procedencia).
 *  - CORRECTED · algún campo < umbral y quedan ciclos → vuelve al creador (loop).
 *  - ESCALATE  · algún campo < umbral y se agotó el cap → HITL.
 * REJECT NO aplica al cimiento (rechazar es del voto de contenido) · la fidelidad
 * corrige/escala, no "rechaza por mayoría".
 */
export function gradeFidelity(params: FidelityGradeParams): FidelityGradeResult {
  const gated = params.gatedFields ?? DEFAULT_GATED_FIELDS
  const threshold = params.threshold ?? DEFAULT_FIDELITY_THRESHOLD
  const scored = params.scoredFields ?? gated

  // Normaliza · campo sin score = 0 (no-grounded · fuerza corrección o HITL).
  const norm: Record<string, number> = {}
  for (const f of scored) norm[f] = clamp01(params.scores?.[f])
  for (const f of gated) if (!(f in norm)) norm[f] = clamp01(params.scores?.[f])

  const lowFields = gated.filter((f) => norm[f] < threshold)
  const pass = lowFields.length === 0
  const fidelity = gated.length ? Math.min(...gated.map((f) => norm[f])) : 0
  const grounding = resolveGrounding(params.evidenceRefs)
  const exhausted = !pass && params.fidelityCycle >= params.maxCycles

  let verdict: JefaturaVerdict
  if (pass) verdict = 'PASS'
  else if (exhausted) verdict = 'ESCALATE'
  else verdict = 'CORRECTED'

  // Un no-pase SIEMPRE viaja con correcciones accionables (ADR-020 §58).
  const corrections: JefaturaCorrection[] = pass
    ? []
    : lowFields.map((f) => ({
        eje: ejeFor(f),
        severidad: 'rojo',
        donde: f,
        problema: `groundedness ${norm[f].toFixed(2)} < ${threshold} · el campo no está soportado por la evidencia`,
        por_que:
          'la fidelidad exige que cada hecho del cimiento sea verificable contra la evidencia real del cliente (discovery/CEREBRO)',
        cambio_sugerido: `re-anclar "${f}" en la evidencia (competidores · ICP · summary) o quitar los claims inventados`,
      }))

  const scores: JefaturaScores = { fidelity }

  return {
    verdict,
    scores,
    corrections,
    trace_id: params.traceId,
    low_fields: lowFields,
    grounding,
    exhausted,
  }
}
