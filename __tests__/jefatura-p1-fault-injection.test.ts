/**
 * JEFATURA · Peldaño 1 · $0 · RESILIENCIA · inyección de falla en los seams
 * =========================================================================
 * Concern (consejero · plan de pruebas 2026-07-07 · "¿y si el LLM devuelve basura?"):
 * el driver `runResolution` es dependency-injected. Se inyecta una "boca" (scorer/jefes/
 * creador) que TIRA excepción / timeout / devuelve JSON malformado y se afirma la propiedad
 * de seguridad: DEGRADA SEGURO →
 *   - nunca AUTO-PROMUEVE ante error (jamás PASS con entrada basura),
 *   - nunca TUMBA el journey (no propaga la excepción sin control),
 *   - el default seguro es ESCALATE (HITL) · con el error EN la traza (§148).
 *
 * FLIP (ruling consejero 10-jul + consolidación 17-jul): los 2 HALLAZGOS P0 que el Peldaño 1
 * capturó como aserción de la conducta BUGGY (H1 · una boca que lanza tumba el journey · H2 ·
 * score fuera de rango auto-promueve a PASS) YA NO quedan en main como spec ("crashear es
 * correcto"). El fix vive en el driver (H1 · try/catch por boca → ESCALATE · H2 · score fuera
 * de [0,1]/NaN/Inf → ESCALATE, JAMÁS PASS, sin clamp de basura). Estas pruebas ahora afirman la
 * conducta SEGURA post-fix. Las cazó la prueba #3 del Peldaño 1 — el Peldaño hizo su trabajo.
 */
import { describe, it, expect } from 'vitest'
import { runResolution, type ResolutionDeps, type ScorerResult } from '../src/lib/jefatura/resolution'
import type { JefaturaInput, JefaturaGradingPolicy, JefaturaCorrection } from '../src/lib/jefatura/contract'

const cimientoPolicy = (max_cycles = 1): JefaturaGradingPolicy => ({
  artifact_type: 'brand_book',
  artifact_class: 'cimiento',
  correction_enabled: true,
  judgment_enabled: false,
  canon_grader: 'fidelity',
  counterweight: 'shadow_scorer',
  max_cycles,
  fidelity_threshold: 0.85,
  vote_config: null,
  is_active: true,
})
const input: JefaturaInput = {
  artifact_type: 'brand_book',
  artifact_id: 'art-1',
  client_id: 'client-peniche',
  journey_id: 'journey-1',
  payload: { draft: { positioning: 'borrador' } },
}
const ids = { reviewId: 'rev-1', policyId: 'pol-1', workflowId: 'wf-1', workflowExecutionId: 'exec-1' }

const okCorrection = (): JefaturaCorrection => ({
  eje: 'factual', severidad: 'rojo', donde: 'positioning',
  problema: 'gap', por_que: 'no soportado', cambio_sugerido: 'anclar',
})

/** Boca base sana · se sobreescribe una para inyectar la falla. */
function deps(overrides: Partial<ResolutionDeps> = {}): ResolutionDeps {
  const baseScore: ScorerResult = {
    fidelity: 0.6, scores: { positioning: 0.6, _aggregate: 0.6 }, evidence_refs: [],
    cost_usd: 0.008, nominal_agent: 'editor-en-jefe', effective_model: 'claude-sonnet-4-6',
  }
  return {
    score: () => baseScore,
    emitCorrections: () => [
      { nominal_agent: 'editor-en-jefe', effective_model: 'claude-sonnet-4-6', corrections: [okCorrection()], cost_usd: 0.006 },
    ],
    reSynth: (draft, _b, cycle) => ({ draft: { ...draft, _c: cycle }, cost_usd: 0.012 }),
    ...overrides,
  }
}
const run = (d: ResolutionDeps, max = 1) => runResolution(input, cimientoPolicy(max), ids, d, { topN: 5 })

// ─────────────────────────────────────────────────────────────────────────────
// PARTE A · propiedades de seguridad que el driver YA cumplía (JSON malformado no-lanzante)
// ─────────────────────────────────────────────────────────────────────────────
describe('resiliencia · malformado NO-lanzante → degrada SEGURO a ESCALATE (nunca PASS)', () => {
  it('scorer sin fidelity (undefined) → nunca pasa la vara → ESCALATE', () => {
    const r = run(deps({ score: () => ({ scores: {}, cost_usd: 0.008, nominal_agent: 'x', effective_model: 'm' }) }))
    expect(r.output.verdict).toBe('ESCALATE')
    expect(r.output.verdict).not.toBe('PASS')
  })

  it('scorer con fidelity NaN → malfunción de la vara → ESCALATE (no auto-promueve)', () => {
    const r = run(deps({ score: () => ({ fidelity: NaN, scores: { _aggregate: NaN }, cost_usd: 0.008, nominal_agent: 'x', effective_model: 'm' }) }))
    expect(r.output.verdict).toBe('ESCALATE')
  })

  it('scorer con scores {} vacío + fidelity baja → ESCALATE con evidencia vacía (prose_only)', () => {
    const r = run(deps({ score: () => ({ fidelity: 0.1, scores: {}, evidence_refs: [], cost_usd: 0.008, nominal_agent: 'x', effective_model: 'm' }) }))
    expect(r.output.verdict).toBe('ESCALATE')
    expect(r.verdictTrace.evidence_refs.length).toBe(0)
  })

  it('jefes que devuelven [] correcciones + vara falla → ESCALATE (§7.3 · sin bloqueantes)', () => {
    const r = run(deps({
      score: () => ({ fidelity: 0.5, scores: { _aggregate: 0.5 }, cost_usd: 0.008, nominal_agent: 'x', effective_model: 'm' }),
      emitCorrections: () => [],
    }))
    expect(r.output.verdict).toBe('ESCALATE')
  })

  it('el driver NUNCA emite PASS cuando la vara está por debajo del umbral, sea cual sea el ruido', () => {
    for (const bad of [undefined, NaN, 0, 0.849, -1]) {
      const r = run(deps({ score: () => ({ fidelity: bad as number, scores: { _aggregate: bad as number }, cost_usd: 0.008, nominal_agent: 'x', effective_model: 'm' }) }))
      expect(r.output.verdict).not.toBe('PASS')
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// PARTE B · propiedades de seguridad que el driver AHORA cumple (post-fix consejero).
// Antes se afirmaba la conducta BUGGY (verde = hecho reproducible · HALLAZGO P0). El fix del
// driver (H1 · try/catch por boca → ESCALATE · H2 · score fuera de rango → ESCALATE, jamás PASS)
// las convierte en aserciones de la conducta SEGURA. El error queda EN la traza (§148).
// ─────────────────────────────────────────────────────────────────────────────
describe('SEGURIDAD P0 · H1 · una boca que LANZA degrada a ESCALATE (nunca tumba el journey)', () => {
  it('scorer que TIRA excepción → NO propaga · verdict ESCALATE + error en la traza', () => {
    const d = deps({ score: () => { throw new Error('LLM 500 · scorer boom') } })
    const r = run(d)
    expect(r.output.verdict).toBe('ESCALATE')
    expect(r.output.verdict).not.toBe('PASS')
    expect(r.verdictTrace.contract_violations).toContainEqual(expect.stringContaining('boca_threw:score'))
    expect(r.verdictTrace.contract_violations.some((v) => v.includes('scorer boom'))).toBe(true)
  })

  it('scorer que simula TIMEOUT (lanza ETIMEDOUT) → NO propaga · verdict ESCALATE', () => {
    const d = deps({ score: () => { throw Object.assign(new Error('ETIMEDOUT'), { code: 'ETIMEDOUT' }) } })
    const r = run(d)
    expect(r.output.verdict).toBe('ESCALATE')
    expect(r.verdictTrace.contract_violations.some((v) => v.includes('ETIMEDOUT'))).toBe(true)
  })

  it('jefes (emitCorrections) que LANZAN → NO propaga · verdict ESCALATE', () => {
    const d = deps({ emitCorrections: () => { throw new Error('jefe boom') } })
    const r = run(d)
    expect(r.output.verdict).toBe('ESCALATE')
    expect(r.verdictTrace.contract_violations).toContainEqual(expect.stringContaining('boca_threw:emitCorrections'))
  })

  it('creador (reSynth) que LANZA en el ciclo de corrección → NO propaga · verdict ESCALATE', () => {
    const d = deps({ reSynth: () => { throw new Error('creador boom') } })
    // vara falla (0.6) + hay bloqueantes → entra a reSynth → lanza → se captura → ESCALATE.
    const r = run(d, 2)
    expect(r.output.verdict).toBe('ESCALATE')
    expect(r.verdictTrace.contract_violations).toContainEqual(expect.stringContaining('boca_threw:reSynth'))
  })
})

describe('SEGURIDAD P0 · H2 · score fuera de rango → ESCALATE, JAMÁS PASS (sin clamp de basura)', () => {
  it('scorer con fidelity=5 (basura fuera de [0,1]) → ESCALATE (no auto-promoción)', () => {
    const d = deps({ score: () => ({ fidelity: 5, scores: { _aggregate: 5 }, evidence_refs: [], cost_usd: 0.008, nominal_agent: 'x', effective_model: 'm' }) })
    const r = run(d)
    // 5 NO se clampa a 1 (haría PASAR basura · lo PEOR) → malfunción de la vara → ESCALATE.
    expect(r.output.verdict).toBe('ESCALATE')
    expect(r.output.verdict).not.toBe('PASS')
    expect(r.verdictTrace.contract_violations).toContainEqual(expect.stringContaining('score_out_of_range'))
  })

  it('scorer con fidelity=Infinity → ESCALATE (misma clase de falla · nunca PASS)', () => {
    const d = deps({ score: () => ({ fidelity: Infinity, scores: { _aggregate: Infinity }, cost_usd: 0.008, nominal_agent: 'x', effective_model: 'm' }) })
    const r = run(d)
    expect(r.output.verdict).toBe('ESCALATE')
    expect(r.output.verdict).not.toBe('PASS')
  })

  it('epsilon trivial · fidelity=1.0000001 (ruido de punto flotante) SÍ se clampa a 1.0 → PASS válido', () => {
    const d = deps({ score: () => ({ fidelity: 1.0000001, scores: { _aggregate: 1.0000001 }, evidence_refs: [], cost_usd: 0.008, nominal_agent: 'x', effective_model: 'm' }) })
    const r = run(d)
    expect(r.output.verdict).toBe('PASS')
  })
})
