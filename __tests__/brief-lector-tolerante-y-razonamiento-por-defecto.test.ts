/**
 * EL LECTOR TOLERANTE DE COMILLAS + EL RAZONAMIENTO APAGADO POR DEFECTO · CC#1 · 2026-10-01 · GO de Emilio · costo cero.
 * Experimento 30-sep: sin razonamiento el brief cabe en UNA respuesta (16.352 tokens · 5 min · US$ 0,38) pero el parte salió inválido por 2 comillas dobles sin escapar
 * (le pasó también a la corrida 1). Aquí se prueba, con la respuesta REAL de esa corrida, que el parte se lee, que se DECLARA la reparación, que NO se inventa nada,
 * y que la cadena normal (que no manda `razonamiento`) ya no vuelve al fallo de los 32.000.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'

const require = createRequire(import.meta.url)
const DIR = join(process.cwd(), 'scripts', 'worker-staging', 'brief-parte-de-trabajo')
const leer = (f: string) => readFileSync(join(DIR, f), 'utf8')
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor
const { extraerParte, repararComillas } = require(join(DIR, 'brief-chequeos.js'))
const REAL = leer('fixtures/respuesta-con-comillas-sin-escapar-2026-09-30.txt')

async function correrNodo(archivo: string, ctx: { input?: unknown[]; refs?: Record<string, unknown>; env?: Record<string, string> }, conChequeos = false) {
  const items = (ctx.input ?? [{}]).map((j) => ({ json: j }))
  const $input = { first: () => items[0], all: () => items }
  const $ = (n: string) => { if (!(ctx.refs && n in ctx.refs)) throw new Error('nodo no ejecutado: ' + n); return { first: () => ({ json: ctx.refs![n] }), all: () => [{ json: ctx.refs![n] }] } }
  let codigo = leer(archivo).replace('__REFERENCIA__', JSON.stringify(leer('referencia-el-brief-de-un-entregable.md')))
  if (conChequeos) { const c = leer('brief-chequeos.js'); const i = c.indexOf("if (typeof module !== 'undefined' && module.exports)"); codigo = (i === -1 ? c : c.slice(0, i)) + '\n' + codigo }
  return new AsyncFunction('$input', '$', '$env', '$json', '$workflow', '$execution', codigo)($input, $, ctx.env ?? {}, items[0]?.json, { id: 'WF-1' }, { id: '999', resumeUrl: 'https://n8n.test/webhook-waiting/999' })
}
const CID = '41dd3d62-d6de-4c9a-9996-6df78c1da118'
const LLAVE = 'llave-de-despacho-de-prueba-0123456789abcdef'
const sobre = (body: Record<string, unknown>) => correrNodo('n0-sobre.js', { input: [{ body: { client_id: CID, dry_run: false, ...body }, headers: { 'x-sala-dispatch-key': LLAVE } }], env: { SALA_DISPATCH_KEY: LLAVE } })

describe('🔴 el lector lee el parte REAL que antes salía inválido', () => {
  it('la respuesta real del 30-sep (12 briefs · 2 comillas sin escapar) ahora es LEGIBLE, reparada y declarada', () => {
    const r = extraerParte(REAL)
    expect(r.legible).toBe(true)
    expect(r.reparado).toBe(true)
    expect(r.comillas_reparadas).toBe(2)
    expect(r.parte.entregables).toHaveLength(12)
  })
  it('es reparación de FORMATO: el contenido no cambia (las comillas siguen en el texto, escapadas sólo en el JSON)', () => {
    const e = extraerParte(REAL).parte.entregables.find((x: { id: string }) => x.id === 'BRF-0010')
    expect(e.de_que_parte_del_plan).toContain('"Hola, quiero hacer un pedido"')
    expect(e.mensaje).toBe('Hola, quiero hacer un pedido')
  })
  it('un JSON SANO no se toca (reparado ausente) y las comillas ya escapadas no se vuelven a escapar', () => {
    const sano = '```json\n{"parte":{"entregables":[{"id":"BRF-0001","que_es":"dice \\"hola\\" bien"}]}}\n```'
    const r = extraerParte(sano)
    expect(r.legible).toBe(true)
    expect(r.reparado).toBeUndefined()
    expect(r.parte.entregables[0].que_es).toBe('dice "hola" bien')
    expect(repararComillas('{"a":"x \\"ya\\" y"}').reparadas).toBe(0)
  })
})

describe('🔴 no inventa: lo que de verdad no se puede leer SIGUE siendo ilegible', () => {
  it('un parte CORTADO a la mitad, un texto sin JSON y un JSON sin «entregables» siguen ilegibles', () => {
    expect(extraerParte(REAL.slice(0, 20000)).legible).toBe(false)
    expect(extraerParte('Hola, no pude armar el parte.').legible).toBe(false)
    expect(extraerParte('```json\n{"parte":{"otra_cosa":[1,2]}}\n```').legible).toBe(false)
    expect(extraerParte('').legible).toBe(false)
  })
})

describe('el nodo ④ con la respuesta real: parte VÁLIDO, reparación declarada, sin cambiar lo demás', () => {
  const vuelta = (texto: string) => ({ client_id: CID, client_name: 'Náufrago', plan_id: 'p1', manual_id: 'm1', manual_version: 1, llego_la_vuelta: true, vuelta_real: true, texto, forbidden_words: [], required_terminology: [], plan_texto: '', dry_run: false, vuelta_costo_usd: 0.38, vuelta_modelo: 'claude-sonnet-4-6', tope_usd: 1 })
  it('🔴 parte_valido:true · 12 entregables · reparación declarada en el parte, en la salida y en el registro', async () => {
    const [{ json: c }] = await correrNodo('n4-chequeos-nodo.js', { input: [vuelta(REAL)] }, true)
    expect(c).toMatchObject({ parte_legible: true, parte_valido: true, motivo_invalido: null, entregables: 12, parte_reparado: true, comillas_reparadas: 2 })
    expect(c.titulo_parte).not.toMatch(/NO VÁLIDO/)
    expect(c.parte_md).toMatch(/Formato reparado: el redactor escribió 2 comilla/)
    expect(c.parte_md).not.toMatch(/PARTE NO VÁLIDO/)
    expect(c.fila_parte.provenance_tag).toMatchObject({ legible: true, valido: true, reparado: true, comillas_reparadas: 2, entregables: 12 })
  })
  it('un parte sano no dice que se reparó nada · y uno ilegible SIGUE saliendo inválido (no se maquilla)', async () => {
    const sano = '```json\n{"parte":{"entregables":[{"id":"BRF-0001","plataforma":"Instagram","tipo_de_pieza":"imagen","que_es":"x"}]}}\n```'
    const [{ json: a }] = await correrNodo('n4-chequeos-nodo.js', { input: [vuelta(sano)] }, true)
    expect(a.parte_reparado).toBe(false)
    expect(a.parte_md).not.toMatch(/Formato reparado/)
    const [{ json: b }] = await correrNodo('n4-chequeos-nodo.js', { input: [vuelta(REAL.slice(0, 20000))] }, true)
    expect(b).toMatchObject({ parte_legible: false, parte_valido: false })
    expect(b.titulo_parte).toMatch(/NO VÁLIDO/)
  })
})

describe('🔴 el razonamiento va APAGADO por defecto: la cadena normal no vuelve al fallo de los 32.000', () => {
  const cuerpo = async (prev: Record<string, unknown>) => (await correrNodo('n3-armar-cuerpo.js', { input: [{ name: 'Náufrago' }], refs: { '② ¿Ya hay parte de este plan? · guarda': { client_id: CID, dry_run: false, manual_texto: 'm', plan_id: 'p', plan_texto: 'x', manual_version: 1, manual_id: 'm', ...prev } } }))[0].json.cuerpo
  it('el sobre SIN `razonamiento` (así llega de planeación) ⇒ disabled · con valor ⇒ el valor · `completo` ⇒ razonamiento completo (null)', async () => {
    expect((await sobre({}))[0].json.razonamiento).toBe('disabled')
    for (const v of ['disabled', 'low', 'medium']) expect((await sobre({ razonamiento: v }))[0].json.razonamiento).toBe(v)
    expect((await sobre({ razonamiento: 'completo' }))[0].json.razonamiento).toBeNull()
  })
  it.each([['high'], [''], [null], [true], [0], ['DISABLED']])('valor mal escrito (%j) ⇒ se DETIENE antes de gastar', async (v) => {
    await expect(sobre({ razonamiento: v })).rejects.toThrow(/BRIEF_RAZONAMIENTO_INVALIDO/)
  })
  it('🔴 de punta a punta: el sobre sin el campo ⇒ el redactor RECIBE thinking_mode:"disabled" · con `completo` no recibe la clave (como antes)', async () => {
    const [{ json: s }] = await sobre({})
    expect(await cuerpo({ razonamiento: s.razonamiento })).toMatchObject({ thinking_mode: 'disabled', agent: 'campaign-brief-agent' })
    const [{ json: c }] = await sobre({ razonamiento: 'completo' })
    expect(Object.prototype.hasOwnProperty.call(await cuerpo({ razonamiento: c.razonamiento }), 'thinking_mode')).toBe(false)
  })
})
