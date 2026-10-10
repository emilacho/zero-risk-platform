/**
 * Relevo 41 · EL LIBRO DE COSTOS del corredor: Opus 4.6 a su precio oficial · las búsquedas web se cobran · un corte por tope no queda en US$ 0. US$ 0, sin red, sin modelo.
 * Fuente de los números: https://platform.claude.com/docs/en/about-claude/pricing (tabla «Model pricing» y «Web search tool», leída el 2026-10-10).
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('@anthropic-ai/claude-agent-sdk', () => ({ query: () => ({}) }))
const { _costFor, drainStream } = await import('../agent-sdk-runner')
const { PRECIO_BUSQUEDA_WEB_USD, costoDeBusquedasWeb, costoEfectivoDeCorrida } = await import('../libro-de-costos')
const M = 1_000_000
const casi = (a: number, b: number) => expect(a).toBeCloseTo(b, 9)

describe('1 · Opus 4.6 cuesta lo que dice la tabla oficial (5 / 25), no 15 / 75', () => {
  it('un millón de entrada = 5 · de salida = 25 · caché leída = 0,50 · escrituras 6,25 (5 min) y 10 (1 h)', () => {
    casi(_costFor('claude-opus-4-6', M, 0), 5)
    casi(_costFor('claude-opus-4-6', 0, M), 25)
    casi(_costFor('claude-opus-4-6', 0, 0, M), 0.5)
    casi(_costFor('claude-opus-4-6', 0, 0, 0, M), 6.25)
    casi(_costFor('claude-opus-4-6', 0, 0, 0, 0, M), 10)
  })
  it('la familia «opus» sin id propio (el alias corto) también', () => { casi(_costFor('claude-opus', M, M), 30) })
  it('el diseñador de carruseles: una llamada de 30.000 de entrada y 3.000 de salida cuesta US$ 0,225, no 0,675', () => { casi(_costFor('claude-opus-4-6', 30_000, 3_000), 0.225) })
  it('Sonnet 4.6 y Haiku 4.5 no cambian', () => { casi(_costFor('claude-sonnet-4-6', M, M), 18); casi(_costFor('claude-haiku-4-5-20251001', M, M), 6) })
})

describe('2 · las búsquedas web se cobran aparte (US$ 10 por 1.000)', () => {
  it('el precio de una búsqueda es US$ 0,01', () => { casi(PRECIO_BUSQUEDA_WEB_USD, 0.01); casi(costoDeBusquedasWeb(1000), 10) })
  it('se suman a los tokens, para cualquier modelo (también los de la lista corta)', () => {
    casi(_costFor('claude-sonnet-4-6', M, 0, 0, 0, 0, 7), 3 + 0.07)
    casi(_costFor('claude-opus-4-6', 0, 0, 0, 0, 0, 3), 0.03)
    casi(_costFor('claude-opus-5-5', M, 0, 0, 0, 0, 5), 4 + 0.05)
    casi(_costFor('claude-fable-5-1', 0, 0, 0, 0, 0, 1), 0.01)
  })
  it('sin búsquedas (o con un dato raro) el costo es el de siempre', () => {
    casi(_costFor('claude-sonnet-4-6', M, 0), 3)
    for (const raro of [undefined, null, NaN, -4, Infinity as number]) casi(costoDeBusquedasWeb(raro as number), raro === Infinity ? 0 : 0)
  })
  it('el SDK las informa en usage.server_tool_use.web_search_requests: drainStream las cuenta y recoge el total del SDK', async () => {
    async function* flujo() {
      yield { type: 'result', subtype: 'success', stop_reason: 'end_turn', total_cost_usd: 0.4321, usage: { input_tokens: 10, output_tokens: 20, server_tool_use: { web_search_requests: 4 } } }
    }
    const d = await drainStream(flujo() as never)
    expect(d.webSearchRequests).toBe(4)
    expect(d.sdkTotalCostUsd).toBeCloseTo(0.4321, 9)
    expect(d.inputTokens).toBe(10)
  })
  it('un resultado sin ese campo cuenta 0 búsquedas y deja el total del SDK en null', async () => {
    async function* flujo() { yield { type: 'result', subtype: 'success', usage: { input_tokens: 1, output_tokens: 1 } } }
    const d = await drainStream(flujo() as never)
    expect(d.webSearchRequests).toBe(0); expect(d.sdkTotalCostUsd).toBeNull()
  })
})

describe('3 · un corte por tope no queda en US$ 0 (cota pesimista, declarada)', () => {
  it('calculado > 0 manda siempre (no se sube ni se baja)', () => {
    expect(costoEfectivoDeCorrida({ calculado: 0.07, sdkTotal: 0.9, corte: true, tope: 0.5 })).toEqual({ costo: 0.07, base: 'tokens', cota: false })
  })
  it('libro en 0 + el SDK informó su total → ese total', () => {
    expect(costoEfectivoDeCorrida({ calculado: 0, sdkTotal: 0.12, corte: true, tope: 0.5 })).toEqual({ costo: 0.12, base: 'total_del_sdk', cota: false })
  })
  it('libro en 0 + corte + nada del SDK → el TOPE como cota pesimista, marcada', () => {
    expect(costoEfectivoDeCorrida({ calculado: 0, sdkTotal: null, corte: true, tope: 0.5 })).toEqual({ costo: 0.5, base: 'tope_como_cota', cota: true })
    expect(costoEfectivoDeCorrida({ calculado: 0, sdkTotal: 0, corte: true, tope: 0.02 })).toEqual({ costo: 0.02, base: 'tope_como_cota', cota: true })
  })
  it('una corrida SANA que costó 0 sigue en 0 (no se inventa nada), y sin tope válido tampoco', () => {
    expect(costoEfectivoDeCorrida({ calculado: 0, sdkTotal: null, corte: false, tope: 0.5 }).costo).toBe(0)
    expect(costoEfectivoDeCorrida({ calculado: 0, sdkTotal: null, corte: true, tope: undefined }).costo).toBe(0)
    expect(costoEfectivoDeCorrida({ calculado: 0, sdkTotal: null, corte: true, tope: -1 }).costo).toBe(0)
  })
  it('un total del SDK negativo o raro se ignora', () => {
    expect(costoEfectivoDeCorrida({ calculado: 0, sdkTotal: -3, corte: true, tope: 0.5 }).base).toBe('tope_como_cota')
    expect(costoEfectivoDeCorrida({ calculado: 0, sdkTotal: NaN, corte: false, tope: 0.5 }).costo).toBe(0)
  })
})
