/**
 * EL ENSAYO DE LA PLANEACIÓN SIN MANUAL (CC#1 · 20-oct · tramo 5 del ensayo de punta a punta). US$ 0.
 * Se EJECUTA el texto de la guarda «① GUARDA» del flujo preparado: solo `dry_run === true` (booleano exacto) y solo si el cliente no tiene NINGUNA fila de manual sigue con un manual simulado en memoria.
 * Lo real sin manual, el manual que existe y no pasó la vara, y el dry_run que no es booleano siguen deteniendo. Y SOLO cambia ese nodo respecto del flujo vivo.
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const D = path.resolve(__dirname, '../scripts/worker-staging/X9F0zp6LQ2xGEYVS')
const leer = (f: string) => JSON.parse(fs.readFileSync(path.join(D, f), 'utf8')) as { nodes: Array<{ name: string; type: string; parameters: Record<string, any> }>; connections: unknown }
const vivo = leer('planeacion-ARREGLADO-icp-2026-10-19.json')
const nuevo = leer('planeacion-ARREGLADO-ensayo-sin-manual-2026-10-20.json')
const GUARDA = '① GUARDA · sin manual aprobado se DETIENE'
const codigo = nuevo.nodes.find((n) => n.name === GUARDA)!.parameters.jsCode as string

function correr(entrada: unknown[], body: Record<string, unknown>) {
  const items = entrada.map((json) => ({ json }))
  const $ = (n: string) => { if (n !== 'Webhook · planeacion') throw new Error('nodo no ejecutado: ' + n); return { first: () => ({ json: { body } }), all: () => [{ json: { body } }] } }
  return new Function('$input', '$', '$env', '$workflow', '$execution', codigo)({ first: () => items[0], all: () => items }, $, {}, { id: 'WF' }, { id: 'EX' })
}
const fila = (extra: Record<string, unknown> = {}) => ({ id: 'm1', client_id: 'c-1', gate_outcome: 'paso_la_vara', created_at: '2026-10-10', ...extra })

describe('la guarda ① con el ensayo sin manual', () => {
  it('ensayo (dry_run === true) y NINGUNA fila de manual: sigue con un manual simulado, rotulado, que no se hace pasar por aprobado', () => {
    const [{ json }] = correr([], { client_id: 'c-1', dry_run: true })
    expect(json).toMatchObject({ client_id: 'c-1', manual_id: 'ensayo-sin-manual', manual_aprobado: false, manual_de_ensayo: true })
    expect(json.registro_del_manual.registro).toBe('sin_dato') // no inventa el trato: el país de la ficha lo decide más adelante
    expect(json.identidad_del_manual).toEqual({ primary_colors: null, typography: null })
  })
  it('lo real sin manual SIGUE deteniendo (dry_run ausente o false)', () => {
    expect(() => correr([], { client_id: 'c-1' })).toThrow(/PLANEACION_SIN_MANUAL/)
    expect(() => correr([], { client_id: 'c-1', dry_run: false })).toThrow(/PLANEACION_SIN_MANUAL/)
  })
  it('un dry_run que no es booleano sigue deteniendo ANTES de todo, también sin manual', () => {
    for (const raro of ['true', 1, null, 'false']) expect(() => correr([], { client_id: 'c-1', dry_run: raro }), String(raro)).toThrow(/PLANEACION_DRY_RUN_INVALIDO/)
  })
  it('un manual que EXISTE y no pasó la vara detiene, también en ensayo (solo la ausencia total se ensaya)', () => {
    expect(() => correr([fila({ gate_outcome: 'salio_al_tope' })], { client_id: 'c-1', dry_run: true })).toThrow(/PLANEACION_MANUAL_NO_APROBADO/)
    expect(() => correr([fila({ gate_outcome: null })], { client_id: 'c-1' })).toThrow(/PLANEACION_MANUAL_NO_APROBADO/)
  })
  it('sin cliente detiene siempre', () => {
    expect(() => correr([], { dry_run: true })).toThrow(/PLANEACION_SIN_CLIENTE/)
  })
  it('con un manual aprobado todo queda igual que antes (también en ensayo): manual_aprobado:true y manual_de_ensayo:false', () => {
    for (const dry of [undefined, true, false]) {
      const [{ json }] = correr([fila({ voice_description: 'Voz cálida. Tutea siempre.' })], { client_id: 'c-1', ...(dry === undefined ? {} : { dry_run: dry }) })
      expect(json, String(dry)).toMatchObject({ manual_id: 'm1', manual_aprobado: true, manual_de_ensayo: false, registro_del_manual: { registro: 'tuteo' } })
    }
  })
})

describe('lo que cambia en el flujo: UN solo nodo', () => {
  it('solo «① GUARDA» difiere del flujo vivo; conexiones y nodos iguales', () => {
    expect(nuevo.nodes.map((n) => n.name)).toEqual(vivo.nodes.map((n) => n.name))
    const distintos = nuevo.nodes.filter((n, i) => JSON.stringify(n) !== JSON.stringify(vivo.nodes[i])).map((n) => n.name)
    expect(distintos).toEqual([GUARDA])
    expect(JSON.stringify(nuevo.connections)).toBe(JSON.stringify(vivo.connections))
  })
  it('conserva los saltos de línea del nodo vivo y no lleva llaves pegadas', () => {
    const v = vivo.nodes.find((n) => n.name === GUARDA)!.parameters.jsCode as string
    expect(codigo.includes('\r\n')).toBe(v.includes('\r\n'))
    expect(JSON.stringify(nuevo)).not.toMatch(/sk-[A-Za-z0-9]{10,}|eyJ[A-Za-z0-9_-]{20,}/)
  })
})
