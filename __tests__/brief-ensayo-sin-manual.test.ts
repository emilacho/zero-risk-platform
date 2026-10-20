/**
 * EL BRIEF EN ENSAYO SIN MANUAL (CC#1 · 20-oct · tramo 8 del ensayo de punta a punta · SÍ de Lenovo). US$ 0.
 * Se EJECUTA el texto de la guarda «① GUARDA» del flujo «parte por filas» preparado: solo `dry_run === true` (booleano exacto) y solo si el cliente no tiene NINGUNA fila de manual
 * sigue con un manual simulado en memoria. Lo real sin manual y el manual que existe y no pasó la vara siguen deteniendo. Y SOLO cambia ese nodo respecto del flujo vivo.
 */
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'

const { construirFlujo } = await import(pathToFileURL(path.resolve(__dirname, '../scripts/worker-staging/BNXqlaX1oHSfZIpF/construir-ensayo-sin-manual-2026-10-20.mjs')).href)

const D = path.resolve(__dirname, '../scripts/worker-staging/BNXqlaX1oHSfZIpF')
type Flujo = { nodes: Array<{ name: string; parameters: Record<string, any> }>; connections: unknown }
const leer = (f: string, dir = D) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) as Flujo
const antes = leer('parte-por-filas-ANTES-ensayo-sin-manual-2026-10-20.json')
const nuevo = leer('parte-por-filas-ARREGLADO-ensayo-sin-manual-2026-10-20.json')
const GUARDA = '① GUARDA · sin manual aprobado se DETIENE'
const codigo = nuevo.nodes.find((n) => n.name === GUARDA)!.parameters.jsCode as string

function correr(filas: unknown[], env: Record<string, unknown>) {
  const items = filas.map((json) => ({ json }))
  const $ = (n: string) => { if (n !== '⓪ GUARDA · el lote') throw new Error('nodo no ejecutado: ' + n); return { first: () => ({ json: env }), all: () => [{ json: env }] } }
  return new Function('$input', '$', '$env', codigo)({ first: () => items[0], all: () => items }, $, {}) as Array<{ json: Record<string, any> }>
}
const ENV = { client_id: 'c-1', dry_run: true, campana_id: 'k', lote: '2026-W44', fila_ids: ['f1'] }
const fila = (extra: Record<string, unknown> = {}) => ({ id: 'm1', gate_outcome: 'paso_la_vara', version: 6, created_at: '2026-10-10', content_text: 'texto del manual', forbidden_words: ['x'], required_terminology: ['y'], voice_description: 'Voz cálida', ...extra })

describe('la guarda ① del brief con el ensayo sin manual', () => {
  it('ensayo (dry_run === true) y NINGUNA fila de manual: sigue con un manual simulado y rotulado, sin reglas inventadas', () => {
    const [{ json }] = correr([], ENV)
    expect(json).toMatchObject({ client_id: 'c-1', manual_id: 'ensayo-sin-manual', manual_de_ensayo: true, manual_version: null, forbidden_words: [], required_terminology: [] })
    expect(json.manual_texto).toMatch(/SIMULADO DE ENSAYO/)
    expect(json.manual_voz).toEqual({ voice_description: null, writing_style: null, tone_guidelines: {} }) // no inventa el trato
    expect(json.lote).toBe('2026-W44') // el sobre pasa entero
  })
  it('🔴 un ERROR de la base NO es «cero filas»: en ensayo y en real la guarda se detiene y NO simula (reparo de CC#2)', () => {
    const errores = [{ code: 'PGRST301', message: 'JWT expired', details: null, hint: null }, { message: 'fetch failed' }, { error: 'timeout' }]
    for (const e of errores) for (const dry of [true, false]) expect(() => correr([e], { ...ENV, dry_run: dry }), JSON.stringify(e) + dry).toThrow(/BRIEF_LECTURA_MANUAL_FALLIDA/)
    // un error mezclado con una fila buena también detiene (no se adivina cuál vale)
    expect(() => correr([fila(), { code: 'X', message: 'y' }], ENV)).toThrow(/BRIEF_LECTURA_MANUAL_FALLIDA/)
  })
  it('lo real sin manual SIGUE deteniendo (dry_run false)', () => {
    expect(() => correr([], { ...ENV, dry_run: false })).toThrow(/BRIEF_SIN_MANUAL/)
  })
  it('solo `true` exacto cuenta: cualquier otro valor NO simula (el nodo ⓪ ya lo detiene antes, pero la guarda no depende de eso)', () => {
    for (const raro of ['true', 1, null, undefined]) expect(() => correr([], { ...ENV, dry_run: raro }), String(raro)).toThrow(/BRIEF_SIN_MANUAL/)
  })
  it('un manual que EXISTE y no pasó la vara detiene, también en ensayo', () => {
    expect(() => correr([fila({ gate_outcome: 'salio_al_tope' })], ENV)).toThrow(/BRIEF_MANUAL_NO_APROBADO/)
    expect(() => correr([fila({ gate_outcome: null })], { ...ENV, dry_run: false })).toThrow(/BRIEF_MANUAL_NO_APROBADO/)
  })
  it('con un manual aprobado todo queda igual (real y ensayo): trae su versión, su texto y sus reglas, y no se rotula como de ensayo', () => {
    for (const dry of [true, false]) {
      const [{ json }] = correr([fila()], { ...ENV, dry_run: dry })
      expect(json, String(dry)).toMatchObject({ manual_id: 'm1', manual_version: 6, manual_de_ensayo: false, forbidden_words: ['x'], required_terminology: ['y'], manual_texto: 'texto del manual' })
      expect(json.manual_voz.voice_description).toBe('Voz cálida')
    }
  })
})

describe('lo que cambia en el flujo: TRES nodos, y el ANTES es el estado r80', () => {
  const TOCADOS = [GUARDA, '④ Chequeos', '⑤ Seco · lo que se habría escrito']
  it('solo ①, ④ y ⑤ Seco difieren del vivo; nodos y conexiones iguales', () => {
    expect(nuevo.nodes.map((n) => n.name)).toEqual(antes.nodes.map((n) => n.name))
    expect(nuevo.nodes.filter((n, i) => JSON.stringify(n) !== JSON.stringify(antes.nodes[i])).map((n) => n.name)).toEqual(TOCADOS)
    expect(JSON.stringify(nuevo.connections)).toBe(JSON.stringify(antes.connections))
  })
  it('🔴 LINAJE (reparo de CC#2): el ANTES es EXACTAMENTE el estado r80 que construye la cadena (`cadena/copia-r80-ARREGLADO.json`); el constructor reproduce el ARREGLADO y no se construye dos veces', () => {
    const r80 = leer('copia-r80-ARREGLADO.json', path.resolve(D, '../cadena'))
    expect(JSON.stringify(antes.nodes.map((n) => [n.name, n.parameters]))).toBe(JSON.stringify(r80.nodes.map((n) => [n.name, n.parameters])))
    expect(JSON.stringify(construirFlujo(antes))).toBe(JSON.stringify(nuevo))
    expect(() => construirFlujo(nuevo)).toThrow(/ya trae/)
  })
  it('el constructor de la cadena (r80) deja escrito que la guarda ① se mantiene desde esta ronda', () => {
    const cab = fs.readFileSync(path.resolve(D, '../cadena/construir-ronda80-copia.mjs'), 'utf8').slice(0, 1800)
    expect(cab).toMatch(/BNXqlaX1oHSfZIpF\/construir-ensayo-sin-manual/)
  })
  it('«⑤ Seco» y «④» dejan DICHO que el manual fue simulado: solo en ese caso (la fila real no cambia de forma)', () => {
    const c4 = nuevo.nodes.find((n) => n.name === '④ Chequeos')!.parameters.jsCode as string
    expect(c4).toMatch(/c\.manual_de_ensayo === true \? \{ manual_de_ensayo: true \} : \{\}/)
    const c5 = nuevo.nodes.find((n) => n.name === '⑤ Seco · lo que se habría escrito')!.parameters.jsCode as string
    expect(c5).toMatch(/manual_de_ensayo: !!\(f\.provenance_tag && f\.provenance_tag\.manual_de_ensayo === true\)/)
  })
  it('no lleva llaves pegadas y conserva los saltos de línea del nodo vivo', () => {
    expect(JSON.stringify(nuevo)).not.toMatch(/sk-[A-Za-z0-9]{10,}|eyJ[A-Za-z0-9_-]{20,}/)
    const v = antes.nodes.find((n) => n.name === GUARDA)!.parameters.jsCode as string
    const CRLF = String.fromCharCode(13, 10)
    expect(codigo.includes(CRLF)).toBe(v.includes(CRLF))
  })
})
