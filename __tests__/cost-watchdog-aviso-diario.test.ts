/** Cost Watchdog · aviso diario de plataforma a US$ 10: suma agentes de TODAS las fichas + Apify del día, un aviso por nivel y día, y nunca un cero disfrazado de dato. Corre el código REAL de los dos nodos. */
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { construirFlujo, UMBRAL_DIA_USD, cambiarAgregado, cambiarDeteccion } from '../scripts/worker-staging/Gi2wq9baSRB3jQ0L/construir-aviso-diario.mjs'

type Nodo = { name: string; parameters: { jsCode?: string; url?: string } }
type Flujo = { nodes: Nodo[]; connections: Record<string, { main: Array<Array<{ node: string }>> }> }
const dir = path.join(process.cwd(), 'scripts/worker-staging/Gi2wq9baSRB3jQ0L')
const ANTES: Flujo = JSON.parse(fs.readFileSync(path.join(dir, 'watchdog-ANTES.json'), 'utf8'))
const DESPUES: Flujo = construirFlujo(ANTES)
const codigo = (f: Flujo, n: string) => f.nodes.find((x) => x.name === n)!.parameters.jsCode!
const HOY = new Date().toISOString().slice(0, 10)
const Fn = Function as unknown as new (...a: string[]) => (...a: unknown[]) => Array<{ json: Record<string, any> }>

type Entradas = { rollup?: Array<Record<string, unknown>>; apifyDiario?: unknown; historial?: Array<Record<string, unknown>>; estatico?: Record<string, unknown> }
function correr(f: Flujo, e: Entradas) {
  const salidas: Record<string, unknown[]> = {
    'Fetch Anthropic': e.rollup ?? [], 'Fetch OpenAI': [{}], 'Fetch Apify': [{ data: { current: { monthlyUsageUsd: 14.29 } } }],
    'Fetch Apify diario': e.apifyDiario === undefined ? [] : [e.apifyDiario], 'Fetch Historial': e.historial ?? [],
  }
  const estatico = e.estatico ?? {}
  let agregado: Array<{ json: Record<string, any> }> = []
  const dolar = (nombre: string) => ({
    all: () => (salidas[nombre] ?? []).map((json) => ({ json })),
    first: () => (nombre === 'Aggregate Costs' ? agregado[0] : { json: (salidas[nombre] ?? [])[0] }),
  })
  const ahora = { toUTC: () => ({ format: () => HOY, toFormat: () => HOY }), minus: () => ahora }
  const lanzar = (nombre: string) => new Fn('$', '$now', '$getWorkflowStaticData', codigo(f, nombre))(dolar, ahora, () => estatico)
  agregado = lanzar('Aggregate Costs')
  return { agregado: agregado[0].json, det: lanzar('Detect Anomalies')[0].json, estatico }
}
const rollup = (...costos: number[]) => costos.map((c, i) => ({ agent_id: 'a' + i, model: 'm', total_cost_usd: String(c), invocations_count: 1 }))
const apifyDia = (usd: number, fecha = HOY) => ({ data: { dailyServiceUsages: [{ date: fecha + 'T00:00:00.000Z', totalUsageCreditsUsd: usd }] } })

describe('Cost Watchdog · aviso diario de plataforma', () => {
  it('el umbral es US$ 10 y el flujo nuevo agrega solo el nodo de Apify por día, en la cadena', () => {
    expect(UMBRAL_DIA_USD).toBe(10)
    expect(DESPUES.nodes.length).toBe(ANTES.nodes.length + 1)
    const nuevo = DESPUES.nodes.find((n) => n.name === 'Fetch Apify diario')!
    expect(nuevo.parameters.url).toContain('/v2/users/me/usage/monthly')
    expect(DESPUES.connections['Fetch Apify'].main[0].map((c) => c.node)).toEqual(['Fetch Apify diario'])
    expect(DESPUES.connections['Fetch Apify diario'].main[0].map((c) => c.node)).toEqual(['Aggregate Costs'])
  })

  it('suma agentes (todas las filas del rollup) + Apify del día y avisa al pasar US$ 10', () => {
    const r = correr(DESPUES, { rollup: rollup(4, 3.5, 0.9), apifyDiario: apifyDia(2) })
    expect(r.agregado.total_dia_usd).toBeCloseTo(10.4, 6)
    expect(r.det.aviso_tope).toBe(true)
    expect(r.det.is_anomaly).toBe(true)
    expect(r.det.mensaje).toContain('Gasto del día de la plataforma')
    expect(r.det.mensaje).toContain('US$ 10.40')
    expect(r.det.mensaje).toContain('Apify US$ 2.00')
  })

  it('el 20-oct (US$ 12,55 de agentes + 3,15 de Apify) habría avisado', () => {
    expect(correr(DESPUES, { rollup: rollup(12.55), apifyDiario: apifyDia(3.15) }).det.aviso_tope).toBe(true)
  })

  it('justo debajo del umbral no avisa; justo en el umbral sí', () => {
    expect(correr(DESPUES, { rollup: rollup(7), apifyDiario: apifyDia(2.99) }).det.aviso_tope).toBe(false)
    expect(correr(DESPUES, { rollup: rollup(7), apifyDiario: apifyDia(3) }).det.aviso_tope).toBe(true)
  })

  it('Apify solo cuenta el día de hoy (no el de ayer ni el ciclo)', () => {
    const r = correr(DESPUES, { rollup: rollup(5), apifyDiario: apifyDia(9, '2000-01-01') })
    expect(r.agregado.apify_hoy_usd).toBe(0)
    expect(r.det.aviso_tope).toBe(false)
  })

  it('un aviso por nivel y día: repetir la misma hora no vuelve a avisar, cruzar US$ 20 sí', () => {
    const estatico: Record<string, unknown> = {}
    expect(correr(DESPUES, { rollup: rollup(10.5), apifyDiario: apifyDia(0), estatico }).det.aviso_tope).toBe(true)
    expect(correr(DESPUES, { rollup: rollup(11.5), apifyDiario: apifyDia(0), estatico }).det.aviso_tope).toBe(false)
    const r = correr(DESPUES, { rollup: rollup(20.1), apifyDiario: apifyDia(0), estatico })
    expect(r.det.aviso_tope).toBe(true)
    expect(r.det.mensaje).toContain('más de US$ 20')
  })

  it('el aviso de ayer no silencia el de hoy', () => {
    const estatico = { tope_dia: '2000-01-01', tope_nivel: 5 }
    expect(correr(DESPUES, { rollup: rollup(10.5), apifyDiario: apifyDia(0), estatico }).det.aviso_tope).toBe(true)
  })

  it('si Apify no responde, el total es parcial y lo dice (no se disfraza de cero)', () => {
    const r = correr(DESPUES, { rollup: rollup(10.5) })
    expect(r.agregado.apify_hoy_usd).toBeNull()
    expect(r.agregado.total_dia_parcial).toBe(true)
    expect(r.agregado.fuentes_sin_datos).toContain('Apify (día)')
    expect(r.det.aviso_tope).toBe(true)
    expect(r.det.mensaje).toContain('PARCIAL')
    expect(r.det.mensaje).toContain('Apify sin datos')
  })

  it('con agentes bajos y Apify caído no inventa un aviso', () => {
    const r = correr(DESPUES, { rollup: rollup(1), apifyDiario: { error: 'x' } })
    expect(r.agregado.apify_hoy_usd).toBeNull()
    expect(r.det.aviso_tope).toBe(false)
  })

  it('conserva el aviso por anomalía (2× el promedio) cuando el total está bajo el umbral', () => {
    const historial = [{ day: '2000-01-01', total_cost_usd: '0.5', refreshed_at: '2026-10-21T00:00:00Z' }]
    const r = correr(DESPUES, { rollup: rollup(2), apifyDiario: apifyDia(0), historial })
    expect(r.det.aviso_tope).toBe(false)
    expect(r.det.is_anomaly).toBe(true)
    expect(r.det.mensaje).toContain('más del doble del promedio')
  })

  it('se niega a aplicarse dos veces o sobre un código que cambió', () => {
    expect(() => cambiarAgregado(codigo(DESPUES, 'Aggregate Costs'))).toThrow()
    expect(() => cambiarDeteccion(codigo(DESPUES, 'Detect Anomalies'))).toThrow()
    expect(() => cambiarAgregado('nada')).toThrow()
    expect(() => construirFlujo(DESPUES)).toThrow()
  })
})
