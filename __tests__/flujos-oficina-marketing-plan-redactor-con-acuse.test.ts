/**
 * 05-nov · doble chequeo: el redactor con acuse, espera de 45 min, siempre forzado, plazo que no corta la vuelta que recoge, y sin plan no se da por entregado. Todo en seco (US$ 0).
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { CODIGO_ACUSE, CODIGO_PARAR, ESPERA_S, N_ACUSE, N_BRIEF_SI, N_CERRAR, N_PARAR, N_SI_RECHAZO, construirRedactorConAcuse } from '../scripts/ops/oficina-marketing/plan-redactor-con-acuse.mjs'

type Nodo = { name: string; type: string; parameters: Record<string, any> }
type Flujo = { nodes: Nodo[]; connections: Record<string, any> }
const J = JSON.parse(readFileSync(join(process.cwd(), 'scripts/ops/oficina-marketing/aplicado/X9F0zp6LQ2xGEYVS-redactor-con-acuse-ANTES-2026-11-05.json'), 'utf8'))
const base = () => structuredClone(J.workflow || J) as Flujo
const hecho = () => { const f = base(); construirRedactorConAcuse(f); return f }
const nodo = (f: Flujo, n: string) => f.nodes.find((x) => x.name === n) as Nodo
const cod = (f: Flujo, n: string) => nodo(f, n).parameters.jsCode as string
const SOBRE = { client_id: 'c1', corrida: 'r1' }
const sel = (mapa: Record<string, any>) => (n: string) => {
  if (!(n in mapa)) throw new Error('no corrió: ' + n)
  return { first: () => ({ json: mapa[n] }), last: () => ({ json: mapa[n] }), all: () => [{ json: mapa[n] }] }
}
const acuse = (r: unknown, sobre: Record<string, unknown> = SOBRE) => new Function('$', '$input', CODIGO_ACUSE)(sel({ 'Webhook · planeacion': { body: sobre } }), { first: () => ({ json: r }) })[0].json
const destinos = (c: Record<string, any>, n: string, salida = 0) => (c[n].main[salida] ?? []).map((x: any) => x.node)

describe('el pedido al redactor mira la respuesta', () => {
  it('aceptado: sigue a la espera', () => { expect(acuse({ accepted: true, ack_timestamp: 't' })).toMatchObject({ redactor_rechazado: false, ack_timestamp: 't' }) })
  it('aceptado manda, aunque la respuesta traiga además un error', () => { expect(acuse({ accepted: true, error: 'x' }).redactor_rechazado).toBe(false) })
  it('rechazo con texto o success:false: para y cierra como fallida, con motivo', () => {
    for (const r of [{ success: false, error: 'x' }, { error: 'forbidden' }, { success: false }]) {
      const s = acuse(r)
      expect(s.redactor_rechazado).toBe(true)
      expect(s.cuerpo).toMatchObject({ accion: 'cerrar', client_id: 'c1', corrida: 'r1', estado: 'fallida' })
      expect(s.cuerpo.motivo.length).toBeGreaterThan(10)
    }
  })
  it('el freno de gasto lo dice en palabras simples', () => { expect(acuse({ error: 'cost_cap_exceeded', code: 'E-CAP-150' }).motivo).toMatch(/freno de gasto/) })
  it('dudoso (conexión cortada, sin campos): NO para, el empleado pudo arrancar', () => {
    for (const r of [{ error: { message: 'socket hang up' } }, {}, { data: '<html>' }]) expect(acuse(r).redactor_rechazado).toBe(false)
  })
  it('sin corrida en el sobre, no pretende cerrarla', () => { expect(acuse({ error: 'x' }, {}).aplica).toBe(false) })
  it('en ensayo no para', () => { expect(acuse({ error: 'x' }, { ...SOBRE, dry_run: true }).redactor_rechazado).toBe(false) })
  it('parar lanza en rojo y usa la última pasada, por los reintentos', () => {
    expect(CODIGO_PARAR).toContain('.last().json')
    expect(() => new Function('$', '$input', CODIGO_PARAR)(sel({ [N_ACUSE]: { aplica: true, motivo: 'm', detalle: 'd' } }), { first: () => ({ json: { statusCode: 200 } }) })).toThrow(/PLAN_REDACTOR_RECHAZADO · m/)
  })
  it('el cableado: pedir → acuse → ¿rechazaron? → cerrar → parar en rojo; si no, a la espera', () => {
    const c = hecho().connections
    expect(destinos(c, 'Pedir el plan al redactor')).toEqual([N_ACUSE])
    expect(destinos(c, N_ACUSE)).toEqual([N_SI_RECHAZO])
    expect(destinos(c, N_SI_RECHAZO, 0)).toEqual([N_CERRAR])
    expect(destinos(c, N_SI_RECHAZO, 1)).toEqual(['Esperar al redactor'])
    expect(destinos(c, N_CERRAR)).toEqual([N_PARAR])
  })
  it('cerrar usa la misma ruta que V9 y manda el cuerpo armado, con la llave', () => {
    const f = hecho(); const n = nodo(f, N_CERRAR)
    expect(n.parameters.url).toBe(nodo(f, 'V9 · cerrar la corrida').parameters.url)
    expect(n.parameters.jsonBody).toBe('={{ JSON.stringify($json.cuerpo) }}')
    expect(JSON.stringify(n.parameters.headerParameters)).toContain('INTERNAL_API_KEY')
  })
})

describe('espera y reuso', () => {
  it('la espera baja de 24 h a 45 min', () => {
    expect(nodo(base(), 'Esperar al redactor').parameters.resumeAmount).toBe(86400)
    expect(nodo(hecho(), 'Esperar al redactor').parameters.resumeAmount).toBe(ESPERA_S)
    expect(ESPERA_S).toBe(2700)
  })
  it('el redactor siempre se fuerza, y el resto del pedido no cambia', () => {
    const antes = nodo(base(), 'Pedir el plan al redactor').parameters.jsonBody as string
    const ahora = nodo(hecho(), 'Pedir el plan al redactor').parameters.jsonBody as string
    expect(ahora).toContain('force_restart: true }) }}')
    expect(ahora.split('force_restart')).toHaveLength(2)
    expect(ahora.slice(0, ahora.indexOf('force_restart'))).toBe(antes.slice(0, antes.indexOf('force_restart')))
  })
})

const Async = Object.getPrototypeOf(async function () {}).constructor
const decidir = (f: Flujo, n: string, b: Record<string, unknown>, t0: number, vuelta = 3) => {
  const m = { 'MESA · armar la semilla': { t0 }, 'FIN · armar la semilla': { t0 }, 'FIN2 · armar la semilla': { t0 }, 'MESA · decidir': { encargo_id: 'e' }, 'FIN · decidir': { encargo_id: 'e' }, 'FIN2 · decidir': { encargo_id: 'e' }, 'MESA · preparar la devolución': { encargo_id: 'e', t0 } }
  return new Async('$', '$input', '$runIndex', cod(f, n))(sel(m), { first: () => ({ json: { statusCode: 200, body: b } }) }, vuelta)
}
describe('el plazo no corta la vuelta que recoge lo pagado', () => {
  const VENCIDO = Date.now() - 3 * 3_600_000
  const casos: Array<[string, string, string]> = [['MESA · decidir', 'mesa-estrategia-consolida', 'mesa-estrategia-redes'], ['MESA · decidir la devolución', 'mesa-estrategia-consolida', 'mesa-estrategia-redes'], ['FIN · decidir', 'cierre', 'fpa'], ['FIN2 · decidir', 'cierre_2', 'fpa']]
  for (const [n, cierra, otro] of casos) {
    it(n + ': tras el turno que cierra sigue; tras otro, vence; antes del arreglo vencía', async () => {
      const f = hecho()
      expect((await decidir(f, n, { paso: cierra, terminado: false }, VENCIDO))[0].json.fin).toBe(false)
      expect((await decidir(f, n, { paso: otro, terminado: false }, VENCIDO))[0].json.fin).toBe(true)
      expect((await decidir(base(), n, { paso: cierra, terminado: false }, VENCIDO))[0].json.fin).toBe(true)
    })
  }
  it('el tope de pasos sigue cortando aunque sea el turno que cierra', async () => {
    for (const [n, cierra] of casos) expect((await decidir(hecho(), n, { paso: cierra, terminado: false }, Date.now(), 99))[0].json.fin, n).toBe(true)
  })
  it('dentro del plazo no cambia nada', async () => { expect((await decidir(hecho(), 'MESA · decidir', { paso: 'mesa-estrategia-redes', terminado: false }, Date.now()))[0].json.fin).toBe(false) })
})

describe('sin plan no se da por entregado', () => {
  const v9 = (m: Record<string, any>) => new Function('$', cod(hecho(), 'V9 · armar el cierre'))(sel({ 'Webhook · planeacion': { body: { plan_v3: true, ...SOBRE } }, ...m }))[0].json
  it('sin vuelta: V9 no cierra', () => { expect(v9({ '¿Llegó la vuelta?': { llego_la_vuelta: false } })).toEqual({ aplica: false }) })
  it('con vuelta: cierra hecha', () => { expect(v9({ '¿Llegó la vuelta?': { llego_la_vuelta: true } }).cuerpo).toMatchObject({ estado: 'hecha', motivo: 'plan entregado' }) })
  it('sin haber pasado por el redactor (repetida): cierra como hoy', () => { expect(v9({ 'Cable · ¿volvió? · repetida': {} }).cuerpo.estado).toBe('fallida') })
  it('sin plan no se pide el parte; con plan sí; V9 sigue conectado', () => {
    const c = hecho().connections
    expect(destinos(c, 'Cable · ¿volvió? · plan')).toEqual([N_BRIEF_SI, 'V9 · armar el cierre'])
    expect(destinos(c, N_BRIEF_SI, 1)).toEqual(['BRIEF · sobre · pedir el parte a la sala (E-brief · CC#2)'])
    expect(destinos(c, N_BRIEF_SI, 0)).toEqual([])
  })
})

describe('el conjunto', () => {
  it('todos los nodos de código compilan', () => {
    for (const n of hecho().nodes.filter((x) => x.type.endsWith('.code') && x.parameters.jsCode)) expect(() => new Async('$', '$input', '$json', '$node', '$items', '$runIndex', '$workflow', '$execution', '$env', n.parameters.jsCode), n.name).not.toThrow()
  })
  it('solo cambian los nodos declarados', () => {
    const a = new Map(base().nodes.map((n) => [n.name, JSON.stringify(n)]))
    const f = hecho()
    expect(f.nodes.filter((n) => a.has(n.name) && a.get(n.name) !== JSON.stringify(n)).map((n) => n.name).sort()).toEqual(['Esperar al redactor', 'FIN · decidir', 'FIN2 · decidir', 'MESA · decidir', 'MESA · decidir la devolución', 'Pedir el plan al redactor', 'V9 · armar el cierre'].sort())
    expect(f.nodes.filter((n) => !a.has(n.name)).map((n) => n.name).sort()).toEqual([N_ACUSE, N_SI_RECHAZO, N_CERRAR, N_PARAR, N_BRIEF_SI].sort())
  })
  it('si el nodo cambió de forma, se detiene en vez de aplicar a ciegas', () => {
    const f = base(); nodo(f, 'Pedir el plan al redactor').parameters.jsonBody = '={{ 1 }}'
    expect(() => construirRedactorConAcuse(f)).toThrow(/cambió de forma/)
    const g = base(); nodo(g, 'Esperar al redactor').parameters.resumeAmount = 60
    expect(() => construirRedactorConAcuse(g)).toThrow(/cambió de forma/)
  })
  it('se aplica una sola vez', () => { const f = hecho(); expect(() => construirRedactorConAcuse(f)).toThrow() })
})
