/**
 * JEFATURA · driver de resolución (orquestación + convergencia · PURO · dependency-injected)
 * ==========================================================================================
 * Ata las piezas F1 en el loop de una resolución: la vara puntúa → §7 decide → (si corrige)
 * los jefes diagnostican → triage → el creador re-sintetiza → re-puntúa · hasta pass/escalate/
 * stop. Emite la traza M1 (`metadata.jefatura` + veredicto) por invocación.
 *
 * PURO · las "bocas" (scorer/jefes/creador) se inyectan como `deps` — en F2 son llamadas
 * run-sdk reales; en el harness $0 son transcripciones GOLDEN. El driver NO conoce LLMs.
 *
 * §144 STOP · no cablea nada vivo · es el seam determinista que F2 consume.
 */
import type {
  JefaturaInput,
  JefaturaGradingPolicy,
  JefaturaCorrection,
  JefaturaOutput,
  JefaturaVerdict,
} from './contract'
import { triageCorrections, decideConvergence, detectIrreconcilable, validateFidelity, type CycleState } from './correction-loop'
import {
  buildJefaturaInvocationMeta,
  buildJefaturaVerdictMeta,
  type JefaturaInvocationMeta,
  type JefaturaVerdictMeta,
  type JefaturaEvidenceRef,
  type JefaturaVerdictKind,
} from './observability'

// ── resultados de las bocas (inyectadas · golden en el harness) ──────────────
export interface ScorerResult {
  /** cimiento · groundedness agregado que decide la vara. */
  readonly fidelity?: number
  /** por-campo (cimiento) o confidence (contenido). */
  readonly scores: Record<string, number>
  readonly evidence_refs?: readonly JefaturaEvidenceRef[]
  /** contenido · resultado del voto 3-de-N (lo computa el tabulador determinista). */
  readonly votePassed?: boolean
  readonly voteTally?: { green: number; amber: number; red: number }
  readonly cost_usd: number
  readonly nominal_agent: string
  readonly effective_model: string
}
export interface JefeCorrectionOut {
  readonly nominal_agent: string
  readonly effective_model: string
  readonly corrections: readonly JefaturaCorrection[]
  readonly cost_usd: number
}
export interface ReSynthResult {
  readonly draft: Record<string, unknown>
  readonly cost_usd: number
}

export interface ResolutionDeps {
  /** la VARA · scorer de fidelidad (cimiento) o tabulador del voto (contenido). */
  readonly score: (draft: Record<string, unknown>, cycle: number) => ScorerResult
  /** los 3 jefes DIAGNOSTICAN (una entrada por jefe · rol corrector/votante). */
  readonly emitCorrections: (draft: Record<string, unknown>, cycle: number) => readonly JefeCorrectionOut[]
  /** el CREADOR integra (NO los jefes) · re-sintetiza con las bloqueantes top-N. */
  readonly reSynth: (draft: Record<string, unknown>, blocking: readonly JefaturaCorrection[], cycle: number) => ReSynthResult
}

export interface ResolutionIds {
  readonly reviewId: string
  readonly policyId: string
  readonly workflowId: string
  readonly workflowExecutionId: string
}

export interface ResolutionResult {
  readonly output: JefaturaOutput
  /** traza M1 por invocación (jefes + scorer · rol jefatura). */
  readonly invocationTraces: JefaturaInvocationMeta[]
  readonly verdictTrace: JefaturaVerdictMeta
  readonly cost_usd: number
  /** cuántos ciclos consumió (0-based · máximo observado). */
  readonly cycles_used: number
}

const VERDICT_MAP: Record<'pass' | 'escalate' | 'stop_best', JefaturaVerdict> = {
  pass: 'PASS',
  escalate: 'ESCALATE',
  stop_best: 'ESCALATE', // §7.6 · se toma la mejor versión · la decisión final la marca el humano
}
const VERDICT_KIND: Record<JefaturaVerdict, JefaturaVerdictKind> = {
  PASS: 'pass',
  REJECT: 'corrections',
  CORRECTED: 'corrections',
  ESCALATE: 'escalate',
}

/** Mensaje honesto de una boca que lanzó (H1) · el error queda EN la traza, no se pierde. */
function errMsg(err: unknown): string {
  if (err instanceof Error) return err.message || err.name || 'Error'
  return String(err)
}

export interface RunOptions {
  readonly topN?: number
  readonly gateRelevantEjes?: ReadonlySet<JefaturaCorrection['eje']>
}

/**
 * Corre una resolución completa · determinista. La VARA decide (fidelidad/voto) · los jefes
 * asesoran · el creador integra · loop-cap central · progreso monótono. Devuelve la traza M1.
 */
export function runResolution(
  input: JefaturaInput,
  policy: JefaturaGradingPolicy,
  ids: ResolutionIds,
  deps: ResolutionDeps,
  opts: RunOptions = {},
): ResolutionResult {
  const isCimiento = policy.artifact_class === 'cimiento'
  let draft: Record<string, unknown> = { ...(input.payload.draft as Record<string, unknown> | undefined) }
  let cycle = 0
  let prevFidelity: number | undefined
  let bestFidelity = -Infinity
  let bestDraft = draft
  // stop_best §7.6 · la traza reporta el score DEL bestDraft elegido, no el del último ciclo.
  let bestScores: Record<string, number> = {}
  let bestEvidence: readonly JefaturaEvidenceRef[] = []
  let totalCost = 0
  // malfunciones del driver (H1 boca lanzó · H2 score fuera de rango) · quedan EN la traza §148.
  const malfunctions: string[] = []
  const invocationTraces: JefaturaInvocationMeta[] = []

  const snapshot = {
    mecanismo: policy.canon_grader === 'fidelity' ? ('fidelity' as const) : ('vote_3_of_n' as const),
    threshold: policy.fidelity_threshold,
    max_cycles: policy.max_cycles,
  }
  const traceInvocation = (
    role: JefaturaInvocationMeta['role'],
    nominalAgent: string,
    effectiveModel: string,
  ) => {
    invocationTraces.push(
      buildJefaturaInvocationMeta({
        reviewId: ids.reviewId,
        artifactType: input.artifact_type,
        artifactId: input.artifact_id,
        clientId: input.client_id ?? '',
        journeyId: input.journey_id,
        policyId: ids.policyId,
        policySnapshot: snapshot,
        role,
        cycle,
        nominalAgent,
        effectiveModel,
        workflowId: ids.workflowId,
        workflowExecutionId: ids.workflowExecutionId,
      }),
    )
  }

  let lastScores: Record<string, number> = {}
  let lastEvidence: readonly JefaturaEvidenceRef[] = []
  let lastCorrections: readonly JefaturaCorrection[] = []
  let lastVoteTally: { green: number; amber: number; red: number } | undefined
  let verdict: JefaturaVerdict = 'ESCALATE'

  // guard duro contra loop infinito (además del cap · el harness prueba caps chicos)
  const HARD_STOP = policy.max_cycles + 2
  for (;;) {
    // 1 · la VARA puntúa · H1 · la boca va envuelta · si lanza/timeout → ESCALATE, nunca tumba.
    let s: ScorerResult
    try {
      s = deps.score(draft, cycle)
    } catch (err) {
      malfunctions.push(`boca_threw:score:${errMsg(err)}`)
      verdict = 'ESCALATE'
      break
    }
    totalCost += s.cost_usd
    traceInvocation(isCimiento ? 'fidelity_scorer' : 'votante', s.nominal_agent, s.effective_model)
    lastScores = s.scores
    lastEvidence = s.evidence_refs ?? []
    lastVoteTally = s.voteTally

    // H2 · la vara valida su propio score ANTES de decidir · fuera de [0,1]/NaN/Inf = malfunción →
    // ESCALATE, JAMÁS PASS (no se clampea la basura · solo el ruido trivial 1.0000001→1.0).
    let fidelity = s.fidelity
    if (isCimiento && typeof s.fidelity === 'number') {
      const v = validateFidelity(s.fidelity)
      if (!v.ok) {
        malfunctions.push(`score_out_of_range:${v.reason}`)
        verdict = 'ESCALATE'
        break
      }
      fidelity = v.value
      if (fidelity > bestFidelity) {
        bestFidelity = fidelity
        bestDraft = draft
        bestScores = s.scores
        bestEvidence = lastEvidence
      }
    }

    // 2 · los jefes DIAGNOSTICAN (corrección siempre encendida · advisory aun en pass) · H1 envuelto.
    let jefeOuts: readonly JefeCorrectionOut[]
    try {
      jefeOuts = deps.emitCorrections(draft, cycle)
    } catch (err) {
      malfunctions.push(`boca_threw:emitCorrections:${errMsg(err)}`)
      verdict = 'ESCALATE'
      break
    }
    const corrections = jefeOuts.flatMap((j) => j.corrections)
    lastCorrections = corrections
    for (const j of jefeOuts) {
      totalCost += j.cost_usd
      traceInvocation(isCimiento ? 'corrector' : 'votante', j.nominal_agent, j.effective_model)
    }

    // 3 · triage §7.3 + irreconciliable §7.4
    const triage = triageCorrections(corrections, {
      artifactClass: policy.artifact_class,
      topN: opts.topN,
      gateRelevantEjes: opts.gateRelevantEjes,
    })
    const irreconcilable = detectIrreconcilable(corrections).irreconcilable

    // 4 · la VARA decide (§7.5/§7.6) · con el score YA validado.
    const state: CycleState = { cycle, fidelity, votePassed: s.votePassed, prevFidelity }
    const action = decideConvergence(state, triage, policy, irreconcilable)

    if (action.action !== 'correct') {
      verdict = VERDICT_MAP[action.action]
      if (action.action === 'stop_best') {
        // §7.6 · se toma el mejor draft · la traza reporta SU score, no el del último ciclo.
        draft = bestDraft
        lastScores = bestScores
        lastEvidence = bestEvidence
      }
      break
    }
    // 5 · el CREADOR re-sintetiza (integra · no los jefes) · H1 envuelto.
    let rs: ReSynthResult
    try {
      rs = deps.reSynth(draft, triage.blocking, cycle)
    } catch (err) {
      malfunctions.push(`boca_threw:reSynth:${errMsg(err)}`)
      verdict = 'ESCALATE'
      break
    }
    totalCost += rs.cost_usd
    draft = rs.draft
    prevFidelity = fidelity
    cycle++
    if (cycle > HARD_STOP) {
      verdict = 'ESCALATE'
      break
    }
  }

  // veredicto · corrections_count ≥1 SIEMPRE (corrección es función base · advisory cuenta)
  const correctionsCount = Math.max(1, lastCorrections.length)
  const verdictTrace = buildJefaturaVerdictMeta({
    reviewId: ids.reviewId,
    artifactType: input.artifact_type,
    verdict: VERDICT_KIND[verdict],
    voteTally: lastVoteTally,
    scores: lastScores,
    correctionsCount,
    correctionsRef: null,
    evidenceRefs: [...lastEvidence],
    costUsd: totalCost,
    extraViolations: malfunctions,
  })

  const output: JefaturaOutput = {
    corrections: [...lastCorrections],
    verdict,
    scores: isCimiento
      ? { fidelity: typeof lastScores._aggregate === 'number' ? lastScores._aggregate : (Number.isFinite(bestFidelity) ? bestFidelity : 0) }
      : { votes: lastVoteTally ? { ...lastVoteTally, total: lastVoteTally.green + lastVoteTally.amber + lastVoteTally.red } : undefined },
    trace_id: ids.reviewId,
  }

  return { output, invocationTraces, verdictTrace, cost_usd: totalCost, cycles_used: cycle }
}
