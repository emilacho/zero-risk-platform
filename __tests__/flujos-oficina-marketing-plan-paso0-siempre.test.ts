/**
 * 04-nov · ENCARGO Lenovo «el plan como se diseñó» punto 2: el paso 0 (informe de mercado) corre siempre salvo `con_mercado: false`/`null`. Todo en seco (US$ 0).
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { construirPlanPaso0Siempre } from '../scripts/ops/oficina-marketing/plan-paso0-siempre.mjs'

type Nodo = { name: string; parameters: Record<string, any> }
const ANTES = JSON.parse(readFileSync(join(process.cwd(), 'scripts/ops/oficina-marketing/respaldos/X9F0zp6LQ2xGEYVS-antes-de-paso0-siempre-2026-11-04.json'), 'utf8'))
const nuevo = () => { const f = structuredClone(ANTES.workflow || ANTES); construirPlanPaso0Siempre(f); return f as { nodes: Nodo[] } }

/** corre SOLO el bloque de mercado de «elegir brazos» con el cuerpo dado */
function pideMercado(body: Record<string, unknown> | 'sin_webhook'): boolean {
  const c = (nuevo().nodes.find((n) => n.name === 'elegir brazos') as Nodo).parameters.jsCode as string
  const i = c.indexOf('let con_mercado = false;'), j = c.indexOf("if (con_mercado) pedir('mercado'")
  const trozo = c.slice(i, j) + ' return con_mercado;'
  const dolar = () => ({ first: () => { if (body === 'sin_webhook') throw new Error('no hay webhook'); return { json: { body } } } })
  return new Function('$', trozo)(dolar)
}

describe('plan · el paso 0 corre siempre', () => {
  it.each([
    ['ausente', {}, true],
    ['true', { con_mercado: true }, true],
    ['false (la reescritura)', { con_mercado: false }, false],
    ['null', { con_mercado: null }, false],
  ])('con_mercado %s', (_n, body, espera) => expect(pideMercado(body as Record<string, unknown>)).toBe(espera))
  it('un disparo que no es webhook no lo pide y no se cae', () => expect(pideMercado('sin_webhook')).toBe(false))
  it('solo cambia «elegir brazos»', () => {
    const a = (ANTES.workflow || ANTES).nodes as Nodo[]
    expect(nuevo().nodes.filter((n, i) => JSON.stringify(n) !== JSON.stringify(a[i])).map((n) => n.name)).toEqual(['elegir brazos'])
  })
})
