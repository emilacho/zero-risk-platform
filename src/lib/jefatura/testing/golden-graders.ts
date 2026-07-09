/**
 * JEFATURA · harness $0 · graders GOLDEN (transcripciones mock · sin LLM · $0)
 * ============================================================================
 * Protocolo de prueba del consejero (19:37): las "bocas" LLM se mockean con transcripciones
 * golden → el flujo E2E corre casi gratis. Estas deps scripteadas alimentan `runResolution`.
 *
 * LÍMITE §148 (regla Q1/dry_run) · mock verde ≠ real verde · esto da AMPLITUD, JAMÁS cierra
 * un hito. UNA corrida real (F2.2 · Peniche) cierra + siembra estos fixtures desde traces reales.
 */
import type { JefaturaCorrection } from '../contract'
import type {
  ResolutionDeps,
  ScorerResult,
  JefeCorrectionOut,
  ReSynthResult,
} from '../resolution'
import type { JefaturaEvidenceRef } from '../observability'

/** Un guion por-ciclo de las 3 bocas. Índice = ciclo (0-based). */
export interface GoldenScenario {
  /** salida de la vara por ciclo (fidelidad/voto). */
  readonly scorer: readonly Omit<ScorerResult, 'cost_usd' | 'nominal_agent' | 'effective_model'>[]
  /** correcciones de los jefes por ciclo (flat · el driver las agrupa). */
  readonly corrections: readonly (readonly JefaturaCorrection[])[]
  /** costo golden por invocación (centavos · realista mock). */
  readonly cost?: { scorer?: number; jefe?: number; creator?: number }
}

const c = (
  eje: JefaturaCorrection['eje'],
  severidad: JefaturaCorrection['severidad'],
  donde = 'positioning',
  cambio = 'anclar al encebollado real',
): JefaturaCorrection => ({ eje, severidad, donde, problema: 'gap', por_que: 'no soportado', cambio_sugerido: cambio })

const ref = (field: string, chunk_id: string | null = null): JefaturaEvidenceRef => ({ field, chunk_id })

/** Construye deps deterministas desde un guion golden · un jefe emisor por corrección-set. */
export function goldenDeps(scenario: GoldenScenario): ResolutionDeps {
  const cost = { scorer: 0.008, jefe: 0.006, creator: 0.012, ...(scenario.cost ?? {}) }
  const at = <T>(arr: readonly T[], i: number): T => arr[Math.min(i, arr.length - 1)]

  return {
    score: (_draft, cycle): ScorerResult => ({
      ...at(scenario.scorer, cycle),
      cost_usd: cost.scorer,
      nominal_agent: 'editor-en-jefe',
      effective_model: 'claude-sonnet-4-6',
    }),
    emitCorrections: (_draft, cycle): readonly JefeCorrectionOut[] => {
      const set = at(scenario.corrections, cycle)
      // 3 jefes golden · reparten el set por eje-dueño (simplificado: uno emite todas)
      return [
        { nominal_agent: 'brand-strategist', effective_model: 'claude-sonnet-4-6', corrections: set.filter((x) => x.eje === 'posicionamiento'), cost_usd: cost.jefe },
        { nominal_agent: 'editor-en-jefe', effective_model: 'claude-sonnet-4-6', corrections: set.filter((x) => x.eje === 'factual' || x.eje === 'voz'), cost_usd: cost.jefe },
        { nominal_agent: 'jefe-client-success', effective_model: 'claude-sonnet-4-6', corrections: set.filter((x) => x.eje === 'cliente'), cost_usd: cost.jefe },
      ]
    },
    reSynth: (draft, _blocking, cycle): ReSynthResult => ({
      draft: { ...draft, _resynth_cycle: cycle + 1 },
      cost_usd: cost.creator,
    }),
  }
}

// ── biblioteca de escenarios golden (rutas felices + de falla) ────────────────

/** CIMIENTO · pasa al primer intento (fidelidad ≥0.85) · ámbar advisory no cicla. */
export const G_CIMIENTO_PASS: GoldenScenario = {
  scorer: [{ fidelity: 0.93, scores: { positioning: 0.95, icp_summary: 0.92, _aggregate: 0.93 }, evidence_refs: [ref('positioning', 'chunk-1'), ref('icp_summary', 'chunk-2')] }],
  corrections: [[c('voz', 'ambar')]],
}

/** CIMIENTO · falla, corrige (rojo factual), pasa en el ciclo 1 (cap≥2 · progreso monótono). */
export const G_CIMIENTO_CORRECT_THEN_PASS: GoldenScenario = {
  scorer: [
    { fidelity: 0.72, scores: { positioning: 0.6, icp_summary: 0.7, _aggregate: 0.72 }, evidence_refs: [ref('positioning', 'chunk-1')] },
    { fidelity: 0.9, scores: { positioning: 0.9, icp_summary: 0.9, _aggregate: 0.9 }, evidence_refs: [ref('positioning', 'chunk-1'), ref('icp_summary', 'chunk-3')] },
  ],
  corrections: [[c('factual', 'rojo')], [c('voz', 'ambar')]],
}

/** CIMIENTO · falla y el cap=1 se agota → ESCALATE a humano. */
export const G_CIMIENTO_CAP_ESCALATE: GoldenScenario = {
  scorer: [
    { fidelity: 0.6, scores: { positioning: 0.5, icp_summary: 0.6, _aggregate: 0.6 }, evidence_refs: [] },
    { fidelity: 0.62, scores: { positioning: 0.55, icp_summary: 0.62, _aggregate: 0.62 }, evidence_refs: [] },
  ],
  corrections: [[c('factual', 'rojo')], [c('factual', 'rojo')]],
}

/** CIMIENTO · re-síntesis que NO sube la fidelidad → STOP_BEST (§7.6 · cap≥2). */
export const G_CIMIENTO_MONOTONIC_STOP: GoldenScenario = {
  scorer: [
    { fidelity: 0.75, scores: { positioning: 0.7, icp_summary: 0.75, _aggregate: 0.75 }, evidence_refs: [ref('positioning', 'chunk-1')] },
    { fidelity: 0.73, scores: { positioning: 0.68, icp_summary: 0.73, _aggregate: 0.73 }, evidence_refs: [ref('positioning', 'chunk-1')] },
  ],
  corrections: [[c('factual', 'rojo')], [c('factual', 'rojo')]],
}

/** CIMIENTO · dos rojos cruzando ejes en el mismo `donde` → ESCALATE (§7.4 irreconciliable). */
export const G_CIMIENTO_IRRECONCILABLE: GoldenScenario = {
  scorer: [{ fidelity: 0.7, scores: { positioning: 0.6, _aggregate: 0.7 }, evidence_refs: [ref('positioning', 'chunk-1')] }],
  corrections: [[c('factual', 'rojo', 'hero', 'quitar claim X'), c('posicionamiento', 'rojo', 'hero', 'reforzar claim X')]],
}

/** CONTENIDO · el voto 3-de-N aprueba (≥2 verde, 0 rojo). */
export const G_CONTENIDO_VOTE_PASS: GoldenScenario = {
  scorer: [{ votePassed: true, scores: {}, voteTally: { green: 3, amber: 0, red: 0 } }],
  corrections: [[c('voz', 'ambar')]],
}
