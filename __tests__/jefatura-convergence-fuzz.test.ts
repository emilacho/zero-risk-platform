/**
 * JEFATURA · Peldaño 1 · pruebas $0 · convergencia (fuzz §7) + traza (§148)
 * ========================================================================
 * Fuzz de INVARIANTES sobre las funciones puras del Lazo A (#280-#283) + el driver de
 * resolución (#284). PRNG sembrado → determinista y reproducible (una falla se replica con
 * el mismo seed). CERO LLM · CERO prod · funciones puras + mocks golden.
 *
 * LÍMITE §148 (regla Q1/dry_run) · el fuzz da AMPLITUD sobre el espacio de estados, JAMÁS
 * cierra un hito · mock/propiedad verde ≠ real verde. UNA corrida real (F2.2 · Peniche) cierra.
 *
 * Buckets (protocolo del consejero):
 *   A  · fuzz de las 4 invariantes §7 (≥umbral nunca cicla · cimiento nunca vota · ciclos≤cap · corrections≥1)
 *   A1 · parada monótona (§7.6 · re-síntesis sin progreso → stop_best · toma la mejor)
 *   A2 · top-N FOCALIZA, no aprueba (§7.3 · las diferidas no se ocultan · sin falso-verde)
 *   A3 · severidad (§7.3 · solo el rojo relevante-al-gate cicla · ámbar/estilístico advisory)
 *   D1 · las queries §148 (#277) ENCUENTRAN la traza de la resolución
 */
import { describe, it, expect } from 'vitest'
import {
  triageCorrections,
  decideConvergence,
  detectIrreconcilable,
  DEFAULT_CIMIENTO_GATE_RELEVANT_EJES,
  type CycleState,
  type TriageResult,
} from '../src/lib/jefatura/correction-loop'
import { runResolution, type ResolutionResult, type ResolutionDeps, type ScorerResult } from '../src/lib/jefatura/resolution'
import type { JefaturaCorrection, JefaturaGradingPolicy, JefaturaInput } from '../src/lib/jefatura/contract'
import type { JefaturaInvocationMeta, JefaturaVerdictMeta, JefaturaEvidenceRef } from '../src/lib/jefatura/observability'

// ─── PRNG sembrado (mulberry32) · determinista · sin Math.random ─────────────
function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const pick = <T>(r: () => number, xs: readonly T[]): T => xs[Math.floor(r() * xs.length)]
const range = (r: () => number, lo: number, hi: number): number => lo + Math.floor(r() * (hi - lo + 1))

const EJES: JefaturaCorrection['eje'][] = ['factual', 'voz', 'posicionamiento', 'cliente']
const SEVS: JefaturaCorrection['severidad'][] = ['rojo', 'ambar']
const THRESHOLD = 0.85

const corr = (
  r: () => number,
  eje = pick(r, EJES),
  severidad = pick(r, SEVS),
  donde = `d${range(r, 0, 3)}`,
  cambio = `cambio-${range(r, 0, 99)}`,
): JefaturaCorrection => ({ eje, severidad, donde, problema: 'gap', por_que: 'no soportado', cambio_sugerido: cambio })

const ref = (field: string, chunk_id: string | null = null): JefaturaEvidenceRef => ({ field, chunk_id })

// ─── deps golden parametrizadas por guiones aleatorios (mismo molde que golden-graders) ──
interface FuzzScript {
  readonly fidelity: readonly number[]
  readonly corrections: readonly (readonly JefaturaCorrection[])[]
}
function fuzzDeps(script: FuzzScript): ResolutionDeps {
  const at = <T>(arr: readonly T[], i: number): T => arr[Math.min(i, arr.length - 1)]
  return {
    score: (_d, cycle): ScorerResult => {
      const f = at(script.fidelity, cycle)
      return {
        fidelity: f,
        scores: { positioning: f, _aggregate: f },
        evidence_refs: f >= THRESHOLD ? [ref('positioning', 'chunk-1')] : [],
        cost_usd: 0.008,
        nominal_agent: 'editor-en-jefe',
        effective_model: 'claude-sonnet-4-6',
      }
    },
    emitCorrections: (_d, cycle) => {
      const set = at(script.corrections, cycle)
      return [
        { nominal_agent: 'brand-strategist', effective_model: 'claude-sonnet-4-6', corrections: set.filter((x) => x.eje === 'posicionamiento'), cost_usd: 0.006 },
        { nominal_agent: 'editor-en-jefe', effective_model: 'claude-sonnet-4-6', corrections: set.filter((x) => x.eje === 'factual' || x.eje === 'voz'), cost_usd: 0.006 },
        { nominal_agent: 'jefe-client-success', effective_model: 'claude-sonnet-4-6', corrections: set.filter((x) => x.eje === 'cliente'), cost_usd: 0.006 },
      ]
    },
    reSynth: (draft, _b, cycle) => ({ draft: { ...draft, _c: cycle + 1 }, cost_usd: 0.012 }),
  }
}

const cimientoPolicy = (max_cycles: number): JefaturaGradingPolicy => ({
  artifact_type: 'brand_book',
  artifact_class: 'cimiento',
  correction_enabled: true,
  judgment_enabled: false,
  canon_grader: 'fidelity',
  counterweight: 'shadow_scorer',
  max_cycles,
  fidelity_threshold: THRESHOLD,
  vote_config: null,
  is_active: true,
})
const contenidoPolicy = (max_cycles = 1): JefaturaGradingPolicy => ({
  artifact_type: 'ad_creative',
  artifact_class: 'contenido',
  correction_enabled: true,
  judgment_enabled: true,
  canon_grader: 'vote_3_of_n',
  counterweight: 'gpt55_non_voting',
  max_cycles,
  fidelity_threshold: null,
  vote_config: { expected_votes: 3, approve: 2 },
  is_active: true,
})
const input = (artifact_type: string): JefaturaInput => ({
  artifact_type,
  artifact_id: 'art-fuzz',
  client_id: 'client-peniche',
  journey_id: 'journey-1',
  payload: { draft: { positioning: 'borrador' } },
})
const ids = (reviewId = 'rev-fuzz') => ({ reviewId, policyId: 'pol-1', workflowId: 'wf-fuzz', workflowExecutionId: 'exec-fuzz' })

// ═══════════════════════════════════════════════════════════════════════════
// A · FUZZ de las 4 invariantes §7 (200 casos aleatorios · driver end-to-end)
// ═══════════════════════════════════════════════════════════════════════════
describe('A · fuzz invariantes §7 (driver de resolución · 200 casos)', () => {
  it('las 4 invariantes se sostienen en TODO estado alcanzable', () => {
    const r = rng(0xA11CE)
    for (let n = 0; n < 200; n++) {
      const isCimiento = r() < 0.75 // sesgo a cimiento (donde vive el ciclo)
      const cap = range(r, 1, 4)
      const nSteps = range(r, 1, 5)
      const fidelity = Array.from({ length: nSteps }, () => +(0.4 + r() * 0.59).toFixed(3))
      const corrections = Array.from({ length: nSteps }, () =>
        Array.from({ length: range(r, 0, 6) }, () => corr(r)),
      )
      // en contenido el scorer decide por voto, no por fidelidad
      const script: FuzzScript = isCimiento
        ? { fidelity, corrections }
        : { fidelity: fidelity.map(() => NaN), corrections }
      const deps = isCimiento
        ? fuzzDeps(script)
        : contenidoDeps(script, r() < 0.5)
      const policy = isCimiento ? cimientoPolicy(cap) : contenidoPolicy(cap)
      const res = runResolution(input(isCimiento ? 'brand_book' : 'ad_creative'), policy, ids(`rev-${n}`), deps, { topN: range(r, 1, 6) })

      // (3) ciclos ≤ cap · nunca se dispara la violación de loop-cap central
      expect(res.cycles_used).toBeLessThanOrEqual(cap)
      const maxCycleSeen = Math.max(...res.invocationTraces.map((t) => t.cycle))
      expect(maxCycleSeen).toBeLessThanOrEqual(cap)
      for (const t of res.invocationTraces) expect(t.contract_violations).not.toContain('cycle_exceeds_max_cycles')

      // (4) corrections_count ≥ 1 SIEMPRE (la Jefatura corrige siempre)
      expect(res.verdictTrace.corrections_count).toBeGreaterThanOrEqual(1)

      if (isCimiento) {
        // (2) el cimiento NUNCA recibe un voto (no-circularidad §4)
        expect(res.invocationTraces.some((t) => t.role === 'votante')).toBe(false)
        expect(res.invocationTraces.some((t) => t.role === 'fidelity_scorer')).toBe(true)
        expect(res.verdictTrace.vote_tally).toBeUndefined()
        // (1) ≥umbral en el primer intento nunca cicla → PASS en 0 ciclos
        if (fidelity[0] >= THRESHOLD) {
          expect(res.cycles_used).toBe(0)
          expect(res.output.verdict).toBe('PASS')
        }
      } else {
        // contenido SÍ vota · nunca corre el scorer de fidelidad
        expect(res.invocationTraces.some((t) => t.role === 'votante')).toBe(true)
        expect(res.invocationTraces.some((t) => t.role === 'fidelity_scorer')).toBe(false)
      }
    }
  })

  it('decideConvergence · fuzz puro (500 casos) · contrato de la vara', () => {
    const r = rng(0xBEEF)
    for (let n = 0; n < 500; n++) {
      const isCimiento = r() < 0.6
      const cap = range(r, 1, 4)
      const cycle = range(r, 0, cap + 1)
      const fidelity = +(0.4 + r() * 0.59).toFixed(3)
      const prevFidelity = r() < 0.5 ? +(0.4 + r() * 0.59).toFixed(3) : undefined
      const votePassed = r() < 0.5
      const state: CycleState = isCimiento ? { cycle, fidelity, prevFidelity } : { cycle, votePassed }
      const triage: TriageResult = {
        blocking: r() < 0.6 ? [corr(r, 'factual', 'rojo')] : [],
        advisory: [],
        triggers_cycle: false, // se recalcula abajo
        deferred_blocking_count: 0,
      }
      const t2: TriageResult = { ...triage, triggers_cycle: triage.blocking.length > 0 }
      const irrec = r() < 0.15
      const policy = { artifact_class: (isCimiento ? 'cimiento' : 'contenido') as JefaturaGradingPolicy['artifact_class'], fidelity_threshold: isCimiento ? THRESHOLD : null, max_cycles: cap }
      const a = decideConvergence(state, t2, policy, irrec)

      expect(['pass', 'correct', 'escalate', 'stop_best']).toContain(a.action)
      const barPassed = isCimiento ? fidelity >= THRESHOLD : votePassed === true
      // la vara es el techo · si pasa, SIEMPRE pass (no se corrige lo que ya pasa)
      if (barPassed) expect(a.action).toBe('pass')
      // 'correct' solo bajo TODAS las precondiciones (bar falla · dentro de cap · accionable · no irrec · con progreso)
      if (a.action === 'correct') {
        expect(barPassed).toBe(false)
        expect(cycle).toBeLessThan(cap)
        expect(irrec).toBe(false)
        expect(t2.triggers_cycle).toBe(true)
        expect(a.corrections).toBe(t2.blocking)
      }
      // stop_best solo en cimiento con cap>1 y regresión monótona
      if (a.action === 'stop_best') {
        expect(isCimiento).toBe(true)
        expect(cycle).toBeGreaterThan(0)
        expect(typeof prevFidelity).toBe('number')
        expect(fidelity).toBeLessThanOrEqual(prevFidelity as number)
      }
    }
  })
})

// deps de contenido (voto) parametrizadas
function contenidoDeps(script: FuzzScript, votePasses: boolean): ResolutionDeps {
  const at = <T>(arr: readonly T[], i: number): T => arr[Math.min(i, arr.length - 1)]
  const tally = votePasses ? { green: 3, amber: 0, red: 0 } : { green: 0, amber: 1, red: 2 }
  return {
    score: (): ScorerResult => ({
      votePassed: votePasses,
      voteTally: tally,
      scores: {},
      cost_usd: 0.008,
      nominal_agent: 'creativo',
      effective_model: 'claude-sonnet-4-6',
    }),
    emitCorrections: (_d, cycle) => {
      const set = at(script.corrections, cycle)
      return [
        { nominal_agent: 'v1', effective_model: 'claude-sonnet-4-6', corrections: set.filter((x) => x.eje === 'posicionamiento'), cost_usd: 0.006 },
        { nominal_agent: 'v2', effective_model: 'claude-sonnet-4-6', corrections: set.filter((x) => x.eje === 'factual' || x.eje === 'voz'), cost_usd: 0.006 },
        { nominal_agent: 'v3', effective_model: 'claude-sonnet-4-6', corrections: set.filter((x) => x.eje === 'cliente'), cost_usd: 0.006 },
      ]
    },
    reSynth: (draft, _b, cycle) => ({ draft: { ...draft, _c: cycle + 1 }, cost_usd: 0.012 }),
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// A1 · parada monótona §7.6 (re-síntesis sin progreso → stop_best · toma la mejor)
// ═══════════════════════════════════════════════════════════════════════════
describe('A1 · parada monótona §7.6 (100 casos · fidelidad no-creciente bajo umbral)', () => {
  it('re-síntesis que no sube la fidelidad para temprano y devuelve la MEJOR versión', () => {
    const r = rng(0x5109)
    for (let n = 0; n < 100; n++) {
      const cap = range(r, 2, 5) // §7.6 solo es relevante con cap>1
      // secuencia estrictamente NO-creciente y siempre bajo umbral (sin progreso real)
      const f0 = +(0.6 + r() * 0.2).toFixed(3) // 0.60..0.80
      const fidelity = [f0]
      for (let k = 1; k < cap + 1; k++) fidelity.push(+(fidelity[k - 1] - r() * 0.05).toFixed(3))
      const corrections = fidelity.map(() => [corr(r, 'factual', 'rojo')])
      const res = runResolution(input('brand_book'), cimientoPolicy(cap), ids(`rev-mono-${n}`), fuzzDeps({ fidelity, corrections }), { topN: 5 })

      // para a más tardar en el ciclo 1 (la 1ra re-síntesis ya no progresó) · NUNCA gasta el cap entero
      expect(res.cycles_used).toBe(1)
      expect(res.cycles_used).toBeLessThan(cap)
      expect(res.output.verdict).toBe('ESCALATE') // stop_best se reporta como ESCALATE (lo cierra el humano)
      // sin progreso · la fidelidad reportada JAMÁS cruza el umbral (nunca falso-verde)
      expect(res.output.scores.fidelity as number).toBeLessThan(THRESHOLD)
      // NOTA-hallazgo (§144 · reportar, no arreglar): stop_best fija draft=bestDraft (la mejor versión)
      // pero reporta scores.fidelity = _aggregate del ÚLTIMO ciclo (el peor de una secuencia decreciente).
      // Es conservador (sub-reporta · no infla) → no es falso-verde · queda como quirk de reporte a revisar en F2.
      expect(res.output.scores.fidelity as number).toBeCloseTo(fidelity[1], 5)
    }
  })

  it('CON progreso monótono real la re-síntesis NO para en falso (converge a PASS)', () => {
    const r = rng(0x600D)
    for (let n = 0; n < 60; n++) {
      const cap = range(r, 2, 4)
      // sube y cruza el umbral en el último paso
      const fidelity = [0.6, 0.72, 0.88, 0.9].slice(0, cap + 1)
      const corrections = fidelity.map((f) => (f >= THRESHOLD ? [corr(r, 'voz', 'ambar')] : [corr(r, 'factual', 'rojo')]))
      const res = runResolution(input('brand_book'), cimientoPolicy(cap), ids(`rev-prog-${n}`), fuzzDeps({ fidelity, corrections }), { topN: 5 })
      expect(res.output.verdict).toBe('PASS')
      expect(res.cycles_used).toBeGreaterThan(0)
    }
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// A2 · top-N FOCALIZA, no aprueba §7.3 (las diferidas no se ocultan · sin falso-verde)
// ═══════════════════════════════════════════════════════════════════════════
describe('A2 · top-N no falso-verde §7.3 (200 casos)', () => {
  it('triage: blocking ≤ topN · nada se pierde (blocking+advisory = total) · diferidas contadas', () => {
    const rr = rng(0x70F0)
    for (let n = 0; n < 200; n++) {
      const topN = range(rr, 1, 5)
      const nReds = range(rr, topN + 1, topN + 6) // SIEMPRE más rojas gate-relevant que el presupuesto
      const reds = Array.from({ length: nReds }, () => corr(rr, pick(rr, ['factual', 'posicionamiento'] as const), 'rojo'))
      const ambers = Array.from({ length: range(rr, 0, 4) }, () => corr(rr, pick(rr, EJES), 'ambar'))
      const all = [...reds, ...ambers]
      const t = triageCorrections(all, { artifactClass: 'cimiento', topN, gateRelevantEjes: DEFAULT_CIMIENTO_GATE_RELEVANT_EJES })

      // el presupuesto FOCALIZA · nunca supera topN
      expect(t.blocking.length).toBeLessThanOrEqual(topN)
      expect(t.blocking.length).toBe(topN)
      // las diferidas NO se ocultan · quedan contadas (§148)
      expect(t.deferred_blocking_count).toBe(nReds - topN)
      // NADA se pierde · todo termina en blocking o advisory
      expect(t.blocking.length + t.advisory.length).toBe(all.length)
      // toda blocking es rojo relevante-al-gate
      for (const b of t.blocking) {
        expect(b.severidad).toBe('rojo')
        expect(DEFAULT_CIMIENTO_GATE_RELEVANT_EJES.has(b.eje)).toBe(true)
      }
    }
  })

  it('driver: truncar a topN NUNCA produce un PASS falso mientras la vara falla', () => {
    const r = rng(0x7A2F)
    for (let n = 0; n < 100; n++) {
      const cap = range(r, 1, 3)
      const topN = range(r, 1, 3)
      const nReds = topN + range(r, 2, 5)
      // fidelidad SIEMPRE bajo umbral · muchas rojas gate-relevant diferidas
      const fidelity = Array.from({ length: cap + 1 }, () => +(0.5 + r() * 0.25).toFixed(3))
      const corrections = fidelity.map(() =>
        Array.from({ length: nReds }, () => corr(r, pick(r, ['factual', 'posicionamiento'] as const), 'rojo')),
      )
      const res = runResolution(input('brand_book'), cimientoPolicy(cap), ids(`rev-topn-${n}`), fuzzDeps({ fidelity, corrections }), { topN })
      // la vara falla en todos los ciclos → JAMÁS PASS (el top-N no aprobó nada)
      expect(res.output.verdict).not.toBe('PASS')
      expect(res.output.verdict).toBe('ESCALATE')
    }
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// A3 · severidad §7.3 (solo el rojo relevante-al-gate cicla · ámbar/estilístico advisory)
// ═══════════════════════════════════════════════════════════════════════════
describe('A3 · severidad §7.3 (300 casos · mezclas rojo/ámbar/ejes)', () => {
  it('cimiento: ámbar y rojo-estilístico NUNCA bloquean · solo groundedness cicla', () => {
    const r = rng(0x53E7)
    for (let n = 0; n < 300; n++) {
      const all = Array.from({ length: range(r, 0, 8) }, () => corr(r))
      const t = triageCorrections(all, { artifactClass: 'cimiento', gateRelevantEjes: DEFAULT_CIMIENTO_GATE_RELEVANT_EJES })

      // ningún ámbar es bloqueante
      expect(t.blocking.every((b) => b.severidad === 'rojo')).toBe(true)
      // ningún eje estilístico (voz/cliente) es bloqueante en cimiento
      expect(t.blocking.every((b) => DEFAULT_CIMIENTO_GATE_RELEVANT_EJES.has(b.eje))).toBe(true)
      // todo ámbar cae en advisory
      const ambers = all.filter((x) => x.severidad === 'ambar')
      for (const am of ambers) expect(t.advisory).toContain(am)
      // triggers_cycle ⇔ hay al menos un rojo gate-relevant
      const hasGateRed = all.some((x) => x.severidad === 'rojo' && DEFAULT_CIMIENTO_GATE_RELEVANT_EJES.has(x.eje))
      expect(t.triggers_cycle).toBe(hasGateRed)
    }
  })

  it('cimiento: SOLO ámbar (o solo estilístico) con vara fallando → ESCALATE, no correct', () => {
    const r = rng(0xA3B7)
    for (let n = 0; n < 80; n++) {
      const onlyAdvisory = [
        ...Array.from({ length: range(r, 1, 4) }, () => corr(r, pick(r, EJES), 'ambar')),
        ...Array.from({ length: range(r, 0, 3) }, () => corr(r, pick(r, ['voz', 'cliente'] as const), 'rojo')),
      ]
      const t = triageCorrections(onlyAdvisory, { artifactClass: 'cimiento' })
      expect(t.triggers_cycle).toBe(false)
      const state: CycleState = { cycle: 0, fidelity: 0.6 }
      const a = decideConvergence(state, t, { artifact_class: 'cimiento', fidelity_threshold: THRESHOLD, max_cycles: 2 }, false)
      expect(a.action).toBe('escalate') // gaps sin bloqueantes accionables → humano (§7.3)
    }
  })

  it('contenido: TODO rojo mueve el voto → bloqueante (no hay perilla de gate)', () => {
    const r = rng(0xC077)
    for (let n = 0; n < 80; n++) {
      const reds = Array.from({ length: range(r, 1, 5) }, () => corr(r, pick(r, EJES), 'rojo'))
      const t = triageCorrections(reds, { artifactClass: 'contenido', topN: 99 })
      expect(t.blocking.length).toBe(reds.length) // ninguna rojo es estilística en contenido
      expect(t.triggers_cycle).toBe(true)
    }
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// D1 · las queries §148 (#277) ENCUENTRAN la traza de la resolución
// ═══════════════════════════════════════════════════════════════════════════
// Espejos JS FIELES de la semántica SQL de queries.ts sobre filas agent_invocations en memoria.
interface AgentInvocationRow {
  cost_usd: number
  created_at: string
  metadata: { jefatura?: JefaturaInvocationMeta; jefatura_verdict?: JefaturaVerdictMeta }
}
const COST_BY_ROLE: Record<string, number> = { fidelity_scorer: 0.008, votante: 0.008, corrector: 0.006, shadow: 0, non_voting: 0 }

/** Mapea el resultado del driver a filas agent_invocations (el veredicto va en la decisora · la última). */
function toRows(res: ResolutionResult, base = '2026-07-08T00:00:00.000Z'): AgentInvocationRow[] {
  const baseMs = Date.parse(base)
  return res.invocationTraces.map((t, i) => ({
    cost_usd: COST_BY_ROLE[t.role] ?? 0,
    created_at: new Date(baseMs + i * 1000).toISOString(),
    metadata: {
      jefatura: t,
      ...(i === res.invocationTraces.length - 1 ? { jefatura_verdict: res.verdictTrace } : {}),
    },
  }))
}

// espejo Q1 · resolutions_by_type (distinct review_id por artifact_type · filtra client + período)
function qResolutionsByType(rows: AgentInvocationRow[], clientId: string, from: string, to: string) {
  const byType = new Map<string, Set<string>>()
  for (const row of rows) {
    const j = row.metadata.jefatura
    if (!j || j.client_id !== clientId) continue
    if (!(row.created_at >= from && row.created_at < to)) continue
    if (!byType.has(j.artifact_type)) byType.set(j.artifact_type, new Set())
    byType.get(j.artifact_type)!.add(j.review_id)
  }
  return [...byType.entries()].map(([artifact_type, ids]) => ({ artifact_type, resolutions: ids.size }))
}
// espejo Q2 · evidence_refs_coverage (sobre filas con veredicto)
function qEvidenceCoverage(rows: AgentInvocationRow[]) {
  const verdicts = rows.map((r) => r.metadata.jefatura_verdict).filter((v): v is JefaturaVerdictMeta => !!v)
  const n = verdicts.length
  if (n === 0) return { verdicts: 0, pct_non_empty: 0, pct_chunk_linked: 0 }
  return {
    verdicts: n,
    pct_non_empty: (100 * verdicts.filter((v) => v.evidence_refs.length > 0).length) / n,
    pct_chunk_linked: (100 * verdicts.filter((v) => v.grounding === 'chunk_linked').length) / n,
  }
}
// espejo Q4 · cost_per_resolution (suma cost_usd por review_id · vs cap)
function qCostPerResolution(rows: AgentInvocationRow[], capUsd: number) {
  const sums = new Map<string, number>()
  for (const row of rows) {
    const j = row.metadata.jefatura
    if (!j) continue
    sums.set(j.review_id, (sums.get(j.review_id) ?? 0) + row.cost_usd)
  }
  return [...sums.entries()].map(([review_id, cost_sum]) => ({ review_id, cost_sum, over_cap: cost_sum > capUsd }))
}
// espejo Q5 · cycles_vs_cap (max cycle por review_id vs max_cycles)
function qCyclesVsCap(rows: AgentInvocationRow[]) {
  const byId = new Map<string, { cycles: number; cap: number }>()
  for (const row of rows) {
    const j = row.metadata.jefatura
    if (!j) continue
    const cur = byId.get(j.review_id) ?? { cycles: 0, cap: j.policy_snapshot.max_cycles }
    byId.set(j.review_id, { cycles: Math.max(cur.cycles, j.cycle), cap: j.policy_snapshot.max_cycles })
  }
  return [...byId.entries()].map(([review_id, v]) => ({ review_id, cycles_used: v.cycles, max_cycles: v.cap, over_cap: v.cycles > v.cap }))
}
// espejo Q6 · contract_violations (invocación o veredicto con violaciones)
function qContractViolations(rows: AgentInvocationRow[]) {
  return rows
    .filter((r) => (r.metadata.jefatura?.contract_violations.length ?? 0) > 0 || (r.metadata.jefatura_verdict?.contract_violations.length ?? 0) > 0)
    .map((r) => ({ review_id: r.metadata.jefatura?.review_id, violations: [...(r.metadata.jefatura?.contract_violations ?? []), ...(r.metadata.jefatura_verdict?.contract_violations ?? [])] }))
}

describe('D1 · las queries §148 ENCUENTRAN la traza (espejos JS fieles a queries.ts)', () => {
  const runPass = () =>
    runResolution(input('brand_book'), cimientoPolicy(1), ids('rev-D1-pass'), fuzzDeps({ fidelity: [0.93], corrections: [[corr(rng(1), 'voz', 'ambar')]] }))
  const runEscalate = () =>
    runResolution(input('brand_book'), cimientoPolicy(1), ids('rev-D1-esc'), fuzzDeps({ fidelity: [0.6, 0.62], corrections: [[corr(rng(2), 'factual', 'rojo')], [corr(rng(3), 'factual', 'rojo')]] }))
  const WINDOW = { from: '2026-07-07T00:00:00.000Z', to: '2026-07-09T00:00:00.000Z' }

  it('Q1 resolutions_by_type · encuentra la resolución por cliente + período', () => {
    const rows = toRows(runPass())
    const found = qResolutionsByType(rows, 'client-peniche', WINDOW.from, WINDOW.to)
    expect(found).toEqual([{ artifact_type: 'brand_book', resolutions: 1 }])
    // discrimina · otro cliente NO la encuentra
    expect(qResolutionsByType(rows, 'client-otro', WINDOW.from, WINDOW.to)).toEqual([])
    // discrimina · fuera de ventana NO la encuentra
    expect(qResolutionsByType(rows, 'client-peniche', '2026-01-01T00:00:00.000Z', '2026-01-02T00:00:00.000Z')).toEqual([])
  })

  it('Q2 evidence_refs_coverage · encuentra el veredicto y refleja el grounding real', () => {
    const cov = qEvidenceCoverage(toRows(runPass()))
    expect(cov.verdicts).toBe(1)
    expect(cov.pct_non_empty).toBe(100)
    expect(cov.pct_chunk_linked).toBe(100) // G_PASS trae chunk_id real
  })

  it('Q4 cost_per_resolution · encuentra el review_id y suma > 0 · over_cap discrimina', () => {
    const rows = toRows(runPass())
    const cheap = qCostPerResolution(rows, 100)
    expect(cheap.find((x) => x.review_id === 'rev-D1-pass')?.cost_sum).toBeGreaterThan(0)
    expect(cheap[0].over_cap).toBe(false)
    // cap ínfimo → la MISMA traza se marca over_cap (la query la encuentra igual)
    expect(qCostPerResolution(rows, 0.0001)[0].over_cap).toBe(true)
  })

  it('Q5 cycles_vs_cap · encuentra la resolución y el cycle observado ≤ cap', () => {
    const rows = toRows(runPass())
    const [row] = qCyclesVsCap(rows)
    expect(row.review_id).toBe('rev-D1-pass')
    expect(row.cycles_used).toBe(0)
    expect(row.over_cap).toBe(false)
  })

  it('Q6 contract_violations · ENCUENTRA el cimiento prose_only · limpio NO aparece', () => {
    const esc = qContractViolations(toRows(runEscalate())) // evidence vacío → prose_only
    expect(esc.some((v) => v.review_id === 'rev-D1-esc' && v.violations.includes('cimiento_prose_only'))).toBe(true)
    const pass = qContractViolations(toRows(runPass())) // chunk_linked · sin violaciones
    expect(pass).toEqual([])
  })

  it('límite de amplitud · sin invocación shadow en el golden, Q3 (judge_shadow_agreement) queda VACÍA (honesto · lo siembra F2.2 real)', () => {
    const rows = toRows(runPass())
    const shadowRows = rows.filter((r) => r.metadata.jefatura?.role === 'shadow')
    expect(shadowRows).toEqual([]) // el golden no emite sombra · la query real la halla cuando exista
  })
})
