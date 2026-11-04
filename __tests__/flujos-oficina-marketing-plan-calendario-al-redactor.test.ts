/**
 * 04-nov · punto 10 de la ADENDA 2 · el calendario del plan viaja del pre-vuelo al redactor como dato. Todo en seco (US$ 0): corre el código real de los nodos tocados.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { construirArregloSintaxisRedactor } from '../scripts/ops/oficina-marketing/plan-arreglo-sintaxis-redactor.mjs'
import { construirCalendarioAlRedactor, CODIGO_CALENDARIO } from '../scripts/ops/oficina-marketing/plan-calendario-al-redactor.mjs'

type Nodo = { name: string; parameters: Record<string, any> }
type Flujo = { nodes: Nodo[]; connections: Record<string, any> }
const J = JSON.parse(readFileSync(join(process.cwd(), 'scripts/ops/oficina-marketing/aplicado/X9F0zp6LQ2xGEYVS-arreglos-891-2026-11-04.json'), 'utf8'))
const base = () => (J.workflow || J) as Flujo
// el calendario se aplica DESPUÉS de la reparación de sintaxis del redactor (ver plan-arreglo-sintaxis-redactor)
const nuevo = () => { const f = structuredClone(base()); construirArregloSintaxisRedactor(f); construirCalendarioAlRedactor(f); return f }
const cod = (f: Flujo, n: string) => (f.nodes.find((x) => x.name === n) as Nodo).parameters.jsCode as string

const SEMANAS = Array.from({ length: 12 }, (_, i) => {
  const d = (n: number) => new Date(Date.UTC(2026, 10, 4 + n)).toISOString().slice(0, 10)
  return { semana: i + 1, desde: d(i * 7), hasta: d(i * 7 + 6) }
})
const CAL = { arranque: '2026-11-04', termina: '2027-01-26', semanas: SEMANAS }

/** corre el fragmento que arma `bloqueCalendario` con lo que contestaría «V9 · decidir» */
function bloque(calendario: unknown, vive = true): { CAL: any; lineas: string[] } {
  const $ = (n: string) => ({ first: () => { if (!vive || n !== 'V9 · decidir') throw new Error('no corrió'); return { json: { calendario } } } })
  return new Function('$', CODIGO_CALENDARIO + '\nreturn { CAL, lineas: bloqueCalendario }')($)
}

describe('plan · el calendario al redactor', () => {
  it('«V9 · decidir» deja pasar el calendario (objeto) y lo vuelve null si no lo es; el resto no cambia', () => {
    const dec = (ff: Flujo, body: Record<string, unknown>) => new Function('$input', '$runIndex', cod(ff, 'V9 · decidir'))({ first: () => ({ json: { statusCode: 200, body } }) }, 0)[0].json
    expect(dec(nuevo(), { decision: 'correr', calendario: CAL })).toMatchObject({ ruta: 'seguir', calendario: CAL })
    for (const raro of [undefined, null, 'x', 7, [1, 2]]) expect(dec(nuevo(), { decision: 'correr', calendario: raro }).calendario).toBeNull()
    expect(dec(nuevo(), { decision: 'correr' })).toMatchObject({ ruta: 'seguir', material_viejo: false, relleno_permitido: false })
    expect(dec(base(), { decision: 'correr', calendario: CAL }).calendario).toBeUndefined()
  })
  it('con un calendario válido el pedido lleva las 12 semanas y la orden de usar esas fechas', () => {
    const { CAL: c, lineas } = bloque(CAL)
    expect(c).not.toBeNull()
    const t = lineas.join('\n')
    expect(t).toContain('EL CALENDARIO DEL PLAN')
    expect(t).toContain('arranca el 2026-11-04 y termina el 2027-01-26')
    expect(t).toContain('Semana 1: del 2026-11-04 al 2026-11-10'); expect(t).toContain('Semana 12: del ')
    expect(lineas.filter((l) => l.startsWith('Semana ')).length).toBe(12)
    expect(t).toContain('EXACTAMENTE estas fechas')
  })
  it('falla CERRADO: ausente o mal formado = no se escribe nada ni se inventa un calendario', () => {
    for (const malo of [undefined, null, {}, { ...CAL, semanas: [] }, { ...CAL, arranque: '4-nov' }, { ...CAL, termina: undefined }, { ...CAL, semanas: [{ semana: 1, desde: 'hoy', hasta: '2026-11-10' }] }, { ...CAL, semanas: [{ semana: 1, desde: '2026-11-04', hasta: '10-nov' }] }, { ...CAL, semanas: [SEMANAS[0], { semana: 2, desde: '2026-11-11', hasta: undefined }] }, { ...CAL, semanas: [{ semana: 'x', desde: '2026-11-04', hasta: '2026-11-10' }] }, { ...CAL, semanas: Array(61).fill(SEMANAS[0]) }]) {
      const r = bloque(malo); expect(r.CAL).toBeNull(); expect(r.lineas).toEqual([])
    }
    expect(bloque(CAL, false).lineas).toEqual([]) // «V9 · decidir» no corrió (plan sin plan_v3)
  })
  it('«Redactor (B4)»: el bloque entra entre los números y las reglas, el código sigue siendo JS válido y solo cambian esos 2 nodos', () => {
    const f = nuevo(), a = base(), b4 = cod(f, 'Redactor (B4)')
    expect(() => new Function('$', '$input', '$json', b4)).not.toThrow()
    const i = b4.indexOf('...bloqueCalendario,'), j = b4.indexOf('bloquePlata,'), k = b4.indexOf('══════ REGLAS QUE NO SE NEGOCIAN')
    expect(j).toBeGreaterThan(0); expect(i).toBeGreaterThan(j); expect(k).toBeGreaterThan(i)
    expect(b4.indexOf('const CAL = ')).toBeLessThan(b4.indexOf('const pedido = ['))
    expect(b4).toContain('...(CAL ? { calendario_usado: { arranque: CAL.arranque, termina: CAL.termina, semanas: CAL.semanas.length } } : {}),') // lo que permite ver en la primera corrida real que el redactor lo recibió
    expect(b4.indexOf('calendario_usado')).toBeGreaterThan(b4.indexOf('const pedido = ['))
    expect(f.nodes.length).toBe(a.nodes.length); expect(f.connections).toEqual(a.connections)
    expect(f.nodes.filter((n) => JSON.stringify(n) !== JSON.stringify(a.nodes.find((y) => y.name === n.name))).map((n) => n.name).sort()).toEqual(['Redactor (B4)', 'V9 · decidir'])
    expect(cod(a, 'Redactor (B4)')).not.toContain('bloqueCalendario')
  })
  it('si el nodo cambia de forma, se detiene en vez de aplicar a ciegas', () => {
    const f = structuredClone(base()); const n = f.nodes.find((x) => x.name === 'Redactor (B4)') as Nodo
    n.parameters.jsCode = String(n.parameters.jsCode).replace('bloquePlata,', 'bloquePlata2,')
    expect(() => construirCalendarioAlRedactor(f)).toThrow()
  })
})
