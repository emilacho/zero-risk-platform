/**
 * Tests · Camino III correcciones accionables (SPEC §2) · §144.
 */
import { describe, it, expect } from 'vitest'
import {
  validateCorrectionObject,
  validateCorrectionsForVote,
  filterValidCorrections,
  consolidateCorrections,
  type CorrectionObject,
} from '../src/lib/camino-iii/corrections'

const good: CorrectionObject = {
  eje: 'factual',
  severidad: 'red',
  donde: 'titular',
  problema: 'claim sin fuente',
  por_que: 'brand book exige fuente en claims',
  cambio_sugerido: 'citar el estudio o quitar el claim',
}

describe('validateCorrectionObject', () => {
  it('accepts a complete object', () => {
    const r = validateCorrectionObject(good)
    expect(r.ok).toBe(true)
  })
  it('rejects invalid eje', () => {
    const r = validateCorrectionObject({ ...good, eje: 'random' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toMatch(/eje/)
  })
  it('rejects invalid severidad', () => {
    const r = validateCorrectionObject({ ...good, severidad: 'green' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toMatch(/severidad/)
  })
  it('rejects empty required field', () => {
    const r = validateCorrectionObject({ ...good, cambio_sugerido: '  ' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toMatch(/cambio_sugerido/)
  })
  it('rejects non-object', () => {
    expect(validateCorrectionObject(null).ok).toBe(false)
    expect(validateCorrectionObject('x').ok).toBe(false)
  })
})

describe('filterValidCorrections · hardening leniente (no dropea el voto)', () => {
  it('descarta inválidas y conserva las válidas', () => {
    const r = filterValidCorrections([good, { ...good, cambio_sugerido: '  ' }, { ...good, eje: 'x' }])
    expect(r.valid).toHaveLength(1)
    expect(r.dropped).toBe(2)
    expect(r.valid[0].eje).toBe('factual')
  })
  it('todas inválidas → valid vacío + dropped count (el voto se conserva igual aguas arriba)', () => {
    const r = filterValidCorrections([{ ...good, cambio_sugerido: '' }, 'nope', null])
    expect(r.valid).toHaveLength(0)
    expect(r.dropped).toBe(3)
  })
  it('todas válidas → dropped 0', () => {
    const r = filterValidCorrections([good, good])
    expect(r.valid).toHaveLength(2)
    expect(r.dropped).toBe(0)
  })
  it('no-array → valid vacío · dropped 0', () => {
    expect(filterValidCorrections(undefined)).toEqual({ valid: [], dropped: 0 })
  })
})

describe('validateCorrectionsForVote · canon gate', () => {
  it('red REQUIRES at least one correction', () => {
    const r = validateCorrectionsForVote('red', [])
    expect(r.ok).toBe(false)
    expect(r.reason).toMatch(/red.*requires/i)
  })
  it('red with a valid correction passes', () => {
    const r = validateCorrectionsForVote('red', [good])
    expect(r.ok).toBe(true)
    expect(r.corrections).toHaveLength(1)
  })
  it('green with no corrections is fine', () => {
    const r = validateCorrectionsForVote('green', [])
    expect(r.ok).toBe(true)
    expect(r.corrections).toHaveLength(0)
  })
  it('amber may carry advisory corrections', () => {
    const r = validateCorrectionsForVote('amber', [{ ...good, severidad: 'amber' }])
    expect(r.ok).toBe(true)
    expect(r.corrections).toHaveLength(1)
  })
  it('a malformed correction fails the whole submission', () => {
    const r = validateCorrectionsForVote('red', [good, { ...good, problema: '' }])
    expect(r.ok).toBe(false)
    expect(r.reason).toMatch(/corrections\[1\]/)
  })
})

describe('consolidateCorrections', () => {
  it('flattens per-reviewer corrections + stamps source + is_voting', () => {
    const out = consolidateCorrections([
      { reviewer_agent: 'editor-en-jefe', is_voting: true, corrections: [good] },
      {
        reviewer_agent: 'gpt-5.5-advisor',
        is_voting: false,
        corrections: [{ ...good, eje: 'voz' }],
      },
    ])
    expect(out).toHaveLength(2)
    expect(out[0].reviewer_agent).toBe('editor-en-jefe')
    expect(out[0].is_voting).toBe(true)
    expect(out[1].reviewer_agent).toBe('gpt-5.5-advisor')
    expect(out[1].is_voting).toBe(false)
    expect(out[1].eje).toBe('voz')
  })
})
