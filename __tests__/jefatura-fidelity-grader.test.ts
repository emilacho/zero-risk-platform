/**
 * Tests · JEFATURA fidelity grader (F1.4 · ADR-020 §7).
 * Cubre: decide (no vota) · ≥0.85 · PASS/CORRECTED/ESCALATE · HITL tras cap ·
 * procedencia del grounding (prose_only NO sobre-vendido) · corrections siempre.
 */
import { describe, it, expect } from 'vitest'
import {
  gradeFidelity,
  resolveGrounding,
  DEFAULT_GATED_FIELDS,
  DEFAULT_FIDELITY_THRESHOLD,
  type FidelityGradeParams,
} from '../src/lib/jefatura/fidelity-grader'

const base = (over: Partial<FidelityGradeParams> = {}): FidelityGradeParams => ({
  scores: { positioning: 0.9, icp_summary: 0.9 },
  fidelityCycle: 1,
  maxCycles: 3,
  traceId: 'trace-1',
  ...over,
})

describe('jefatura fidelity-grader', () => {
  it('PASS cuando todos los campos gateados ≥ 0.85', () => {
    const r = gradeFidelity(base({ scores: { positioning: 0.92, icp_summary: 0.88 } }))
    expect(r.verdict).toBe('PASS')
    expect(r.low_fields).toEqual([])
    expect(r.corrections).toEqual([])
    expect(r.scores.fidelity).toBeCloseTo(0.88)
  })

  it('CORRECTED cuando un campo < umbral y quedan ciclos', () => {
    const r = gradeFidelity(base({ scores: { positioning: 0.6, icp_summary: 0.9 }, fidelityCycle: 1, maxCycles: 3 }))
    expect(r.verdict).toBe('CORRECTED')
    expect(r.exhausted).toBe(false)
    expect(r.low_fields).toEqual(['positioning'])
  })

  it('ESCALATE (HITL) cuando falla y se agotó el loop-cap', () => {
    const r = gradeFidelity(base({ scores: { positioning: 0.6, icp_summary: 0.9 }, fidelityCycle: 3, maxCycles: 3 }))
    expect(r.verdict).toBe('ESCALATE')
    expect(r.exhausted).toBe(true)
  })

  it('un no-pase SIEMPRE trae corrections accionables (ADR-020 §58)', () => {
    const r = gradeFidelity(base({ scores: { positioning: 0.5, icp_summary: 0.4 }, fidelityCycle: 3, maxCycles: 3 }))
    expect(r.verdict).toBe('ESCALATE')
    expect(r.corrections.length).toBe(2)
    for (const c of r.corrections) {
      expect(c.severidad).toBe('rojo')
      expect(c.donde).toBeTruthy()
      expect(c.cambio_sugerido).toBeTruthy()
    }
    // eje: posicionamiento para positioning · factual para icp_summary
    expect(r.corrections.find((c) => c.donde === 'positioning')?.eje).toBe('posicionamiento')
    expect(r.corrections.find((c) => c.donde === 'icp_summary')?.eje).toBe('factual')
  })

  it('campo sin score = 0 → falla (floor seguro)', () => {
    const r = gradeFidelity(base({ scores: { positioning: 0.9 } })) // falta icp_summary
    expect(r.low_fields).toContain('icp_summary')
    expect(r.verdict).not.toBe('PASS')
  })

  it('NO vota · nunca lee votos (el cimiento se decide solo por fidelidad)', () => {
    // el shape de params no admite `votes` · sólo scores de groundedness.
    const r = gradeFidelity(base())
    expect(r.scores.votes).toBeUndefined()
    expect(r.scores.fidelity).toBeDefined()
  })

  describe('procedencia del grounding (prose_only NO sobre-vendido)', () => {
    it('sin evidence_refs → prose_only', () => {
      expect(resolveGrounding(undefined)).toBe('prose_only')
      expect(resolveGrounding([])).toBe('prose_only')
      expect(gradeFidelity(base()).grounding).toBe('prose_only')
    })
    it('refs sin chunk real → prose_only', () => {
      expect(resolveGrounding([{ grounding: 'prose_only' }, { chunk_id: null, grounding: 'chunk_linked' }])).toBe('prose_only')
    })
    it('≥1 ref chunk_linked con chunk_id real → chunk_linked', () => {
      const refs = [{ field: 'positioning', chunk_id: 'ch-123', grounding: 'chunk_linked' as const }]
      expect(resolveGrounding(refs)).toBe('chunk_linked')
      expect(gradeFidelity(base({ evidenceRefs: refs })).grounding).toBe('chunk_linked')
    })
    it('PASS con prose_only sigue siendo PASS pero marca la procedencia', () => {
      const r = gradeFidelity(base())
      expect(r.verdict).toBe('PASS')
      expect(r.grounding).toBe('prose_only') // el consumidor NO debe sobre-vender esto
    })
  })

  it('umbral + gated defaults son los canónicos', () => {
    expect(DEFAULT_FIDELITY_THRESHOLD).toBe(0.85)
    expect([...DEFAULT_GATED_FIELDS]).toEqual(['positioning', 'icp_summary'])
  })
})
