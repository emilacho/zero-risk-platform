/**
 * Tests · onboarding report LLM few-shot adaptation · PER-SLIDE (endpoint $0 ·
 * the model calls run in n8n · these test the pure prompt/parse/overlay).
 */
import { describe, it, expect } from 'vitest'
import { buildReportSlides } from '../src/lib/onboarding-report'
import {
  buildAdaptationTasks,
  buildSlideAdaptationPrompt,
  parseSlideAdaptation,
  applyAdaptation,
  ADAPTABLE_KINDS,
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

describe('buildAdaptationTasks', () => {
  it('one short prompt per content slide (5) · skips cover + next_steps', () => {
    const tasks = buildAdaptationTasks(model)
    expect(tasks.map((t) => t.kind).sort()).toEqual([...ADAPTABLE_KINDS].sort())
    expect(tasks.every((t) => t.n >= 2 && t.n <= 6)).toBe(true)
  })
  it('each prompt is well under the run-sdk 8000-char limit', () => {
    for (const t of buildAdaptationTasks(model)) expect(t.prompt.length).toBeLessThan(8000)
  })
  it('prompt carries the field text + few-shot + JSON shape', () => {
    const p = buildSlideAdaptationPrompt(model.slides[1], 'Náufrago')
    expect(p).toContain('encebollado')
    expect(p).toContain('EJEMPLOS')
    expect(p).toContain('"headline"')
  })
})

describe('parseSlideAdaptation', () => {
  it('parses plain JSON', () => {
    expect(parseSlideAdaptation('{"headline":"H","bullets":["a","b"]}')).toEqual({
      headline: 'H',
      bullets: ['a', 'b'],
    })
  })
  it('parses ```json fences', () => {
    expect(parseSlideAdaptation('ok:\n```json\n{"headline":"X","bullets":["y"]}\n```')).toEqual({
      headline: 'X',
      bullets: ['y'],
    })
  })
  it('parses JSON embedded in prose', () => {
    expect(parseSlideAdaptation('blah {"headline":"C","bullets":["z"]} end')?.headline).toBe('C')
  })
  it('null on garbage / empty bullets / missing shape', () => {
    expect(parseSlideAdaptation('not json')).toBeNull()
    expect(parseSlideAdaptation('{"headline":"H","bullets":[]}')).toBeNull()
    expect(parseSlideAdaptation('{"nope":1}')).toBeNull()
  })
})

describe('applyAdaptation', () => {
  it('overrides headline+bullets, keeps notes + kind', () => {
    const out = applyAdaptation(model, [{ n: 2, headline: 'Punchy', bullets: ['uno', 'dos'] }])
    const s2 = out.slides[1]
    expect(s2.headline).toBe('Punchy')
    expect(s2.bullets).toEqual(['uno', 'dos'])
    expect(s2.kind).toBe('positioning')
    expect(s2.notes).toBe(model.slides[1].notes)
  })
  it('non-adapted slides keep deterministic version', () => {
    const out = applyAdaptation(model, [{ n: 2, headline: 'H', bullets: ['x'] }])
    expect(out.slides[3]).toEqual(model.slides[3])
  })
  it('empty adaptation → deterministic, still 7 slides', () => {
    expect(applyAdaptation(model, []).slides).toEqual(model.slides)
  })
})
