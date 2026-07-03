/**
 * Tests · onboarding report LLM few-shot adaptation (endpoint stays $0 · the
 * model call runs in n8n · these test the pure prompt/parse/overlay helpers).
 */
import { describe, it, expect } from 'vitest'
import { buildReportSlides } from '../src/lib/onboarding-report'
import {
  buildAdaptationPrompt,
  parseAdaptation,
  applyAdaptation,
} from '../src/lib/onboarding-report-adaptation'

const model = buildReportSlides({
  clientName: 'Náufrago',
  reportDateISO: '2026-07-03T00:00:00Z',
  positioning: 'Náufrago es el único especialista en encebollado de Olón. Riesgo: confusión con Gualaceo.',
  icpSummary: 'SEGMENTO 1 · Viajero extranjero. SEGMENTO 2 · Turista ecuatoriano.',
  voiceDescription: '1. Sensorial. 2. Voz de local.',
  customerAngle: 'Vienen a validar su elección de destino.',
  competitors: [{ name: 'Rasimar', why: 'lidera' }],
})

describe('buildAdaptationPrompt', () => {
  it('includes client name, rules, few-shot example, and all slide texts', () => {
    const p = buildAdaptationPrompt(model)
    expect(p).toContain('Náufrago')
    expect(p).toContain('≤14 palabras')
    expect(p).toContain('EJEMPLO')
    expect(p).toContain('encebollado') // slide notes are embedded
    expect(p).toContain('"slides"') // requests JSON shape
  })
})

describe('parseAdaptation', () => {
  it('parses plain JSON', () => {
    const out = parseAdaptation('{"slides":[{"n":2,"headline":"H","bullets":["a","b"]}]}')
    expect(out).toEqual([{ n: 2, headline: 'H', bullets: ['a', 'b'] }])
  })
  it('parses ```json fenced output', () => {
    const raw = 'Aquí tenés:\n```json\n{"slides":[{"n":3,"headline":"X","bullets":["y"]}]}\n```\ngracias'
    expect(parseAdaptation(raw)).toEqual([{ n: 3, headline: 'X', bullets: ['y'] }])
  })
  it('parses JSON embedded in prose (braces slice)', () => {
    const raw = 'blah {"slides":[{"n":1,"headline":"C","bullets":["z"]}]} end'
    expect(parseAdaptation(raw)[0].headline).toBe('C')
  })
  it('returns [] on garbage / missing shape', () => {
    expect(parseAdaptation('not json')).toEqual([])
    expect(parseAdaptation('{"nope":1}')).toEqual([])
    expect(parseAdaptation('')).toEqual([])
  })
  it('drops malformed slide entries', () => {
    const out = parseAdaptation('{"slides":[{"n":2,"headline":"ok","bullets":["a"]},{"headline":"no-n"}]}')
    expect(out).toHaveLength(1)
  })
})

describe('applyAdaptation', () => {
  it('overrides headline+bullets, keeps notes + kind', () => {
    const adapted = [{ n: 2, headline: 'Punchy takeaway', bullets: ['corto uno', 'corto dos'] }]
    const out = applyAdaptation(model, adapted)
    const s2 = out.slides[1]
    expect(s2.headline).toBe('Punchy takeaway')
    expect(s2.bullets).toEqual(['corto uno', 'corto dos'])
    expect(s2.kind).toBe('positioning')
    expect(s2.notes).toBe(model.slides[1].notes) // full text preserved
  })
  it('slides not adapted keep the deterministic version', () => {
    const out = applyAdaptation(model, [{ n: 2, headline: 'H', bullets: ['x'] }])
    expect(out.slides[3]).toEqual(model.slides[3]) // competitive untouched
  })
  it('empty bullets → keep deterministic (safe fallback)', () => {
    const out = applyAdaptation(model, [{ n: 2, headline: 'H', bullets: [] }])
    expect(out.slides[1]).toEqual(model.slides[1])
  })
  it('total slide count unchanged (still 7)', () => {
    expect(applyAdaptation(model, []).slides).toHaveLength(7)
  })
})
