/**
 * Autoproducir · el FLUJO (la copia de la parte «por filas»): dos nodos nuevos en una rama aparte, apagado, y la rama de siempre (Drive → cable) intacta. En seco.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ANCLA, AUTOPRODUCIR, SALIO, construirFlujo } from '../scripts/worker-staging/cadena/construir-autoproducir.mjs'

type Nodo = { name: string; type: string; parameters: Record<string, any>; onError?: string }
type Flujo = { nodes: Nodo[]; connections: Record<string, { main: Array<Array<{ node: string }>> }>; active?: boolean }
const WS = join(process.cwd(), 'scripts/worker-staging/cadena')
const leer = (p: string) => JSON.parse(readFileSync(join(WS, p), 'utf8')) as Flujo
const ANTES = leer('parte-por-filas-ANTES-autoproducir-2026-10-11.json')
const HOY = leer('parte-por-filas-ARREGLADA-autoproducir-2026-10-11.json')
const nodo = (f: Flujo, n: string) => f.nodes.find((x) => x.name === n)!
const AsyncFn = Object.getPrototypeOf(async function () { /* */ }).constructor as new (...a: string[]) => (...b: unknown[]) => unknown

const salio = (r: Record<string, unknown>) => new Function('$input', nodo(HOY, SALIO).parameters.jsCode as string)({ first: () => ({ json: r }) }) as Array<{ json: Record<string, unknown> }>

describe('la rama nueva', () => {
  it('«Marcar las filas» sigue yendo PRIMERO a Drive (el camino de siempre, intacto) y SEGUNDO a autoproducir · autoproducir → ¿Salió? y ahí termina', () => {
    expect(HOY.connections[ANCLA].main[0].map((x) => x.node)).toEqual(['⑤ Parte a Drive', AUTOPRODUCIR])
    expect(ANTES.connections[ANCLA].main[0].map((x) => x.node)).toEqual(['⑤ Parte a Drive'])
    expect(HOY.connections[AUTOPRODUCIR].main[0].map((x) => x.node)).toEqual([SALIO])
    expect(HOY.connections[SALIO]).toBeUndefined()
  })
  it('el pedido: POST a /api/cadena/filas con accion autoproducir, la campaña y el parte del chequeo, dry_run del lote, el contexto del flujo y la correlación de la sala', () => {
    const p = nodo(HOY, AUTOPRODUCIR).parameters
    expect(String(p.url)).toContain('/api/cadena/filas')
    expect(JSON.stringify(p.headerParameters)).toContain('x-api-key')
    const b = String(p.jsonBody)
    for (const k of ["accion: 'autoproducir'", "provenance_tag.campana_id", "$('⑤ Guardar el parte')", 'dry_run: $(', '$workflow.id', '$execution.id', '_sala_correlation_id', '_journey_id']) expect(b).toContain(k)
    expect(p.options.response.response).toMatchObject({ fullResponse: true, neverError: true })
  })
  it('el nodo ¿Salió?: «no emite por candado» NO es error · un sobre rechazado o un error del servidor SÍ detiene la corrida', () => {
    expect(salio({ statusCode: 200, body: { emite: false, motivo: 'autoproducir_apagado' } })[0].json).toMatchObject({ autoproducir: 'no_emite', motivo: 'autoproducir_apagado' })
    expect(salio({ statusCode: 200, body: { emite: false, motivo: 'freno_de_gasto' } })[0].json).toMatchObject({ autoproducir: 'no_emite', motivo: 'freno_de_gasto' })
    expect(salio({ statusCode: 409, body: { code: 'E-CADENA-APAGADA' } })[0].json).toMatchObject({ autoproducir: 'cerrado_por_la_compuerta' })
    expect(salio({ statusCode: 200, body: { emite: true, emitidos: 2, duplicados: 1, rechazados: 0, sin_familia: 1, omitidos: [], dry_run: true } })[0].json).toMatchObject({ autoproducir: 'emitido', emitidos: 2, duplicados: 1, sin_familia: 1 })
    expect(() => salio({ statusCode: 200, body: { emite: true, emitidos: 1, duplicados: 0, rechazados: 2, sobres: [{ brief_id: 'B2', resultado: 'rechazado', motivo: 'intake_apagado' }] } })).toThrow(/AUTOPRODUCIR_SOBRES_RECHAZADOS · 2 de 3/)
    expect(() => salio({ statusCode: 500, body: { error: 'x' } })).toThrow(/AUTOPRODUCIR_NO_CONTESTO/)
    expect(() => salio({ statusCode: 403, body: { code: 'E-WORKFLOW-DESCONOCIDO' } })).toThrow(/AUTOPRODUCIR_NO_CONTESTO/)
    expect(() => salio({ statusCode: 400, body: { code: 'E-SECO-INVALIDO' } })).toThrow(/AUTOPRODUCIR_NO_CONTESTO/)
  })
  it('compilan los dos nodos nuevos', () => {
    expect(() => new AsyncFn('$input', nodo(HOY, SALIO).parameters.jsCode as string)).not.toThrow()
  })
})

describe('nada más cambió · sigue APAGADO', () => {
  it('solo hay dos nodos nuevos · ningún nodo de antes cambió · el resto de las conexiones, igual · el flujo sigue inactivo', () => {
    const a = new Map(ANTES.nodes.map((n) => [n.name, JSON.stringify(n.parameters)])), b = new Map(HOY.nodes.map((n) => [n.name, JSON.stringify(n.parameters)]))
    expect(HOY.nodes.map((n) => n.name).filter((n) => !a.has(n)).sort()).toEqual([AUTOPRODUCIR, SALIO].sort())
    expect([...a.keys()].filter((k) => a.get(k) !== b.get(k))).toEqual([])
    for (const k of Object.keys(ANTES.connections)) if (k !== ANCLA) expect(HOY.connections[k]).toEqual(ANTES.connections[k])
    expect(ANTES.active).toBe(false)
    expect(HOY.active).toBe(false)
  })
  it('el flujo NO emite sobres por su cuenta ni toca la sala directamente: solo pide a la plataforma (donde viven los candados)', () => {
    const t = JSON.stringify([nodo(HOY, AUTOPRODUCIR).parameters, nodo(HOY, SALIO).parameters])
    expect(t).not.toMatch(/api\/sala\/intake|brief\/parte-listo|oficina|familias_activas/)
  })
  it('no se puede construir dos veces', () => {
    expect(() => construirFlujo(HOY)).toThrow(/ya trae autoproducir/)
  })
})
