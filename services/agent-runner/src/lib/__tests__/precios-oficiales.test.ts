/**
 * Relevo 26 · PRECIOS OFICIALES por modelo (Opus 5.5, Opus 5 / 4.8 / 4.7 y Fable 5.1) en el cálculo de costo del corredor. US$ 0, sin red.
 * Fuente de los números: https://platform.claude.com/docs/en/about-claude/pricing (tabla «Model pricing», leída el 2026-10-09). Lo que cuidan:
 * cada id de la lista corta tiene SU precio (ninguno cae en la tarifa de otra familia) · Opus 5.5 ya no se estima a 15/75 · los modelos que ya corrían NO cambian de costo · el ejemplo del documento de Anthropic cuadra.
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('@anthropic-ai/claude-agent-sdk', () => ({ query: () => ({}) }))
const { _costFor } = await import('../agent-sdk-runner')
const { MODELOS_POR_CORRIDA, PRECIOS_OFICIALES } = await import('../modelo-por-corrida')
const M = 1_000_000
const casi = (a: number, b: number) => expect(a).toBeCloseTo(b, 9)

describe('cada id de la lista corta tiene su precio oficial', () => {
  it('la tabla de precios cubre EXACTAMENTE los ids de la lista (ni uno sin precio, ni un precio sin id)', () => {
    expect(Object.keys(PRECIOS_OFICIALES).sort()).toEqual([...MODELOS_POR_CORRIDA].sort())
  })
  it.each([
    // id, entrada, salida, lectura de caché, escritura 5 min, escritura 1 h  (US$ por millón)
    ['claude-opus-5-5', 4, 20, 0.2, 5, 8],
    ['claude-opus-5', 5, 25, 0.5, 6.25, 10],
    ['claude-opus-4-8', 5, 25, 0.5, 6.25, 10],
    ['claude-opus-4-7', 5, 25, 0.5, 6.25, 10],
    ['claude-fable-5-1', 10, 50, 0.25, 12.5, 20],
  ])('%s · entrada %d · salida %d · caché leída %d · escritura 5 min %d · 1 h %d', (id, ent, sal, lec, e5, e1) => {
    casi(_costFor(id, M, 0), ent)
    casi(_costFor(id, 0, M), sal)
    casi(_costFor(id, 0, 0, M), lec)
    casi(_costFor(id, 0, 0, 0, M), e5)
    casi(_costFor(id, 0, 0, 0, 0, M), e1)
  })
  it('el ejemplo del documento de Anthropic (Opus 5: 50.000 de entrada + 15.000 de salida = US$ 0,625 en tokens; con 40.000 leídos de caché: 0,445) cuadra', () => {
    casi(_costFor('claude-opus-5', 50_000, 15_000), 0.625)
    casi(_costFor('claude-opus-5', 10_000, 15_000, 40_000), 0.05 + 0.02 + 0.375)
  })
})

describe('🔴 Opus 5.5 ya NO se estima con la tabla vieja de Opus (15/75: 3,75 veces de más)', () => {
  it('un millón de entrada y uno de salida cuestan 24, no 90', () => {
    casi(_costFor('claude-opus-5-5', M, M), 24)
    expect(_costFor('claude-opus-5-5', M, M)).toBeLessThan(_costFor('claude-opus-4-6', M, M))
  })
  it('Fable no cae en la tarifa de Sonnet: un millón y un millón cuestan 60', () => {
    casi(_costFor('claude-fable-5-1', M, M), 60)
    expect(_costFor('claude-fable-5-1', M, M)).toBeGreaterThan(_costFor('claude-sonnet-4-6', M, M))
  })
})

describe('los modelos que ya corrían NO cambian de costo (tabla por familia de siempre)', () => {
  it.each([
    ['claude-haiku-4-5-20251001', 1, 5, 0.1],
    ['claude-sonnet-4-6', 3, 15, 0.3],
    ['claude-opus-4-6', 15, 75, 1.5],
  ])('%s · entrada %d · salida %d · caché leída %d', (id, ent, sal, lec) => {
    casi(_costFor(id, M, 0), ent)
    casi(_costFor(id, 0, M), sal)
    casi(_costFor(id, 0, 0, M), lec)
    casi(_costFor(id, 0, 0, 0, M), ent * 1.25)
    casi(_costFor(id, 0, 0, 0, 0, M), ent * 2)
  })
})
