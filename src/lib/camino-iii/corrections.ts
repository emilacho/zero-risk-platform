/**
 * Camino III · correcciones accionables (SPEC 2026-06-27 §2) · §144 rama.
 *
 * Un voto `red` (REJECT) ya NO es terminal · debe traer al menos un objeto
 * corrección ACCIONABLE (no una vaguedad). Esto es lo que viaja de vuelta al
 * creador para que corrija SOLO esos puntos. `concerns` (preexistente) queda
 * para vaguedades legacy · `corrections` es lo estructurado.
 *
 * Regla canon · "no se acepta rojo sin al menos un objeto-corrección · un
 * rechazo sin correcciones accionables es un bug, no un voto" (SPEC §2).
 */

/** Eje del problema · contra qué dimensión del criterio choca. */
export type CorrectionAxis = 'factual' | 'voz' | 'posicionamiento' | 'cliente'

/** Severidad · alineada al color del voto (rojo bloquea · ámbar observa). */
export type CorrectionSeverity = 'red' | 'amber'

/** Un objeto-corrección accionable · SPEC §2. Todos los campos string son
 *  obligatorios y no-vacíos · una corrección vacía no enseña nada al creador. */
export interface CorrectionObject {
  readonly eje: CorrectionAxis
  readonly severidad: CorrectionSeverity
  /** Ancla a la parte de la pieza · párrafo / titular / claim. */
  readonly donde: string
  /** Qué está mal · en una frase. */
  readonly problema: string
  /** Contra qué regla del brand book / criterio choca. */
  readonly por_que: string
  /** Qué hacer para arreglarlo · la corrección concreta. */
  readonly cambio_sugerido: string
}

const VALID_AXES: ReadonlySet<string> = new Set([
  'factual',
  'voz',
  'posicionamiento',
  'cliente',
])
const VALID_SEVERITIES: ReadonlySet<string> = new Set(['red', 'amber'])

function nonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0
}

/** Validate ONE candidate correction object. Returns the typed object or a
 *  reason string explaining the first missing/invalid field. */
export function validateCorrectionObject(
  raw: unknown,
): { ok: true; value: CorrectionObject } | { ok: false; reason: string } {
  if (typeof raw !== 'object' || raw === null) {
    return { ok: false, reason: 'correction must be an object' }
  }
  const o = raw as Record<string, unknown>
  if (!VALID_AXES.has(o.eje as string)) {
    return { ok: false, reason: `eje must be one of ${[...VALID_AXES].join('|')}` }
  }
  if (!VALID_SEVERITIES.has(o.severidad as string)) {
    return { ok: false, reason: 'severidad must be red|amber' }
  }
  for (const field of ['donde', 'problema', 'por_que', 'cambio_sugerido'] as const) {
    if (!nonEmptyString(o[field])) {
      return { ok: false, reason: `${field} required · non-empty` }
    }
  }
  return {
    ok: true,
    value: {
      eje: o.eje as CorrectionAxis,
      severidad: o.severidad as CorrectionSeverity,
      donde: (o.donde as string).trim(),
      problema: (o.problema as string).trim(),
      por_que: (o.por_que as string).trim(),
      cambio_sugerido: (o.cambio_sugerido as string).trim(),
    },
  }
}

export interface ValidateCorrectionsResult {
  readonly ok: boolean
  readonly corrections: CorrectionObject[]
  readonly reason?: string
}

/**
 * Validate the corrections array a reviewer submitted with a vote.
 *
 * Canon gate · a `red` vote REQUIRES ≥1 valid correction object. `amber`/`green`
 * MAY include corrections (advisory) but are not required to. Any malformed
 * correction object fails the whole submission (a half-built correction is a
 * bug · we reject early so it never reaches the creator).
 */
export function validateCorrectionsForVote(
  vote: 'green' | 'amber' | 'red',
  rawCorrections: unknown,
): ValidateCorrectionsResult {
  const arr = Array.isArray(rawCorrections) ? rawCorrections : []
  const parsed: CorrectionObject[] = []
  for (let i = 0; i < arr.length; i++) {
    const r = validateCorrectionObject(arr[i])
    if (!r.ok) {
      return { ok: false, corrections: [], reason: `corrections[${i}] · ${r.reason}` }
    }
    parsed.push(r.value)
  }
  if (vote === 'red' && parsed.length === 0) {
    return {
      ok: false,
      corrections: [],
      reason: 'a red (REJECT) vote requires at least one actionable correction object',
    }
  }
  return { ok: true, corrections: parsed }
}

/**
 * Hardening (safety · 2026-06-29): filtrado LENIENTE de corrections. A diferencia
 * de validateCorrectionsForVote (estricto · rechaza todo el voto al primer objeto
 * inválido), esta función DESCARTA las corrections malformadas y conserva las
 * válidas. La usa el endpoint de votos para que un voto `red` NUNCA se dropee por
 * una corrección incompleta (un red dropeado = falso `approved` · el bloqueo se
 * pierde). El voto se registra siempre; las inválidas no viajan al creador.
 */
export interface FilterCorrectionsResult {
  readonly valid: CorrectionObject[]
  readonly dropped: number
}

export function filterValidCorrections(rawCorrections: unknown): FilterCorrectionsResult {
  const arr = Array.isArray(rawCorrections) ? rawCorrections : []
  const valid: CorrectionObject[] = []
  let dropped = 0
  for (const raw of arr) {
    const r = validateCorrectionObject(raw)
    if (r.ok) valid.push(r.value)
    else dropped++
  }
  return { valid, dropped }
}

/**
 * Consolidate the per-reviewer correction objects into the single package that
 * persists on `editorial_decisions.corrections` and travels to the creator.
 * Stamps each correction with its source reviewer so the creator (and audit)
 * knows who flagged what · GPT-5.5 advisor corrections are tagged too.
 */
export interface ConsolidatedCorrection extends CorrectionObject {
  readonly reviewer_agent: string
  readonly is_voting: boolean
}

export interface ReviewerCorrections {
  readonly reviewer_agent: string
  readonly is_voting: boolean
  readonly corrections: ReadonlyArray<CorrectionObject>
}

export function consolidateCorrections(
  perReviewer: ReadonlyArray<ReviewerCorrections>,
): ConsolidatedCorrection[] {
  const out: ConsolidatedCorrection[] = []
  for (const r of perReviewer) {
    for (const c of r.corrections) {
      out.push({ ...c, reviewer_agent: r.reviewer_agent, is_voting: r.is_voting })
    }
  }
  return out
}
