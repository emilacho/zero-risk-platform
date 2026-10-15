/**
 * Mejora 1 (15-oct) · una ejecución de n8n por cliente. Se ejecuta el código REAL de los nodos del flujo ARREGLADO con un reloj y un n8n simulados:
 *   · con 1, 10 y 50 clientes: una ejecución por cliente, la del horario termina en segundos y no pierde a nadie aunque falle un reparto;
 *   · el vigilante de cada ejecución mira solo a su cliente; el reintento ocurre una vez y nunca en bucle.
 * US$ 0 · sin red · agnóstico (los clientes son ids, el rubro no entra).
 */
import fs from 'node:fs'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

const DIR = path.resolve(__dirname, '../../../../scripts/worker-staging/ogfq56oIEoHufFPM')
const leer = (f: string) => JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'))
const ANTES = leer('portero-ANTES-un-cliente-por-ejecucion-2026-10-15.json')
const DESPUES = leer('portero-ARREGLADO-un-cliente-por-ejecucion-2026-10-15.json')
type Nodo = { name: string; type: string; parameters: { jsCode?: string; jsonBody?: string; path?: string } }
type Item = { json: Record<string, unknown> }
const AsyncFunction = Object.getPrototypeOf(async function () { /* */ }).constructor as new (...a: string[]) => (...b: unknown[]) => Promise<Item[]>
const nodo = (f: { nodes: Nodo[] }, n: string) => f.nodes.find((x) => x.name === n)!
const REPARTIR = '① Repartir (una ejecución por cliente)'
const ENTRADA = '⓪ Entrada'
const WEBHOOK = 'Webhook · un cliente (llave interna)'
const UUID = (i: number) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`
const KEY = 'llave-interna-de-prueba'

function entorno(opciones: { fallanLosClientes?: Set<string>; arranque?: number } = {}) {
  let reloj = opciones.arranque ?? 5_000_000
  const posts: Array<{ url: string; client_id: string; reintento?: boolean; llave: string }> = []
  vi.spyOn(Date, 'now').mockImplementation(() => reloj)
  vi.spyOn(globalThis, 'setTimeout').mockImplementation(((fn: () => void, ms?: number) => { reloj += ms ?? 0; fn(); return 0 as never }) as never)
  const httpRequest = async (o: { url: string; body: { client_id: string; reintento?: boolean }; headers: Record<string, string> }) => {
    posts.push({ url: o.url, client_id: o.body.client_id, reintento: o.body.reintento, llave: o.headers['x-api-key'] })
    reloj += 150
    if (opciones.fallanLosClientes?.has(o.body.client_id)) return { statusCode: 500, body: {} }
    return { statusCode: 200, body: { message: 'Workflow was started' } }
  }
  return { posts, httpRequest, ahora: () => reloj }
}
async function correr(n: Nodo, o: { entrada?: Record<string, unknown>; items?: Item[]; http?: unknown; nodos?: Record<string, Item[]>; env?: Record<string, string> }): Promise<Item[]> {
  const f = new AsyncFunction('$input', '$', '$env', '$workflow', '$execution', n.parameters.jsCode!)
  const dolar = (nombre: string) => {
    if (nombre === ENTRADA && o.entrada) return { first: () => ({ json: o.entrada }), all: () => [{ json: o.entrada }] }
    const x = o.nodos?.[nombre]
    if (!x) return { first: () => { throw new Error('node ' + nombre + ' no ejecutado') }, all: () => { throw new Error('no ejecutado') } }
    return { first: () => x[0], all: () => x }
  }
  return f.call({ helpers: { httpRequest: o.http } }, { all: () => o.items ?? [], first: () => (o.items ?? [])[0] }, dolar, { INTERNAL_API_KEY: KEY, ...(o.env ?? {}) }, { id: 'ogfq56oIEoHufFPM' }, { id: '777' })
}
afterEach(() => vi.restoreAllMocks())

const horario = { workflow_id: 'ogfq56oIEoHufFPM', workflow_execution_id: '1001', via: 'horario', dry_run: false, client_id: null }
const elementos = (k: number): Item[] => Array.from({ length: k }, (_v, i) => ({ json: { ...horario, cliente: UUID(i + 1), nombre: 'C' + (i + 1), acciones: [], falla: null } }))

describe.each([1, 10, 50])('el reparto con %i cliente(s)', (k) => {
  it('una ejecución por cliente: un POST por cliente, con la llave interna; la del horario termina sin elementos y en segundos', async () => {
    const m = entorno()
    const t0 = m.ahora()
    const sal = await correr(nodo(DESPUES, REPARTIR), { entrada: horario, items: elementos(k), http: m.httpRequest })
    expect(sal).toEqual([])
    expect(m.posts).toHaveLength(k)
    expect(new Set(m.posts.map((p) => p.client_id)).size).toBe(k)
    for (const p of m.posts) { expect(p.url).toMatch(/\/webhook\/zero-risk\/cerebro-diario-un-cliente$/); expect(p.llave).toBe(KEY); expect(p.reintento).toBeUndefined() }
    expect(m.ahora() - t0).toBeLessThan(120_000) // dentro del límite de un nodo de código aunque sean 50
  })
})

describe('el reparto no pierde a nadie ni cambia lo demás', () => {
  it('un POST que falla deja a ESE cliente en la ejecución del horario (los demás se reparten)', async () => {
    const m = entorno({ fallanLosClientes: new Set([UUID(3)]) })
    const sal = await correr(nodo(DESPUES, REPARTIR), { entrada: horario, items: elementos(5), http: m.httpRequest })
    expect(sal.map((s) => s.json.cliente)).toEqual([UUID(3)])
    expect(m.posts).toHaveLength(5)
  })
  it('una excepción de red también cuenta como fallo de reparto', async () => {
    entorno()
    const http = async () => { throw new Error('ECONNRESET') }
    const sal = await correr(nodo(DESPUES, REPARTIR), { entrada: horario, items: elementos(2), http })
    expect(sal).toHaveLength(2)
  })
  it('a mano, en seco, despertar o un cliente: pasa SIN cambio y no llama a nadie', async () => {
    for (const e of [{ ...horario, via: 'mano' }, { ...horario, via: 'despertar', client_id: UUID(1) }, { ...horario, via: 'cliente', client_id: UUID(1) }, { ...horario, dry_run: true }]) {
      const m = entorno()
      const items = elementos(3)
      const sal = await correr(nodo(DESPUES, REPARTIR), { entrada: e, items, http: m.httpRequest })
      expect(sal).toEqual(items)
      expect(m.posts).toHaveLength(0)
      vi.restoreAllMocks()
    }
  })
  it('si el plan falló o no hay clientes, pasa sin cambio (el cierre y el vigilante lo dicen)', async () => {
    const m = entorno()
    const falla: Item[] = [{ json: { ...horario, cliente: null, falla: 'El plan falló: x' } }]
    expect(await correr(nodo(DESPUES, REPARTIR), { entrada: horario, items: falla, http: m.httpRequest })).toEqual(falla)
    const vacio: Item[] = [{ json: { ...horario, cliente: null, falla: null, sin_clientes: true } }]
    expect(await correr(nodo(DESPUES, REPARTIR), { entrada: horario, items: vacio, http: m.httpRequest })).toEqual(vacio)
    expect(m.posts).toHaveLength(0)
  })
})

describe('⓪ Entrada reconoce «un cliente»', () => {
  const llamar = (b: Record<string, unknown>, llave: string | undefined) => correr(nodo(DESPUES, ENTRADA), { items: [], nodos: { [WEBHOOK]: [{ json: { headers: llave === undefined ? {} : { 'x-api-key': llave }, body: b } }] } })
  it('con la llave y un uuid: via cliente, real, con su client_id; el reintento viaja', async () => {
    const r = await llamar({ client_id: UUID(7), reintento: true }, KEY)
    expect(r[0].json).toMatchObject({ via: 'cliente', dry_run: false, client_id: UUID(7), reintento: true })
    const s = await llamar({ client_id: UUID(7) }, KEY)
    expect(s[0].json.reintento).toBe(false)
  })
  it('sin llave, con otra llave, o sin uuid: se DETIENE', async () => {
    await expect(llamar({ client_id: UUID(7) }, undefined)).rejects.toThrow(/UN_CLIENTE_SIN_LLAVE/)
    await expect(llamar({ client_id: UUID(7) }, 'otra')).rejects.toThrow(/UN_CLIENTE_SIN_LLAVE/)
    await expect(llamar({ client_id: 'no-es-uuid' }, KEY)).rejects.toThrow(/UN_CLIENTE_INVALIDO/)
    await expect(llamar({}, KEY)).rejects.toThrow(/UN_CLIENTE_INVALIDO/)
  })
  it('el horario y el despertar siguen entrando como antes', async () => {
    const h = await correr(nodo(DESPUES, ENTRADA), { items: [] })
    expect(h[0].json).toMatchObject({ via: 'horario', dry_run: false, client_id: null })
    const antes = await correr(nodo(ANTES, ENTRADA), { items: [] })
    expect(h[0].json).toEqual({ ...antes[0].json })
  })
})

describe('⑦ Reintento de la misma mañana', () => {
  const cierre = (omitidas: string[]): Item[] => [{ json: { fin: 'hecho', clientes: [{ cliente: UUID(1), omitidas_por_tiempo: omitidas }] } }]
  const vig = (ok: boolean): Item[] => [{ json: { ok } }]
  const R = '⑦ Reintento (misma mañana)'
  const llamar = (entrada: Record<string, unknown>, om: string[], ok = true, http?: unknown) => {
    const m = entorno()
    return correr(nodo(DESPUES, R), { entrada, items: vig(ok), http: http ?? m.httpRequest, nodos: { '⑤ Cierre': cierre(om) } }).then((s) => ({ s, posts: m.posts }))
  }
  it('con algo omitido: pide UNA vez más ese cliente con reintento:true', async () => {
    const { s, posts } = await llamar({ ...horario, via: 'cliente', client_id: UUID(1) }, ['menciones: menciones_en_redes'])
    expect(s[0].json.reintento).toBe(true)
    expect(posts).toEqual([{ url: expect.stringMatching(/cerebro-diario-un-cliente$/), client_id: UUID(1), reintento: true, llave: KEY }])
  })
  it('nunca en bucle, ni en seco, ni a mano, ni con el vigilante hablando, ni sin omitidos', async () => {
    for (const [e, om, ok, motivo] of [
      [{ ...horario, via: 'cliente', client_id: UUID(1), reintento: true }, ['x'], true, 'ya es un reintento'],
      [{ ...horario, via: 'cliente', client_id: UUID(1), dry_run: true }, ['x'], true, 'en seco'],
      [{ ...horario, via: 'mano' }, ['x'], true, 'entrada a mano o despertar'],
      [{ ...horario, via: 'despertar', client_id: UUID(1) }, ['x'], true, 'entrada a mano o despertar'],
      [{ ...horario, via: 'cliente', client_id: UUID(1) }, ['x'], false, 'el vigilante habló'],
      [{ ...horario, via: 'cliente', client_id: UUID(1) }, [], true, 'nada omitido'],
    ] as Array<[Record<string, unknown>, string[], boolean, string]>) {
      const { s, posts } = await llamar(e, om, ok)
      expect(posts).toHaveLength(0)
      expect(s[0].json).toMatchObject({ reintento: false, motivo })
      vi.restoreAllMocks()
    }
  })
  it('una falla de red al pedir el reintento se DICE y no tumba la ejecución', async () => {
    const { s } = await llamar({ ...horario, via: 'cliente', client_id: UUID(1) }, ['x'], true, async () => { throw new Error('boom') })
    expect((s[0].json.lanzados as Array<{ http: number }>)[0].http).toBe(0)
  })
})

describe('el cableado del flujo', () => {
  it('el reparto va entre «Un elemento por cliente» y «Descubrir»; ⑦ cuelga de ⑥; el webhook entra por ⓪', () => {
    const c = DESPUES.connections
    expect(c['① Un elemento por cliente'].main[0].map((x: { node: string }) => x.node)).toEqual([REPARTIR])
    expect(c[REPARTIR].main[0].map((x: { node: string }) => x.node)).toEqual(['① Descubrir (el portero que alimenta)'])
    expect(c['⑥ Vigilar (apaga y avisa si algo falla)'].main[0].map((x: { node: string }) => x.node)).toEqual(['⑦ Reintento (misma mañana)'])
    expect(c[WEBHOOK].main[0].map((x: { node: string }) => x.node)).toEqual([ENTRADA])
    expect(nodo(DESPUES, WEBHOOK).parameters.path).toBe('zero-risk/cerebro-diario-un-cliente')
  })
  it('el vigilante recibe el client_id de la ejecución y procesar recibe forzar solo en el reintento', () => {
    expect(nodo(DESPUES, '⑥ Vigilar (apaga y avisa si algo falla)').parameters.jsonBody).toMatch(/client_id: \$\('⓪ Entrada'\)\.first\(\)\.json\.client_id/)
    expect(nodo(DESPUES, '④ Alimentar (filtrar · razonar · archivar)').parameters.jsonBody).toMatch(/reintento === true \? \{ forzar: true \} : \{\}/)
  })
  it('cambian solo los nodos previstos y se agregan 3; el horario y los demás idénticos', () => {
    const A = new Map((ANTES.nodes as Nodo[]).map((n) => [n.name, JSON.stringify(n.parameters)]))
    const cambian = (DESPUES.nodes as Nodo[]).filter((n) => A.has(n.name) && A.get(n.name) !== JSON.stringify(n.parameters)).map((n) => n.name).sort()
    expect(cambian).toEqual(['⓪ Entrada', '④ Alimentar (filtrar · razonar · archivar)', '⑤ Cierre', '⑥ Vigilar (apaga y avisa si algo falla)'].sort())
    expect((DESPUES.nodes as Nodo[]).filter((n) => !A.has(n.name)).map((n) => n.name).sort()).toEqual([REPARTIR, '⑦ Reintento (misma mañana)', WEBHOOK].sort())
    const h = (DESPUES.nodes as Nodo[]).find((n) => n.type === 'n8n-nodes-base.scheduleTrigger')!
    expect(JSON.stringify(h.parameters)).toContain('30 8 * * *')
  })
})
