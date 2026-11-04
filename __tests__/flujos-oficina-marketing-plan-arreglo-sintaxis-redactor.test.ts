/**
 * 04-nov · reparación: «Redactor (B4)» no compilaba tras la #891 (función `_sinTildes` repetida). Todo en seco (US$ 0).
 * La prueba que faltó: COMPILAR cada nodo de código que el módulo de coherencia toca (la certificación «aplica sin error» no lo detectó).
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { construirArregloSintaxisRedactor } from '../scripts/ops/oficina-marketing/plan-arreglo-sintaxis-redactor.mjs'
import { construirCalendarioAlRedactor } from '../scripts/ops/oficina-marketing/plan-calendario-al-redactor.mjs'

type Nodo = { name: string; parameters: Record<string, any> }
type Flujo = { nodes: Nodo[]; connections: Record<string, any> }
const J = JSON.parse(readFileSync(join(process.cwd(), 'scripts/ops/oficina-marketing/aplicado/X9F0zp6LQ2xGEYVS-arreglos-891-2026-11-04.json'), 'utf8'))
const base = () => (J.workflow || J) as Flujo
const cod = (f: Flujo, n: string) => (f.nodes.find((x) => x.name === n) as Nodo).parameters.jsCode as string
const compila = (c: string) => { try { new Function('$', '$input', '$json', '$node', '$items', '$runIndex', c); return null } catch (e) { return (e as Error).message } }
const NODOS = ['Redactor (B4)', '¿Llegó la vuelta?', 'JEF · plan · evaluar', 'JEF · armar']

describe('plan · «Redactor (B4)» compila', () => {
  it('el estado aplicado de la #891 NO compilaba (el defecto) y los otros 3 nodos sí', () => {
    expect(compila(cod(base(), 'Redactor (B4)'))).toMatch(/_sinTildes.*already been declared/)
    for (const n of NODOS.slice(1)) expect(compila(cod(base(), n))).toBeNull()
  })
  it('con la reparación los 4 nodos compilan y solo cambia el redactor', () => {
    const f = structuredClone(base()); construirArregloSintaxisRedactor(f)
    for (const n of NODOS) expect(compila(cod(f, n)), n).toBeNull()
    const a = base()
    expect(f.nodes.filter((n) => JSON.stringify(n) !== JSON.stringify(a.nodes.find((y) => y.name === n.name))).map((n) => n.name)).toEqual(['Redactor (B4)'])
    expect(f.connections).toEqual(a.connections)
    expect(cod(f, 'Redactor (B4)')).toContain("const _sinTildes = (s) => String(s == null")
    expect(cod(f, 'Redactor (B4)')).toContain('function _cohSinTildes(s)')
    expect(cod(f, 'Redactor (B4)')).not.toContain('function _sinTildes')
  })
  it('el calendario del punto 10 se puede aplicar encima y el redactor sigue compilando', () => {
    const f = structuredClone(base()); construirArregloSintaxisRedactor(f); construirCalendarioAlRedactor(f)
    for (const n of NODOS) expect(compila(cod(f, n)), n).toBeNull()
    expect(cod(f, 'Redactor (B4)')).toContain('...bloqueCalendario,')
  })
  it('si el nodo cambia de forma, se detiene en vez de aplicar a ciegas', () => {
    const f = structuredClone(base()); const n = f.nodes.find((x) => x.name === 'Redactor (B4)') as Nodo
    n.parameters.jsCode = String(n.parameters.jsCode).replace('function _sinTildes(s)', 'function _otra(s)')
    expect(() => construirArregloSintaxisRedactor(f)).toThrow()
  })
})
