/**
 * PRECIOS POR MODELO del corredor · pruebas PERMANENTES, US$ 0, sin red.
 * Fuente de los números: https://platform.claude.com/docs/en/about-claude/pricing (consultada 2026-10-09).
 * Lo que cuidan: cada modelo de la lista corta cobra con SU fila (Opus 5.5 = 4/20 con caché 0,05×; Fable 5.1 = 10/50 con caché 0,025×; Opus 5/4.8/4.7/4.6 = 5/25) ·
 * los modelos de siempre (Haiku 4.5, Sonnet 4.6) no cambian · lo desconocido cae en Sonnet como antes · las escrituras de caché valen 1,25× y 2×.
 */
import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'
import { _costFor, _precioKey } from '../precios-por-modelo.js'

const M = 1_000_000
const cerca = (a: number, b: number) => expect(a).toBeCloseTo(b, 9)

describe('qué fila cobra cada id', () => {
  it.each([
    ['claude-fable-5-1', 'fable'],
    ['claude-opus-5-5', 'opus-5-5'],
    ['claude-opus-5', 'opus'],
    ['claude-opus-4-8', 'opus'],
    ['claude-opus-4-7', 'opus'],
    ['claude-opus-4-6', 'opus'],
    ['claude-haiku-4-5-20251001', 'haiku'],
    ['claude-sonnet-4-6', 'sonnet'],
    ['claude-sonnet-5-5', 'sonnet'], // no está en la lista corta: sigue cayendo en la reserva de Sonnet
    ['un-id-que-no-conocemos', 'sonnet'],
  ])('%s ⇒ %s', (id, fila) => expect(_precioKey(id)).toBe(fila))
  it('«opus-5» NO se confunde con «opus-5-5» (y al revés)', () => {
    expect(_precioKey('claude-opus-5')).not.toBe('opus-5-5')
    expect(_precioKey('claude-opus-5-5')).not.toBe('opus')
  })
})

describe('precios oficiales (entrada / salida por millón)', () => {
  it('Opus 5.5 · US$ 4 / 20', () => { cerca(_costFor('claude-opus-5-5', M, 0), 4); cerca(_costFor('claude-opus-5-5', 0, M), 20) })
  it('Fable 5.1 · US$ 10 / 50', () => { cerca(_costFor('claude-fable-5-1', M, 0), 10); cerca(_costFor('claude-fable-5-1', 0, M), 50) })
  it('Opus 5 · 4.8 · 4.7 · 4.6 · US$ 5 / 25 (antes se estimaban a 15 / 75)', () => {
    for (const id of ['claude-opus-5', 'claude-opus-4-8', 'claude-opus-4-7', 'claude-opus-4-6']) { cerca(_costFor(id, M, 0), 5); cerca(_costFor(id, 0, M), 25) }
  })
  it('los modelos de siempre NO cambian: Haiku 4.5 = 1 / 5 · Sonnet 4.6 = 3 / 15', () => {
    cerca(_costFor('claude-haiku-4-5-20251001', M, 0), 1); cerca(_costFor('claude-haiku-4-5-20251001', 0, M), 5)
    cerca(_costFor('claude-sonnet-4-6', M, 0), 3); cerca(_costFor('claude-sonnet-4-6', 0, M), 15)
  })
})

describe('caché', () => {
  it('lectura: Opus 5.5 = 0,05× (US$ 0,20) · Fable 5.1 = 0,025× (US$ 0,25) · el resto 0,1×', () => {
    cerca(_costFor('claude-opus-5-5', 0, 0, M), 0.2)
    cerca(_costFor('claude-fable-5-1', 0, 0, M), 0.25)
    cerca(_costFor('claude-opus-4-8', 0, 0, M), 0.5)
    cerca(_costFor('claude-sonnet-4-6', 0, 0, M), 0.3)
    cerca(_costFor('claude-haiku-4-5', 0, 0, M), 0.1)
  })
  it('escritura 5 min = 1,25× y 1 h = 2× (Opus 5.5: 5 y 8 · Fable 5.1: 12,50 y 20 · Opus 5: 6,25 y 10)', () => {
    cerca(_costFor('claude-opus-5-5', 0, 0, 0, M, 0), 5); cerca(_costFor('claude-opus-5-5', 0, 0, 0, 0, M), 8)
    cerca(_costFor('claude-fable-5-1', 0, 0, 0, M, 0), 12.5); cerca(_costFor('claude-fable-5-1', 0, 0, 0, 0, M), 20)
    cerca(_costFor('claude-opus-5', 0, 0, 0, M, 0), 6.25); cerca(_costFor('claude-opus-5', 0, 0, 0, 0, M), 10)
  })
  it('una corrida mezclada suma cada parte con su tarifa', () => {
    // Fable 5.1 · 100k entrada + 10k salida + 400k lectura + 50k escritura 5m
    cerca(_costFor('claude-fable-5-1', 100_000, 10_000, 400_000, 50_000, 0), 1 + 0.5 + 0.1 + 0.625)
  })
  it('sin tokens cuesta 0 y nunca es NaN', () => {
    for (const id of ['claude-fable-5-1', 'claude-opus-5-5', 'x']) expect(_costFor(id, 0, 0)).toBe(0)
  })
})

describe('SDK 0.3.x · conexión de los servidores MCP', () => {
  it('el corredor restaura la espera de los servidores MCP (0.3.142 los conecta en segundo plano) salvo que Railway diga otra cosa', () => {
    const src = readFileSync(new URL('../agent-sdk-runner.ts', import.meta.url), 'utf8')
    expect(src).toMatch(/process\.env\.MCP_CONNECTION_NONBLOCKING \?\?= '0'/)
  })
  it('el SDK instalado es el 0.3.x que exige el CLI ≥ 2.1.280 (Opus 5.5 / Fable 5.1)', () => {
    const pkg = JSON.parse(readFileSync(new URL('../../../package.json', import.meta.url), 'utf8'))
    expect(pkg.dependencies['@anthropic-ai/claude-agent-sdk']).toMatch(/^0\.3\.(2[89]\d|[3-9]\d\d)$/)
    for (const k of ['linux-x64-musl', 'linux-arm64-musl']) expect(pkg.pnpm.overrides[`@anthropic-ai/claude-agent-sdk-${k}`]).toContain(pkg.dependencies['@anthropic-ai/claude-agent-sdk'])
  })
})
