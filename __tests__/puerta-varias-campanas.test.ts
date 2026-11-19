/**
 * 19-nov · VARIAS CAMPAÑAS POR CLIENTE · entrega 2 · la PUERTA (`pBAp5Cx7R39U585i`) le pasa a la apertura qué campaña (`campana_id`) o la llave de la nueva · CC1 · US$ 0, sin red.
 * El respaldo ANTES es la puerta viva tal cual (19-nov, 48 nodos). Se ejecuta el código REAL de `⓪ Llave y origen` y la expresión REAL del cuerpo de `1 · Abrir campaña`.
 * Lo que fija: DESPUES = construir(ANTES) y solo cambian esos dos nodos; la llave pasa `llave_de_campana` (texto o null); el cuerpo de abrir lleva `campana_id` y `llave_de_campana`;
 * el sobre del reintento llega a la apertura con SU `campana_id`; sin esos campos, el cuerpo es el de siempre más tres null (campaña, llave y nombre).
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { construirPuerta, ANTES as RUTA_ANTES, DESPUES as RUTA_DESPUES, LLAVE_NUEVA, ABRIR_NUEVO } from '../scripts/worker-staging/cadena/construir-varias-campanas-puerta.mjs'
import { abrirCampana, sobreDeReintento } from '../src/lib/cadena/campanas'
import { AlmacenMemoria } from '../src/lib/cadena/__fixtures__/almacen-memoria'
import { clienteA, contextoDe } from '../src/lib/cadena/__fixtures__/clientes'

type Nodo = { name: string; parameters: Record<string, unknown> }
type Flujo = { id: string; nodes: Nodo[]; connections: unknown; settings: unknown }
const ANTES = JSON.parse(fs.readFileSync(RUTA_ANTES as string, 'utf8')) as Flujo
const DESPUES = JSON.parse(fs.readFileSync(RUTA_DESPUES as string, 'utf8')) as Flujo
const nodo = (f: Flujo, n: string) => f.nodes.find((x) => x.name === n)!
const CLIENTE = '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312'
const LLAVE_DE_DESPACHO = 'k'.repeat(40)

/** ejecuta el código del nodo ⓪ tal cual, con la llave de despacho correcta */
function llave(f: Flujo, body: Record<string, unknown>) {
  const code = String(nodo(f, '⓪ Llave y origen').parameters.jsCode)
  const $input = { first: () => ({ json: { headers: { 'x-sala-dispatch-key': LLAVE_DE_DESPACHO }, body } }) }
  return (new Function('$input', '$env', code)($input, { SALA_DISPATCH_KEY: LLAVE_DE_DESPACHO }) as Array<{ json: Record<string, unknown> }>)[0].json
}
/** evalúa la expresión n8n del cuerpo de «1 · Abrir campaña» con el `$json` que le llega (la salida de ⓪, pasada por los nodos «si») */
function cuerpoDeAbrir(f: Flujo, $json: Record<string, unknown>) {
  const expr = String(nodo(f, '1 · Abrir campaña').parameters.jsonBody)
  const m = /^=\{\{ ([\s\S]*) \}\}$/.exec(expr)
  if (!m) throw new Error('el cuerpo no es una expresión ={{ … }}')
  return JSON.parse(new Function('$json', '$workflow', '$execution', `return (${m[1]})`)($json, { id: 'wf-puerta' }, { id: 'ex-1' }))
}
const sobre = (extra: Record<string, unknown> = {}) => ({ client_id: CLIENTE, _journey_id: 'journey-1', dry_run: true, target_step_id: 'router.dispatch.planeacion/plan-listo.briefear', plan_id: 'plan-1', ...extra })

describe('puerta · varias campañas · el cambio', () => {
  it('🔴 el respaldo es la puerta (48 nodos) y DESPUES es exactamente construir(ANTES)', () => {
    expect(ANTES.id).toBe('pBAp5Cx7R39U585i')
    expect(ANTES.nodes).toHaveLength(48)
    expect(DESPUES).toEqual(construirPuerta(ANTES))
  })
  it('🔴 solo cambian «⓪ Llave y origen» y «1 · Abrir campaña»: conexiones, ajustes y los otros 46 nodos iguales', () => {
    const distintos = ANTES.nodes.filter((n, i) => JSON.stringify(n) !== JSON.stringify(DESPUES.nodes[i])).map((n) => n.name)
    expect(distintos).toEqual(['⓪ Llave y origen', '1 · Abrir campaña'])
    expect(DESPUES.connections).toEqual(ANTES.connections)
    expect(DESPUES.settings).toEqual(ANTES.settings)
    expect(String(nodo(DESPUES, '⓪ Llave y origen').parameters.jsCode)).toContain(LLAVE_NUEVA)
    expect(String(nodo(DESPUES, '1 · Abrir campaña').parameters.jsonBody)).toContain(ABRIR_NUEVO)
  })
  it('🔴 si la puerta viva cambió (el texto no está una vez), construir se niega', () => {
    const roto = structuredClone(ANTES)
    nodo(roto, '1 · Abrir campaña').parameters.jsonBody = String(nodo(roto, '1 · Abrir campaña').parameters.jsonBody).replace('seco: $json.dry_run,', 'seco: true,')
    expect(() => construirPuerta(roto)).toThrow(/1 · Abrir campaña: esperaba el texto una vez y está 0/)
    expect(() => construirPuerta(DESPUES)).toThrow(/esperaba el texto una vez/) // ya aplicado: no se aplica dos veces
  })
})

describe('puerta · varias campañas · lo que llega a la apertura', () => {
  it('🔴 con llave y nombre: la llave los pasa y el cuerpo de abrir los lleva', () => {
    const s = llave(DESPUES, sobre({ llave_de_campana: 'prueba-conjunta-2026-11-19', nombre_de_campana: 'Prueba conjunta' }))
    expect(s.llave_de_campana).toBe('prueba-conjunta-2026-11-19')
    expect(s.nombre_de_campana).toBe('Prueba conjunta')
    expect(cuerpoDeAbrir(DESPUES, s)).toMatchObject({ accion: 'abrir', client_id: CLIENTE, plan_id: 'plan-1', llave_de_campana: 'prueba-conjunta-2026-11-19', nombre_de_campana: 'Prueba conjunta', campana_id: null, seco: true })
  })
  it('🔴 una llave o un nombre que no es texto llega como null (la apertura nunca recibe un número u objeto)', () => {
    for (const v of [7, { a: 1 }, ['k'], true]) {
      expect(llave(DESPUES, sobre({ llave_de_campana: v })).llave_de_campana, JSON.stringify(v)).toBeNull()
      expect(llave(DESPUES, sobre({ nombre_de_campana: v })).nombre_de_campana, JSON.stringify(v)).toBeNull()
    }
  })
  it('🔴 sin campos nuevos: el cuerpo es el de antes más tres null', () => {
    const antes = cuerpoDeAbrir(ANTES, llave(ANTES, sobre()))
    const despues = cuerpoDeAbrir(DESPUES, llave(DESPUES, sobre()))
    expect(despues).toEqual({ ...antes, campana_id: null, llave_de_campana: null, nombre_de_campana: null })
    expect(antes).not.toHaveProperty('campana_id') // hoy la puerta lo perdía
  })
  it('🔴 el sobre del REINTENTO llega a la apertura con su campana_id, y la apertura retoma ESA campaña', async () => {
    const A = { ...clienteA(), clientId: CLIENTE }
    const al = new AlmacenMemoria({ contextos: { [CLIENTE]: contextoDe(A) }, planes: { [CLIENTE]: [{ plan_id: 'plan-1', fecha: '2026-10-08' }] }, config: { flujos: ['wf-puerta'], puerta_workflow_id: 'wf-puerta' }, journeys: [{ journeyId: 'journey-1', clientId: CLIENTE }] })
    const abierta = await abrirCampana(al, { client_id: CLIENTE, seco: true, workflow_id: 'wf-puerta', workflow_execution_id: 'ex-0' }, '2026-10-12T12:00:00Z')
    const id = (abierta.cuerpo.campana as { id: string }).id
    const s = sobreDeReintento(al.campanas[0], '2026-10-12:am')
    const cuerpo = cuerpoDeAbrir(DESPUES, llave(DESPUES, { ...s.payload, client_id: CLIENTE, _journey_id: 'journey-1', target_step_id: 'router.dispatch.planeacion/plan-listo.briefear' }))
    expect(cuerpo.campana_id).toBe(id)
    const r = await abrirCampana(al, cuerpo, '2026-10-12T13:00:00Z')
    expect(r.cuerpo).toMatchObject({ ya_abierta: true })
    expect((r.cuerpo.campana as { id: string }).id).toBe(id)
  })
})
