/**
 * JEFATURA · F1 · Lazo A generalizado + protocolo de convergencia §7
 * ==================================================================
 * Generaliza el Lazo A (corrección) como capacidad transversal del módulo (ADR-020 §3,§7).
 * Funciones PURAS y deterministas · $0 · SIN apply (no cablea ninguna invocación viva ·
 * el wiring de los jefes/creador es F2+). Construye sobre el contrato F0 (`contract.ts`).
 *
 * Principio raíz (ADR-020 §7): **una vara objetiva decide; los opinantes solo aconsejan.**
 * - Los 3 jefes DIAGNOSTICAN (emiten `JefaturaCorrection`) · el CREADOR integra (§7.4 · los
 *   jefes nunca reescriben · no-auto-calificación).
 * - Solo el ROJO relevante-al-gate itera (§7.3) · el ámbar/estilístico es advisory, no cicla.
 * - La vara (fidelidad ≥umbral / voto) decide "listo" (§7.2) · nunca "los jefes satisfechos".
 * - Progreso monótono (§7.6) + loop-cap central (§7.5).
 */

import type { JefaturaCorrection, JefaturaGradingPolicy } from './contract'

// ─── §7.4 · dueño-de-eje (cada jefe posee un eje · su corrección precede en su eje) ─────
export type JefeSlug = 'brand-strategist' | 'editor-en-jefe' | 'jefe-client-success'

export const AXIS_OWNER: Record<JefaturaCorrection['eje'], JefeSlug> = {
  posicionamiento: 'brand-strategist',
  factual: 'editor-en-jefe',
  voz: 'editor-en-jefe',
  cliente: 'jefe-client-success',
}

// ─── §7.3 · relevancia-al-gate (perilla de Emilio · default: solo groundedness/hecho) ───
// En CIMIENTO, solo los ejes que mueven la fidelidad (positioning/icp = groundedness) son
// bloqueantes · voz/cliente son estilísticos → advisory SIEMPRE, jamás ciclo. Tuneable.
export const DEFAULT_CIMIENTO_GATE_RELEVANT_EJES: ReadonlySet<JefaturaCorrection['eje']> =
  new Set(['factual', 'posicionamiento'])

export const DEFAULT_TOP_N = 5

// ─── §7.3 · triage de correcciones ──────────────────────────────────────────
export interface TriageOptions {
  /** clase del artefacto · en contenido TODO rojo es bloqueante (mueve el voto). */
  artifactClass: JefaturaGradingPolicy['artifact_class']
  /** presupuesto por pasada · solo las rojas top-N llegan al creador (default 5). */
  topN?: number
  /** override de la perilla de Emilio · ejes gate-relevant en cimiento. */
  gateRelevantEjes?: ReadonlySet<JefaturaCorrection['eje']>
}

export interface TriageResult {
  /** rojas relevantes-al-gate · top-N · las que van al creador y disparan ciclo. */
  readonly blocking: readonly JefaturaCorrection[]
  /** ámbar + rojas no-relevantes-al-gate (estilístico) + rojas fuera del top-N · advisory · NO cicla. */
  readonly advisory: readonly JefaturaCorrection[]
  /** ¿hay algo que amerite re-síntesis? (blocking no vacío). */
  readonly triggers_cycle: boolean
  /** rojas relevantes-al-gate que quedaron FUERA del top-N (§148 · no se ocultan). */
  readonly deferred_blocking_count: number
}

/**
 * §7.3 · severidad + relevancia-al-gate + top-N. El top-N FOCALIZA, NUNCA aprueba (la vara
 * re-puntúa el resultado · §7.3 aclaración consejero). Las rojas fuera del top-N NO se
 * ocultan: quedan en `deferred_blocking_count` (si son gaps reales, la vara falla igual).
 */
export function triageCorrections(
  corrections: readonly JefaturaCorrection[],
  opts: TriageOptions,
): TriageResult {
  const topN = opts.topN ?? DEFAULT_TOP_N
  const gateEjes = opts.gateRelevantEjes ?? DEFAULT_CIMIENTO_GATE_RELEVANT_EJES

  const isGateRelevant = (c: JefaturaCorrection): boolean => {
    // contenido · todo rojo mueve el voto → bloqueante. cimiento · solo ejes de groundedness.
    if (opts.artifactClass === 'contenido') return true
    return gateEjes.has(c.eje)
  }

  const reds = corrections.filter((c) => c.severidad === 'rojo')
  const ambers = corrections.filter((c) => c.severidad === 'ambar')

  const redGateRelevant = reds.filter(isGateRelevant)
  const redStylistic = reds.filter((c) => !isGateRelevant(c)) // rojo estilístico → advisory

  // orden estable por precedencia de eje (dueño-de-eje · §7.4) para el presupuesto top-N.
  const ordered = orderByAxisPrecedence(redGateRelevant)
  const blocking = ordered.slice(0, topN)
  const deferred = ordered.slice(topN)

  return {
    blocking,
    advisory: [...ambers, ...redStylistic, ...deferred],
    triggers_cycle: blocking.length > 0,
    deferred_blocking_count: deferred.length,
  }
}

// ─── §7.4 · precedencia de eje + integración del creador ─────────────────────
const AXIS_PRECEDENCE: JefaturaCorrection['eje'][] = ['factual', 'posicionamiento', 'voz', 'cliente']

/** Orden estable por precedencia de eje (groundedness primero) · determinista. */
export function orderByAxisPrecedence(
  corrections: readonly JefaturaCorrection[],
): JefaturaCorrection[] {
  return corrections
    .map((c, i) => ({ c, i }))
    .sort((a, b) => {
      const pa = AXIS_PRECEDENCE.indexOf(a.c.eje)
      const pb = AXIS_PRECEDENCE.indexOf(b.c.eje)
      return pa !== pb ? pa - pb : a.i - b.i // estable
    })
    .map((x) => x.c)
}

/**
 * §7.4 · dos rojos cruzando ejes que se contradicen en el MISMO `donde` = irreconciliable
 * (el creador no puede aplicar ambos). Salida honesta y rara → ESCALATE, no convergencia falsa.
 */
export function detectIrreconcilable(
  corrections: readonly JefaturaCorrection[],
): { irreconcilable: boolean; conflicts: Array<[JefaturaCorrection, JefaturaCorrection]> } {
  const reds = corrections.filter((c) => c.severidad === 'rojo')
  const conflicts: Array<[JefaturaCorrection, JefaturaCorrection]> = []
  for (let i = 0; i < reds.length; i++) {
    for (let j = i + 1; j < reds.length; j++) {
      const a = reds[i]
      const b = reds[j]
      if (a.eje !== b.eje && a.donde === b.donde && a.cambio_sugerido !== b.cambio_sugerido) {
        conflicts.push([a, b])
      }
    }
  }
  return { irreconcilable: conflicts.length > 0, conflicts }
}

/** Entrada estructurada para el CREADOR (integra · triage · los jefes NO reescriben). */
export interface CreatorReSynthInput {
  readonly draft: Record<string, unknown>
  /** solo las bloqueantes top-N · ordenadas por eje · el creador elige QUÉ aplica (§7.4). */
  readonly blocking_corrections: readonly JefaturaCorrection[]
  /** el creador integra · NO "aplicar todas" (sería incoherente · §7.4 triage). */
  readonly instruction: string
}

export function buildCreatorReSynthInput(
  draft: Record<string, unknown>,
  blocking: readonly JefaturaCorrection[],
): CreatorReSynthInput {
  return {
    draft,
    blocking_corrections: orderByAxisPrecedence(blocking),
    instruction:
      'Sos el CREADOR original de la pieza. Integrá SOLO las correcciones bloqueantes que ' +
      'resuelvan el gap de groundedness (triage · elegí cuáles aplicás · NO apliques todas a ' +
      'ciegas si se contradicen). Los jefes diagnostican, vos reescribís. Devolvé la pieza corregida.',
  }
}

// ─── §7.5 + §7.6 · decisión de convergencia (la vara decide, no los jefes) ────
export interface CycleState {
  /** contador 0-based (el `cycle` del namespace M1). */
  readonly cycle: number
  /** fidelidad actual de la vara (cimiento) · undefined en contenido. */
  readonly fidelity?: number
  /** ¿el voto 3-de-N aprobó? (contenido) · undefined en cimiento. */
  readonly votePassed?: boolean
  /** fidelidad del ciclo previo (para el progreso monótono §7.6). */
  readonly prevFidelity?: number
}

export type ConvergenceAction =
  | { readonly action: 'pass'; readonly reason: string }
  | { readonly action: 'correct'; readonly corrections: readonly JefaturaCorrection[]; readonly reason: string }
  | { readonly action: 'escalate'; readonly reason: string }
  | { readonly action: 'stop_best'; readonly reason: string }

/**
 * Decide la próxima acción del loop siguiendo §7. Determinista · la VARA decide:
 *  1. vara pasa → PASS (no se corrige lo que ya pasa · §7.2/§7.3 la vara es el techo).
 *  2. cap agotado → ESCALATE a humano (§7.5b · nunca a un jefe).
 *  3. irreconciliable → ESCALATE (§7.4 · salida honesta).
 *  4. sin bloqueantes accionables pero la vara falla → ESCALATE (§7.3 · gaps sin resolver → humano).
 *  5. progreso NO monótono (re-síntesis no subió la fidelidad) → STOP_BEST (§7.6).
 *  6. si no → CORRECT con las bloqueantes top-N (al creador).
 */
export function decideConvergence(
  state: CycleState,
  triage: TriageResult,
  policy: Pick<JefaturaGradingPolicy, 'artifact_class' | 'fidelity_threshold' | 'max_cycles'>,
  irreconcilable = false,
): ConvergenceAction {
  const barPassed =
    policy.artifact_class === 'cimiento'
      ? typeof state.fidelity === 'number' &&
        typeof policy.fidelity_threshold === 'number' &&
        state.fidelity >= policy.fidelity_threshold
      : state.votePassed === true

  if (barPassed) {
    return { action: 'pass', reason: 'la vara objetiva pasa · listo (no se corrige lo que ya pasa)' }
  }
  if (state.cycle >= policy.max_cycles) {
    return { action: 'escalate', reason: `cap de ciclos agotado (${policy.max_cycles}) → humano` }
  }
  if (irreconcilable) {
    return { action: 'escalate', reason: 'dos rojos cruzando ejes irreconciliables → humano (§7.4)' }
  }
  if (!triage.triggers_cycle) {
    return {
      action: 'escalate',
      reason: 'la vara falla pero no hay bloqueantes accionables → humano (§7.3)',
    }
  }
  // §7.6 · progreso monótono · una re-síntesis previa que NO subió la fidelidad → parar y tomar la mejor.
  if (
    policy.artifact_class === 'cimiento' &&
    state.cycle > 0 &&
    typeof state.fidelity === 'number' &&
    typeof state.prevFidelity === 'number' &&
    state.fidelity <= state.prevFidelity
  ) {
    return {
      action: 'stop_best',
      reason: 'progreso no-monótono · la re-síntesis no subió la fidelidad → se toma la mejor versión (§7.6)',
    }
  }
  return {
    action: 'correct',
    corrections: triage.blocking,
    reason: 'la vara falla · hay bloqueantes top-N · re-síntesis del creador (§7.3/§7.4)',
  }
}
