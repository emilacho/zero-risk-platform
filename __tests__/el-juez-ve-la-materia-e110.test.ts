/**
 * 🔴 E110 · EL JUEZ DE FIDELIDAD VE LA MATERIA DEL CLIENTE.
 *
 * Medido en E107 (cimiento 146544): «[BB] Judge prep» arma su evidencia con claves fijas (resumen · competidores ·
 * ICP). Con E109 las lentes reciben el sitio y el Instagram propio, pero el juez NO: lo verdadero del sitio (precios,
 * horario, PedidosYa, Club, combos) puede puntuar como inventado.
 *
 * Cambio (mínimo · el único de E110 además de lo ya probado en E109/E109b): un bloque «MATERIA DEL CLIENTE» en la
 * evidencia del juez, DESPUÉS del ICP y ANTES de los campos no gateados, con los mismos topes por campo que las
 * lentes (sitio 3.500 · Instagram 1.000), idioma primero, que cede SÓLO por presupuesto y lo declara
 * (_materia_chars · _materia_recortada). La vara (0.85) y la PROSA del juez no se tocan.
 *
 * Fija con los datos REALES de 146544 (Consolidador → Judge prep) y con la materia REAL que armó el Transform en la
 * prueba a costo cero del motor (146704). Y con lo que el motor real devolvió con este mismo código (146709).
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

type Nodo = { name: string; type: string; parameters: Record<string, any>; disabled?: boolean }
type Flujo = { nodes: Nodo[]; connections: Record<string, unknown>; settings?: any }
const WS = join(process.cwd(), 'scripts/worker-staging')
const leer = (p: string) => JSON.parse(readFileSync(join(WS, p), 'utf8'))
const CIM_VIVO = leer('ssLtwYPt7zxuvnM2/cimiento-antes-e109-36871fc3.json') as Flujo
const CIM_E109 = leer('ssLtwYPt7zxuvnM2/cimiento-construido-e109.json') as Flujo
const CIM_E110 = leer('ssLtwYPt7zxuvnM2/cimiento-construido-e110.json') as Flujo
const EV = leer('ssLtwYPt7zxuvnM2/evidencia-146544-e110.json') as { nodos: Record<string, any>; materia_146704: any; motor_146709: any }

const JUDGE = '[BB] Judge prep'
const FANOUT = '[BB] Fan-out prep'
const nodo = (f: Flujo, n: string) => {
  const x = f.nodes.find((y) => y.name === n)
  if (!x) throw new Error(`falta ${n}`)
  return x
}
const codigo = (f: Flujo, n: string) => String(nodo(f, n).parameters.jsCode)

/** el motor, en miniatura: $json es la entrada · $('nodo').first() sale de las salidas REALES grabadas */
function correr(code: string, json: any, nodos: Record<string, any> = EV.nodos) {
  const $ = (n: string) => {
    if (!(n in nodos)) throw new Error(`Node '${n}' hasn't been executed`)
    return { first: () => ({ json: nodos[n] }), all: () => [{ json: nodos[n] }], item: { json: nodos[n] } }
  }
  const $input = { all: () => [{ json }], first: () => ({ json }), item: { json } }
  return new Function('$', '$input', '$json', code)($, $input, json) as Array<{ json: any }>
}
const entradaSinMateria = () => JSON.parse(JSON.stringify(EV.nodos['[BB] Consolidador']))
const entradaConMateria = () => {
  const e = entradaSinMateria()
  e._grounding_refs = { ...e._grounding_refs, materia_cliente: EV.materia_146704 }
  return e
}
const TOPE_TASK = 14000

describe('el rojo · el juez de hoy no ve la materia', () => {
  it('la miniatura reproduce byte a byte el task del juez de 146544 (la prueba es fiel)', () => {
    const out = correr(codigo(CIM_VIVO, JUDGE), entradaSinMateria())[0].json
    expect(out.judge_task).toBe(EV.nodos[JUDGE].judge_task)
    expect(out._judge_task_chars).toBe(EV.nodos[JUDGE]._judge_task_chars)
    expect(out.threshold).toBe(0.85)
  })
  it('Judge prep (36871fc3): aunque el grounding traiga materia_cliente, el task del juez no la lleva', () => {
    const out = correr(codigo(CIM_VIVO, JUDGE), entradaConMateria())[0].json
    expect(out.judge_task).not.toContain('MATERIA DEL CLIENTE')
    expect(out.judge_task).not.toMatch(/naufrago\.ec#restaurant|INSTAGRAM PROPIO/)
    expect(out.judge_task).toBe(EV.nodos[JUDGE].judge_task)
    expect(out).not.toHaveProperty('_materia_chars')
  })
})

describe('el verde · el juez ve la materia · después del ICP · antes de los campos · misma vara y misma prosa', () => {
  const out = correr(codigo(CIM_E110, JUDGE), entradaConMateria())[0].json
  const t: string = out.judge_task
  it('el bloque existe, con idioma primero, sitio (3.500 de 16.006) e Instagram propio · sin ceder · el task cabe', () => {
    const iM = t.indexOf('MATERIA DEL CLIENTE (texto real · evidencia primaria)')
    expect(iM).toBeGreaterThan(0)
    expect(t.indexOf('IDIOMA: español de Ecuador · sin voseo')).toBeGreaterThan(iM)
    expect(t.indexOf('SITIO (16006 chars · primeros 3500):')).toBeGreaterThan(t.indexOf('IDIOMA:'))
    expect(t.indexOf('INSTAGRAM PROPIO:')).toBeGreaterThan(t.indexOf('SITIO ('))
    expect(t).toContain('"@type":"Restaurant","@id":"https://naufrago.ec#restaurant"')
    expect(t).toContain('username**: naufrago.ec')
    expect(out._materia_chars).toBe(4692)
    expect(out._materia_recortada).toBe(false)
    expect(out._task_recortado).toBe(false)
    expect(out._judge_task_chars).toBeLessThanOrEqual(TOPE_TASK)
    expect(out.threshold).toBe(0.85)
  })
  it('todo lo anterior al bloque es byte-idéntico al task de 146544 (prosa · cabecera · evidencia base · ICP) · los campos van después', () => {
    const iM = t.indexOf('\nMATERIA DEL CLIENTE')
    expect(t.slice(0, iM)).toBe(EV.nodos[JUDGE].judge_task.slice(0, iM))
    expect(t.lastIndexOf('"positioning"')).toBeGreaterThan(t.indexOf('INSTAGRAM PROPIO:'))
    expect(t.lastIndexOf('"icp_summary"')).toBeGreaterThan(t.indexOf('INSTAGRAM PROPIO:'))
  })
  it('los campos gateados nunca ceden · lo que no cupo se declara (retention_notes · no gateado · 1.374 chars)', () => {
    expect(out._campos_cortados).toEqual(['retention_notes'])
    expect(out._campos_cortados).not.toContain('positioning')
    expect(out._campos_cortados).not.toContain('icp_summary')
    expect(out._icp_chars).toBe(EV.nodos[JUDGE]._icp_chars)
    expect(out._icp_recortado).toBe(false)
  })
  it('el motor real (146709 · costo cero · mismo código) devolvió exactamente estos números', () => {
    expect(EV.motor_146709).toMatchObject({ _materia_chars: 4692, _materia_recortada: false, _task_recortado: false, _judge_task_chars: out._judge_task_chars, _campos_cortados: ['retention_notes'], threshold: 0.85 })
    expect(EV.motor_146709.materia_inicio).toBe(t.slice(t.indexOf('MATERIA DEL CLIENTE'), t.indexOf('MATERIA DEL CLIENTE') + 200))
  })
})

describe('cuando no hay materia o no cabe', () => {
  it('cliente viejo sin materia: el juez recibe EXACTAMENTE lo de hoy · sólo se agregan los dos contadores en cero', () => {
    const hoy = correr(codigo(CIM_VIVO, JUDGE), entradaSinMateria())[0].json
    const nuevo = correr(codigo(CIM_E110, JUDGE), entradaSinMateria())[0].json
    expect(nuevo._materia_chars).toBe(0)
    expect(nuevo._materia_recortada).toBe(false)
    const { _materia_chars, _materia_recortada, ...resto } = nuevo
    expect(resto).toEqual(hoy)
  })
  it('si el presupuesto no alcanza, la materia cede (declarado) · el idioma sobrevive · los gateados no se tocan · el task cabe', () => {
    const e = entradaConMateria()
    e.brand_book_draft = { ...e.brand_book_draft, positioning: e.brand_book_draft.positioning + ' ' + 'relleno '.repeat(700) }
    const out = correr(codigo(CIM_E110, JUDGE), e)[0].json
    expect(out._materia_recortada).toBe(true)
    expect(out._materia_chars).toBeLessThan(4692)
    expect(out._materia_chars).toBeGreaterThan(0)
    expect(out.judge_task).toContain('IDIOMA: español de Ecuador')
    expect(out._campos_cortados).not.toContain('positioning')
    expect(out._campos_cortados).not.toContain('icp_summary')
    expect(out._judge_task_chars).toBeLessThanOrEqual(TOPE_TASK)
    expect(out._task_recortado).toBe(false)
  })
  it('materia con campos más largos que el tope: el juez la recorta a 3.500 + 1.000 como las lentes', () => {
    const e = entradaConMateria()
    e._grounding_refs.materia_cliente = { ...EV.materia_146704, sitio_texto: 'S'.repeat(9000), instagram_propio: 'I'.repeat(5000) }
    const out = correr(codigo(CIM_E110, JUDGE), e)[0].json
    expect(out.judge_task).toContain('SITIO (16006 chars · primeros 3500):')
    expect((out.judge_task.match(/S{3500}/) || []).length).toBe(1)
    expect(out.judge_task).not.toMatch(/S{3501}/)
    expect(out.judge_task).not.toMatch(/I{1001}/)
  })
})

describe('nada más cambió', () => {
  const norm = (n: Nodo) => JSON.stringify({ name: n.name, type: n.type, parameters: n.parameters, disabled: !!n.disabled })
  it('cimiento E110 = cimiento E109 + Judge prep · 30 nodos · conexiones iguales', () => {
    expect(CIM_E110.nodes.length).toBe(30)
    const dif = CIM_E110.nodes.filter((n) => norm(n) !== norm(nodo(CIM_E109, n.name))).map((n) => n.name)
    expect(dif).toEqual([JUDGE])
    expect(CIM_E110.connections).toEqual(CIM_E109.connections)
  })
  it('contra la versión viva (36871fc3 = c5396c0f): sólo Fan-out prep (E109) y Judge prep (E110)', () => {
    const dif = CIM_E110.nodes.filter((n) => norm(n) !== norm(nodo(CIM_VIVO, n.name))).map((n) => n.name)
    expect(dif.sort()).toEqual([FANOUT, JUDGE].sort())
  })
  it('Judge prep: la vara y la prosa siguen iguales · del código de hoy sólo se reescribieron 2 renglones (el ajuste de presupuesto y la evidencia)', () => {
    const a = codigo(CIM_VIVO, JUDGE), b = codigo(CIM_E110, JUDGE)
    expect(b.split('THRESHOLD').length).toBe(a.split('THRESHOLD').length)
    expect(b).toContain('const THRESHOLD = 0.85;')
    const prosa = (c: string) => c.slice(c.indexOf('const PROSA'), c.indexOf('const CAB_EV'))
    expect(prosa(b)).toBe(prosa(a))
    const perdidos = a.split('\n').filter((l) => !b.split('\n').includes(l))
    expect(perdidos).toEqual([
      '  if (FIJO + icpBlock.length + prueba.length <= TOPE_TASK) { lista = lista.concat([entrada(f)]); camposTxt = prueba; }',
      'const evidencia = evBase + icpBlock;',
    ])
  })
})
