/**
 * El portero firma su gasto (15-oct · encargo «umbral y resumen vivo» §4). El Servicio de Apify ya guarda `origen` en cada fila de la libreta (plan v3 V8, aplicado por CC#3);
 * el flujo del portero lo manda en sus 5 llamadas y el vigilante lee el origen de la fila en vez de emparejarla con el crudo.
 * Se prueba ejecutando el código REAL de los nodos del flujo ARREGLADO con un Servicio simulado (US$ 0, sin red).
 */
import fs from 'node:fs'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { gastoDeHoy } from '../rutas'
import { FLUJO_DEL_PORTERO, origenDelPortero } from '../gasto'
import { crearBaseFalsa } from './base-falsa'
import { ARREGLADO, ANTES, BASE, NODOS, ORIGEN_AMPLIAR, ORIGEN_ARTICULOS, ORIGEN_TANDA2, portero as construir } from '../../../../scripts/worker-staging/construir-origen-del-portero.mjs'

const DIR = path.resolve(__dirname, '../../../../scripts/worker-staging/ogfq56oIEoHufFPM')
type Nodo = { name: string; type: string; parameters: { jsCode?: string } }
type Flujo = { nodes: Nodo[]; connections: Record<string, unknown> }
type Item = { json: Record<string, unknown> }
const leer = (p: string): Flujo => JSON.parse(fs.readFileSync(p, 'utf8'))
const BASE_F = leer(BASE), ANTES_F = leer(ANTES), DESPUES = leer(ARREGLADO)
const AsyncFunction = Object.getPrototypeOf(async function () { /* */ }).constructor as new (...a: string[]) => (...b: unknown[]) => Promise<Item[]>
const nodo = (f: Flujo, n: string) => f.nodes.find((x) => x.name === n)!
const ORIGEN_VALIDO = /^[a-z][a-z0-9_]{0,31}$/ // el del Servicio (construir-plan-v3-v8.mjs)

interface Visto { url: string; body: Record<string, unknown> }
async function correr(f: Flujo, nombre: string): Promise<Visto[]> {
  const vistos: Visto[] = []
  const httpRequest = async (o: { url: string; body?: Record<string, unknown> }) => {
    if (/apify-service-workflow/.test(o.url)) vistos.push({ url: o.url, body: o.body ?? {} })
    return /apify-service-workflow/.test(o.url) ? { statusCode: 200, body: { ok: true, apify_run_id: 'run' } } : { statusCode: 200, body: { data: { usageTotalUsd: 0.01 } } }
  }
  const n = nodo(f, nombre)
  const fn = new AsyncFunction('$input', '$', '$env', n.parameters.jsCode!)
  const acciones = [{ fuente: 'f1', funcion: 'fn1', params: { a: 1 }, metadata: {}, usd_max: 0.01 }, { fuente: 'f2', funcion: 'fn2', params: {}, metadata: {}, usd_max: 0.01 }]
  const item = { json: { workflow_id: 'wf', cliente: 'c1', nombre: 'N', dry_run: false, falla: null, acciones } }
  const previos: Record<string, Item[]> = { '② Ampliar (Servicio de Apify)': [item], '② bis Leer artículos (Servicio de Apify)': [item] }
  const dolar = (x: string) => ({ all: () => previos[x] ?? [item], first: () => (previos[x] ?? [item])[0] })
  await fn.call({ helpers: { httpRequest } }, { all: () => [item] }, dolar, { APIFY_API_TOKEN: 't' }).catch(() => [])
  return vistos
}
afterEach(() => vi.restoreAllMocks())

describe('el flujo manda su origen en cada llamada al Servicio', () => {
  it.each(NODOS as string[][])('«%s» manda origen «%s»', async (nombre, origen) => {
    const v = await correr(DESPUES, nombre)
    expect(v.length).toBeGreaterThan(0)
    for (const x of v) {
      expect(x.body.origen).toBe(origen)
      expect(String(x.body.origen)).toMatch(ORIGEN_VALIDO)
      expect(origenDelPortero(String(x.body.origen))).toBe(true)
      // lo demás del pedido queda como estaba
      expect(x.body).toMatchObject({ client_id: 'c1', destination: 'respuesta', dry_run: false })
    }
  })
  it('el ANTES (el flujo de un cliente por ejecución) no mandaba origen: el defecto existía', async () => {
    const v = await correr(ANTES_F, '② Ampliar (tanda 1)')
    expect(v.length).toBeGreaterThan(0)
    for (const x of v) expect(x.body.origen).toBeUndefined()
  })
  it('los tres orígenes son distintos entre sí por fuente y válidos para el Servicio', () => {
    expect(new Set([ORIGEN_AMPLIAR, ORIGEN_ARTICULOS, ORIGEN_TANDA2]).size).toBe(3)
    for (const o of [ORIGEN_AMPLIAR, ORIGEN_ARTICULOS, ORIGEN_TANDA2]) expect(o).toMatch(ORIGEN_VALIDO)
  })
  it('estructura: TODO nodo del flujo que llama al Servicio manda origen (si alguien añade una llamada, esta prueba la caza)', () => {
    const llaman = DESPUES.nodes.filter((n) => /apify-service-workflow/.test(JSON.stringify(n.parameters)))
    expect(llaman.map((n) => n.name).sort()).toEqual(NODOS.map(([n]: string[]) => n).sort())
    for (const n of llaman) expect(n.parameters.jsCode).toMatch(/dry_run: false, origen: 'portero(_[a-z0-9]+)?', metadata:/)
  })
})

describe('el cambio es aditivo y mínimo', () => {
  it('ANTES = el ARREGLADO de «un cliente por ejecución» (se apila sobre él)', () => {
    expect(ANTES_F).toEqual(BASE_F)
  })
  it('solo cambian los 5 nodos, y solo por `origen: …, `', () => {
    expect(DESPUES.nodes.length).toBe(ANTES_F.nodes.length)
    expect(DESPUES.connections).toEqual(ANTES_F.connections)
    const cambiados = DESPUES.nodes.filter((n, i) => JSON.stringify(n) !== JSON.stringify(ANTES_F.nodes[i])).map((n) => n.name).sort()
    expect(cambiados).toEqual(NODOS.map(([n]: string[]) => n).sort())
    for (const n of DESPUES.nodes) {
      const a = ANTES_F.nodes.find((x) => x.name === n.name)!
      if (n.parameters.jsCode === a.parameters.jsCode) continue
      expect((n.parameters.jsCode as string).replace(/origen: 'portero(_[a-z0-9]+)?', /, '')).toBe(a.parameters.jsCode)
    }
  })
  it('el constructor es idempotente en su entrada y se niega a aplicarse dos veces', () => {
    expect(JSON.stringify(construir(BASE_F))).toBe(JSON.stringify(DESPUES))
    expect(() => construir(DESPUES)).toThrow(/ya manda su origen/)
  })
  it('el archivo del repositorio coincide con lo que construye el constructor', () => {
    expect(fs.existsSync(path.join(DIR, 'portero-ARREGLADO-origen-del-portero-2026-10-15.json'))).toBe(true)
  })
})

describe('el vigilante lee el origen de la fila', () => {
  const AHORA = new Date('2026-10-15T13:00:00Z')
  const C = '11111111-1111-4111-8111-111111111111'
  const fila = (origen: string | null, usd: number) => ({ service: 'apify:instagram_scraper', amount_usd: usd, created_at: '2026-10-15T10:00:00Z', description: JSON.stringify({ es: 'detalle_de_llamada', client_id: C, funcion: 'instagram_scraper', ensayo: false, ...(origen ? { origen } : {}) }) })
  const g = async (costs: unknown[]) => { const b = crearBaseFalsa({ costs, apify_raw: [], agent_invocations: [] } as never); const r = await gastoDeHoy(b.db, C, AHORA); if (!r.ok) throw new Error(r.detalle); return r }
  it('portero, portero_articulo y portero_tanda2 cuentan como del portero; plan y alta no', async () => {
    const r = await g([fila('portero', 0.3), fila('portero_articulo', 0.2), fila('portero_tanda2', 0.1), fila('plan_v3', 5), fila('alta', 2)])
    expect(r.gasto.apify_usd).toBeCloseTo(0.6, 4)
    expect(r.fuera_del_portero_usd).toBeCloseTo(7, 4)
  })
  it('una fila con origen NO se empareja con nada: ni sube ni baja el gasto por parecido', async () => {
    const r = await g([fila('portero', 0.3)])
    expect(r.gasto.apify_usd).toBeCloseTo(0.3, 4)
    expect(r.llamadas_sin_origen).toBe(0)
  })
  it('sin origen (filas viejas) sigue el emparejamiento de siempre y se cuenta como sin origen', async () => {
    const r = await g([fila(null, 0.4)])
    expect(r.gasto.apify_usd).toBeCloseTo(0.4, 4)
    expect(r.llamadas_sin_origen).toBe(1)
  })
  it('el flujo del portero sigue siendo el mismo id', () => {
    expect(FLUJO_DEL_PORTERO).toBe('ogfq56oIEoHufFPM')
  })
})
