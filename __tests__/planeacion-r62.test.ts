/**
 * Relevo 62 · la planeación: el registro del plan sale del manual del cliente. Se prueba el flujo CONSTRUIDO contra su foto ANTES (la del flujo vivo) y se EJECUTAN los nodos tocados con un `$` falso.
 * Sin n8n, sin red, sin modelo.
 */
import fs from 'node:fs'
import { describe, expect, it } from 'vitest'
import { construir, NODOS, COLUMNAS_NUEVAS, BIBLIOTECA } from '../scripts/worker-staging/X9F0zp6LQ2xGEYVS/construir-r62.mjs'

type Nodo = { name: string; type: string; parameters: Record<string, any> }
type Flujo = { name: string; nodes: Nodo[]; connections: unknown; settings: Record<string, unknown> }
const DIR = 'scripts/worker-staging/X9F0zp6LQ2xGEYVS'
const antes = JSON.parse(fs.readFileSync(`${DIR}/planeacion-antes-r62-2026-10-10.json`, 'utf8')) as Flujo
const nuevo = construir(antes) as Flujo
const de = (f: Flujo, n: string) => f.nodes.find((x) => x.name === n)!

describe('el flujo construido cambia SOLO tres nodos', () => {
  it('45 nodos antes y después; mismas conexiones; mismos ajustes (solo los permitidos); y solo difieren los tres nodos del registro', () => {
    expect(nuevo.nodes).toHaveLength(antes.nodes.length)
    expect(JSON.stringify(nuevo.connections)).toBe(JSON.stringify(antes.connections))
    expect(nuevo.settings).toEqual({ executionOrder: 'v1' })
    const distintos = antes.nodes.filter((n) => JSON.stringify(n) !== JSON.stringify(de(nuevo, n.name))).map((n) => n.name).sort()
    expect(distintos).toEqual([NODOS.cargar, NODOS.guarda, NODOS.redactor].sort())
    expect(antes.nodes.map((n) => n.name)).toEqual(nuevo.nodes.map((n) => n.name)) // mismo orden
  })
  it('el nodo que carga el manual pide las columnas de voz y conserva todo lo demás de su dirección', () => {
    const u = de(nuevo, NODOS.cargar).parameters.url as string
    expect(u).toContain(`select=id,client_id,gate_outcome,created_at,${COLUMNAS_NUEVAS}&`)
    expect(u.replace(`,${COLUMNAS_NUEVAS}`, '')).toBe(de(antes, NODOS.cargar).parameters.url)
  })
  it('sin llaves pegadas y sin nombres de cliente nuevos en lo que se agregó', () => {
    const j = JSON.stringify(nuevo)
    expect(j).not.toMatch(/sk-[A-Za-z0-9]{10,}|eyJ[A-Za-z0-9_-]{20,}/)
    const agregado = BIBLIOTECA.toLowerCase()
    for (const p of ['naufrago', 'náufrago', 'olon', 'guayaquil', 'ceviche', 'marisco']) expect(agregado.includes(p), p).toBe(false)
  })
  it('la construcción es determinista y no muta la foto ANTES', () => {
    const copia = JSON.stringify(antes)
    expect(JSON.stringify(construir(antes))).toBe(JSON.stringify(nuevo)); expect(JSON.stringify(antes)).toBe(copia)
  })
})

// ───────────────────────── ejecutar los nodos
function correr(codigo: string, o: { entrada?: unknown[]; nodos?: Record<string, unknown> }) {
  const items = (o.entrada ?? []).map((json) => ({ json }))
  const $ = (n: string) => { const v = (o.nodos ?? {})[n]; if (v === undefined) throw new Error('nodo no ejecutado: ' + n); return { first: () => ({ json: v }), all: () => [{ json: v }] } }
  return new Function('$input', '$', '$env', '$workflow', '$execution', codigo)({ first: () => items[0], all: () => items }, $, {}, { id: 'WF' }, { id: 'EX' })
}
const WEBHOOK = { body: { client_id: 'c-1' } }
const filaManual = (extra: Record<string, unknown> = {}) => ({ id: 'm1', client_id: 'c-1', gate_outcome: 'paso_la_vara', created_at: '2026-10-10', ...extra })

describe('«① GUARDA»: mismas guardas de siempre + el registro del manual', () => {
  const codigo = de(nuevo, NODOS.guarda).parameters.jsCode as string
  const nodos = { 'Webhook · planeacion': WEBHOOK }
  it('manual aprobado: devuelve lo de siempre (client_id, manual_id, manual_aprobado) MÁS `registro_del_manual`', () => {
    const [{ json }] = correr(codigo, { entrada: [filaManual({ voice_description: 'Voz cálida. Tutea siempre.' })], nodos })
    expect(json).toMatchObject({ client_id: 'c-1', manual_id: 'm1', manual_aprobado: true, registro_del_manual: { registro: 'tuteo', fuente: 'declarado_en_el_manual' } })
  })
  it('un manual que no dice nada del registro da `sin_dato` (no se inventa)', () => {
    const [{ json }] = correr(codigo, { entrada: [filaManual({ voice_description: 'Directa y cercana.' })], nodos })
    expect(json.registro_del_manual.registro).toBe('sin_dato')
  })
  it('se conservan las guardas: sin cliente, sin manual y manual no aprobado SE DETIENEN con el mismo error', () => {
    expect(() => correr(codigo, { entrada: [filaManual()], nodos: { 'Webhook · planeacion': { body: {} } } })).toThrow(/PLANEACION_SIN_CLIENTE/)
    expect(() => correr(codigo, { entrada: [], nodos })).toThrow(/PLANEACION_SIN_MANUAL/)
    expect(() => correr(codigo, { entrada: [filaManual({ gate_outcome: 'salio_al_tope' })], nodos })).toThrow(/PLANEACION_MANUAL_NO_APROBADO/)
    expect(() => correr(codigo, { entrada: [filaManual()], nodos: { 'Webhook · planeacion': { body: { client_id: 'c-1', dry_run: 'true' } } } })).toThrow(/PLANEACION_DRY_RUN_INVALIDO/)
  })
})

describe('«Redactor (B4)»: el pedido lleva el registro del cliente', () => {
  const codigo = de(nuevo, NODOS.redactor).parameters.jsCode as string
  const ent = (manual: Record<string, unknown>, ficha: Record<string, unknown>) => ({ manual, ficha, material: [], descartados: [], referencia: 'REF', casa: {}, plata: {} })
  const pedidoDe = (e: unknown) => { const [{ json }] = correr(codigo, { entrada: [e] }); return json as { pedido: string; registro_usado: { registro: string; fuente: string } } }

  it('manual que declara tuteo: el pedido trae el bloque, nombra tuteo y su fuente, y va ANTES de lo que se fue a buscar', () => {
    const j = pedidoDe(ent({ client_id: 'c', registro_del_manual: { registro: 'tuteo', fuente: 'declarado_en_el_manual', pruebas: ['«tutea»'] } }, { country: 'Argentina' }))
    expect(j.pedido).toContain('EL REGISTRO DE LA VOZ'); expect(j.pedido).toMatch(/Registro: tuteo/); expect(j.pedido).toContain('declarado_en_el_manual')
    expect(j.pedido.indexOf('EL REGISTRO DE LA VOZ')).toBeGreaterThan(j.pedido.indexOf('EL MANUAL DE MARCA APROBADO'))
    expect(j.pedido.indexOf('EL REGISTRO DE LA VOZ')).toBeLessThan(j.pedido.indexOf('LO QUE SE FUE A BUSCAR'))
    expect(j.registro_usado).toMatchObject({ registro: 'tuteo', fuente: 'declarado_en_el_manual' }) // el manual manda sobre el país (Argentina sería voseo)
  })
  it('manual mudo: rige el país de la ficha por omisión y se DICE que es omisión', () => {
    const j = pedidoDe(ent({ client_id: 'c', registro_del_manual: { registro: 'sin_dato', fuente: 'sin_dato', pruebas: [] } }, { country: 'Ecuador' }))
    expect(j.registro_usado).toMatchObject({ registro: 'tuteo', fuente: 'por_omision_del_pais_de_la_ficha' }); expect(j.pedido).toContain('por_omision_del_pais_de_la_ficha')
    expect(pedidoDe(ent({ registro_del_manual: { registro: 'sin_dato', fuente: 'sin_dato', pruebas: [] } }, { country: 'Uruguay' })).registro_usado.registro).toBe('voseo')
  })
  it('sin manual con registro y sin país conocido: el bloque manda NO inventar y declarar el hueco', () => {
    const j = pedidoDe(ent({}, {}))
    expect(j.registro_usado.registro).toBe('sin_dato'); expect(j.pedido).toMatch(/no fija el registro/i); expect(j.pedido).toMatch(/que asumimos/)
  })
  it('lo demás del pedido sigue igual: mismas secciones y mismas reglas (el bloque nuevo es lo único agregado)', () => {
    const e = ent({ client_id: 'c' }, { id: 'f', country: 'Ecuador' })
    const nuevoP = pedidoDe(e).pedido
    const [{ json: viejo }] = correr(de(antes, NODOS.redactor).parameters.jsCode as string, { entrada: [e] })
    const sinBloque = nuevoP.replace(/══════ EL REGISTRO DE LA VOZ ══════[\s\S]*?(?=══════ LO QUE SE FUE A BUSCAR)/, '')
    expect(sinBloque.replace(/"registro_del_manual"[^\n]*\n?/g, '')).toBe((viejo as { pedido: string }).pedido)
  })
  it('el voseo del PLAN que salió en la prueba (7 marcas) es lo que el bloque viene a evitar: las marcas se miden con la misma función', () => {
    const { marcasDeRegistro } = new Function(`${BIBLIOTECA}\nreturn { marcasDeRegistro }`)() as { marcasDeRegistro: (t: string) => { voseo: number; tuteo: number } }
    expect(marcasDeRegistro('CTA: «Pedí por WhatsApp». Vení y probá lo que querés').voseo).toBeGreaterThanOrEqual(4)
  })
})
