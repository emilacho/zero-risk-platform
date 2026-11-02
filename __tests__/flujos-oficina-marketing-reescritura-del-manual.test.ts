/**
 * 02-nov · «PEDIR CAMBIOS AL MANUAL» · la parte del flujo del manual (`ssLtwYPt7zxuvnM2`). US$ 0, sin red; se ejecuta el CÓDIGO REAL de «Validate Deal Data», «[BB] Fan-out prep» y «[BB] Promote prep».
 * Fija: SIN `reescritura` en el sobre los tres nodos devuelven exactamente lo de hoy (el alta no cambia); CON ella, el sobre pasa, las 3 lentes reciben el bloque
 * (pedido del dueño como palabra suya, manual vigente, campos validados/liberados, sección como foco y no límite) y el guardado lleva `manual_cambio_id`.
 * Ninguna regla dura: el bloque informa y pide. El código de «hoy» se reconstruye deshaciendo las sustituciones del constructor.
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
// @ts-expect-error módulo .mjs sin tipos
import { SUSTITUCIONES, TOPE_BLOQUE_REESCRITURA } from '../scripts/ops/oficina-marketing/reescritura-del-manual.mjs'

const RAIZ = path.join(__dirname, '..', 'scripts', 'ops', 'oficina-marketing')
const nuevo = JSON.parse(fs.readFileSync(path.join(RAIZ, 'nuevo', 'ssLtwYPt7zxuvnM2.json'), 'utf8'))
const EV44 = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'scripts', 'worker-staging', 'ssLtwYPt7zxuvnM2', 'evidencia-146544-e109.json'), 'utf8')) as { nodos: Record<string, any>; todos: Record<string, any[]> }
const codigo = (n: string): string => nuevo.nodes.find((x: any) => x.name === n).parameters.jsCode
const VAL = 'Validate Deal Data', FAN = '[BB] Fan-out prep', PROM = '[BB] Promote prep'
/** el código del nodo sin esta parte */
const hoy = (n: string): string => {
  const s = (SUSTITUCIONES as Array<[string, string, string]>).find((x) => x[0] === n)!
  expect(codigo(n)).toContain(s[2])
  return codigo(n).replace(s[2], s[1])
}

function correr(code: string, ctx: { nodos: Record<string, any>; todos?: Record<string, any[]>; input?: any[]; json?: any }) {
  const $ = (n: string) => {
    if (!(n in ctx.nodos)) throw new Error(`Node '${n}' hasn't been executed`)
    return { first: () => ({ json: ctx.nodos[n] }), all: () => (ctx.todos?.[n] ?? [ctx.nodos[n]]).map((j) => ({ json: j })), item: { json: ctx.nodos[n] } }
  }
  const items = (ctx.input ?? []).map((j) => ({ json: j }))
  const $input = { all: () => items, first: () => items[0], item: items[0] }
  return new Function('$', '$input', '$json', '$workflow', '$execution', code)($, $input, ctx.json ?? items[0]?.json ?? {}, { id: 'ssLtwYPt7zxuvnM2' }, { id: '1' }) as Array<{ json: any }>
}

const MANUAL = { positioning: 'Cocina de mar sin pretensión', voice_description: 'Cercana y directa', mission: 'Que comer bien sea fácil' }
const RE = { manual_base_id: 'b-1', manual_cambio_id: 'cc-1', cambios_del_dueno: 'Que la voz sea más cálida y menos formal', seccion: 'Cómo habla', campos_validados: ['mission'], campos_liberados: ['voice_description'], manual_vigente: MANUAL }
const ENTRADA = { client_id: 'c-1', client_name: 'Náufrago', industry: 'restaurante', discovery_package: { discovery_summary: 'resumen' } }

describe('Validate Deal Data', () => {
  it('sin `reescritura`: la salida es EXACTAMENTE la de hoy (sin la clave)', () => {
    const a = correr(codigo(VAL), { nodos: {}, input: [ENTRADA] }), b = correr(hoy(VAL), { nodos: {}, input: [ENTRADA] })
    expect(a).toEqual(b)
    expect('reescritura' in a[0].json).toBe(false)
  })
  it('con `reescritura` objeto: pasa tal cual; un valor que no es objeto (texto, lista, null) NO pasa', () => {
    expect(correr(codigo(VAL), { nodos: {}, input: [{ ...ENTRADA, reescritura: RE }] })[0].json.reescritura).toEqual(RE)
    for (const malo of ['texto', ['x'], null, 5]) expect('reescritura' in correr(codigo(VAL), { nodos: {}, input: [{ ...ENTRADA, reescritura: malo }] })[0].json).toBe(false)
  })
})

const ctxFan = (re?: any) => {
  const nodos = JSON.parse(JSON.stringify(EV44.nodos)), todos = JSON.parse(JSON.stringify(EV44.todos))
  if (re) { nodos[VAL] = { ...nodos[VAL], reescritura: re }; if (todos[VAL]) todos[VAL] = [nodos[VAL]] }
  return { nodos, todos, json: nodos['[BB] Load ICP (canon)'] }
}
const LENTES = ['brand-strategist', 'editor-en-jefe', 'jefe-client-success']

describe('[BB] Fan-out prep', () => {
  it('sin `reescritura`: idéntico a hoy, tarea por tarea', () => {
    const a = correr(codigo(FAN), ctxFan()), b = correr(hoy(FAN), ctxFan())
    expect(a).toEqual(b)
    expect('_reescritura' in a[0].json).toBe(false)
  })
  it('con `reescritura`: las TRES lentes reciben el bloque con el pedido, el manual vigente, los campos y la sección como foco', () => {
    const base = correr(hoy(FAN), ctxFan())[0].json
    const out = correr(codigo(FAN), ctxFan(RE))[0].json
    for (const l of LENTES) {
      const t = out.tasks[l] as string
      expect(t.startsWith(base.tasks[l])).toBe(true) // lo de hoy queda intacto; el bloque va al final
      expect(t).toContain('ESTA ES UNA REESCRITURA')
      expect(t).toContain('«Que la voz sea más cálida y menos formal»')
      expect(t).toContain('Cocina de mar sin pretensión')
      expect(t).toContain('mission')
      expect(t).toContain('voice_description')
      expect(t).toContain('sección «Cómo habla». Es el foco, no un límite')
      expect(t).toContain('SU PALABRA')
      expect(t).toContain('dilo en tu razón')
    }
    expect(out._reescritura).toMatchObject({ manual_cambio_id: 'cc-1', recortado: false })
  })
  it('sin sección: dice que el pedido es general; sin campos validados no inventa la línea de protegidos', () => {
    const t = correr(codigo(FAN), ctxFan({ ...RE, seccion: null, campos_validados: [], campos_liberados: [] }))[0].json.tasks['editor-en-jefe'] as string
    expect(t).toContain('El pedido es general sobre el manual')
    expect(t).not.toContain('ya validó estos campos')
    expect(t).not.toContain('Es el foco')
  })
  it('un manual vigente enorme se recorta al tope y SE DECLARA (en el texto y en el dato)', () => {
    const gran = 'x'.repeat(TOPE_BLOQUE_REESCRITURA * 2)
    const out = correr(codigo(FAN), ctxFan({ ...RE, manual_vigente: gran }))[0].json
    expect(out._reescritura.recortado).toBe(true)
    for (const l of LENTES) expect(out.tasks[l]).toContain('recortado a ' + TOPE_BLOQUE_REESCRITURA + ' caracteres')
    const b = (out.tasks['brand-strategist'] as string).slice((out.tasks['brand-strategist'] as string).indexOf('ESTA ES UNA REESCRITURA'))
    expect((b.match(/x/g) ?? []).length).toBeLessThanOrEqual(TOPE_BLOQUE_REESCRITURA)
  })
  it('el pedido largo se corta a 2.000 caracteres y los espacios se normalizan; no rompe con campos ausentes', () => {
    const t = correr(codigo(FAN), ctxFan({ manual_vigente: MANUAL, cambios_del_dueno: 'a  \n b ' + 'z'.repeat(5000) }))[0].json.tasks['brand-strategist'] as string
    expect(t).toContain('«a b z')
    expect((t.slice(t.indexOf('ESTA ES UNA REESCRITURA')).match(/z/g) ?? []).length).toBeLessThanOrEqual(2000)
  })
  it('no pone reglas duras: el bloque no ordena descartar ni exige justificar nada', () => {
    const t = correr(codigo(FAN), ctxFan(RE))[0].json.tasks['brand-strategist'] as string
    const bloque = t.slice(t.indexOf('ESTA ES UNA REESCRITURA'))
    expect(bloque).not.toMatch(/justific|no puedes|prohib|obligatori/i)
  })
})

const ctxProm = (re?: any) => {
  const nodos: Record<string, any> = { 'Validate Deal Data': { client_id: 'c-1', ...(re ? { reescritura: re } : {}) }, '[BB] Guardia de procedencia': { _procedencia: 'padre' } }
  return { nodos, json: { fidelity: { pass: true, scores: { a: 1 }, threshold: 0.85 }, brand_book_draft: { positioning: 'x', _field_meta: {} }, client_id: 'c-1' } }
}

describe('[BB] Promote prep', () => {
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-11-02T10:00:00Z')) // `approved_at` es la hora: se congela para comparar con hoy
  it('sin pedido: el cuerpo del guardado es EXACTAMENTE el de hoy (sin `manual_cambio_id`)', () => {
    const a = correr(codigo(PROM), ctxProm()), b = correr(hoy(PROM), ctxProm())
    expect(a).toEqual(b)
    expect('manual_cambio_id' in a[0].json.promote_body).toBe(false)
  })
  it('con pedido: el cuerpo lleva `manual_cambio_id` (la puerta de CC1 liga la versión y no crea una segunda)', () => {
    const o = correr(codigo(PROM), ctxProm(RE))[0].json
    expect(o.promote_body.manual_cambio_id).toBe('cc-1')
    const sin = correr(hoy(PROM), ctxProm(RE))[0].json
    expect({ ...o.promote_body, manual_cambio_id: undefined }).toEqual({ ...sin.promote_body, manual_cambio_id: undefined })
  })
  it('un `reescritura` sin `manual_cambio_id` no pone la clave', () => {
    expect('manual_cambio_id' in correr(codigo(PROM), ctxProm({ ...RE, manual_cambio_id: '' }))[0].json.promote_body).toBe(false)
  })
  it('la guarda de procedencia sigue: sin padre no promueve ni con pedido', () => {
    const c = ctxProm(RE); c.nodos['[BB] Guardia de procedencia']._procedencia = 'manual'
    expect(() => correr(codigo(PROM), c)).toThrow(/CIMIENTO_PROMOCION_SIN_PADRE/)
  })
})

describe('alcance', () => {
  it('esta parte cambia solo los tres nodos del manual que dice el plan (los otros dos del archivo acumulado son de partes ya certificadas)', () => {
    for (const [n, , nuevoTxt] of SUSTITUCIONES as Array<[string, string, string]>) expect(codigo(n)).toContain(nuevoTxt)
    const sin = JSON.stringify(nuevo)
    expect(sin).not.toContain('PENDIENTE-MANUAL-CAMBIOS')
  })
})
