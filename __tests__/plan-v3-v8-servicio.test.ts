/**
 * Plan v3 · V8 (Servicio de Apify) · `origen`, `workflow_execution_id` y `tope_usd` ADITIVOS.
 * Regresión del `portero`: mismas entradas ⇒ misma salida y misma fila de libro (salvo los campos aditivos), ANTES contra DESPUÉS, por función.
 * Sin red: los nodos de código se ejecutan con un mundo falso; los JSON son los del respaldo (vivo = ARREGLADO-menciones 14-oct).
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { cambiar, servicioConOrigenYTope, TOPE_MAXIMO_USD } from '../scripts/worker-staging/construir-plan-v3-v8.mjs'

type Nodo = { name: string; type: string; parameters: Record<string, any> }
type Flujo = { nodes: Nodo[]; connections: unknown }
const WS = join(process.cwd(), 'scripts/worker-staging/3lyknrP3PoS2KzUf')
const leer = (p: string) => JSON.parse(readFileSync(join(WS, p), 'utf8')) as Flujo
const ANTES = leer('servicio-apify-ANTES-planv3-v8-2026-10-15.json')
const HOY = leer('servicio-apify-ARREGLADO-planv3-v8-2026-10-15.json')
const nodo = (f: Flujo, n: string) => f.nodes.find((x) => x.name === n)!
const codigo = (f: Flujo, n: string) => String(nodo(f, n).parameters.jsCode).split('\r\n').join('\n')
const AsyncFunction = Object.getPrototypeOf(async function () { /* */ }).constructor as new (...a: string[]) => (...b: unknown[]) => Promise<any>

const CAMBIADOS_CODIGO = ['Validate Body', 'Armar la fila de la libreta', 'final-response-ok']
const URLS = (f: Flujo) => f.nodes.filter((n) => n.type === 'n8n-nodes-base.httpRequest' && /^apify-/.test(n.name) && /run-sync-get-dataset-items\?timeout=\d+|\/acts\/[^/]+\/runs/.test(String(n.parameters.url)))

describe('el cambio es solo lo declarado', () => {
  it('el respaldo ANTES es el vivo de menciones (mismos parámetros)', () => {
    const v = leer('servicio-apify-ARREGLADO-menciones-2026-10-14.json')
    expect(JSON.stringify(ANTES.nodes)).toBe(JSON.stringify(v.nodes))
  })
  it('solo difieren 3 nodos de código y 19 direcciones; conexiones iguales', () => {
    const dif = HOY.nodes.filter((n) => JSON.stringify(n.parameters) !== JSON.stringify(nodo(ANTES, n.name).parameters)).map((n) => n.name)
    const urls = URLS(HOY).map((n) => n.name)
    expect(dif.filter((n) => !urls.includes(n)).sort()).toEqual([...CAMBIADOS_CODIGO].sort())
    expect(urls.length).toBe(19)
    expect(JSON.stringify(HOY.connections)).toBe(JSON.stringify(ANTES.connections))
    expect(HOY.nodes.length).toBe(ANTES.nodes.length)
  })
  it('cada dirección conserva su prefijo y solo gana el sufijo del tope', () => {
    for (const n of URLS(HOY)) {
      const antes = String(nodo(ANTES, n.name).parameters.url)
      expect(String(n.parameters.url).startsWith(antes)).toBe(true)
      expect(String(n.parameters.url).slice(antes.length)).toContain('maxTotalChargeUsd=')
    }
  })
  it('el constructor es idempotente: aplicarlo dos veces falla (no duplica)', () => {
    expect(() => servicioConOrigenYTope(HOY as any)).toThrow(/ya lleva el tope/)
  })
})

/** resuelve las expresiones `{{ … }}` de una dirección con un pedido falso */
function resolverUrl(url: string, body: Record<string, unknown>): string {
  const $ = (n: string) => { if (n === 'Validate Body') return { first: () => ({ json: { body } }) }; throw new Error('nodo ' + n) }
  return String(url).replace(/^=/, '').replace(/\{\{([\s\S]*?)\}\}/g, (_m, e) => String(new Function('$', `return (${e})`)($)))
}

describe('tope_usd viaja a Apify como maxTotalChargeUsd', () => {
  const run = nodo(HOY, 'apify-ig').parameters.url
  const start = nodo(HOY, 'apify-trustpilot-start').parameters.url
  it('sin tope: la dirección es la de hoy', () => {
    expect(resolverUrl(run, {})).toBe(String(nodo(ANTES, 'apify-ig').parameters.url).replace(/^=/, ''))
    expect(resolverUrl(start, {})).toBe(String(nodo(ANTES, 'apify-trustpilot-start').parameters.url).replace(/^=/, ''))
  })
  it('con tope: se añade al final (con & si ya hay ?, con ? si no)', () => {
    expect(resolverUrl(run, { tope_usd: 0.35 })).toBe('https://api.apify.com/v2/acts/apify~instagram-scraper/run-sync-get-dataset-items?timeout=120&maxTotalChargeUsd=0.35')
    expect(resolverUrl(start, { tope_usd: 1 })).toBe('https://api.apify.com/v2/acts/memo23~trustpilot-scraper-ppe/runs?maxTotalChargeUsd=1')
  })
  it('un tope fuera de rango o no numérico NO se manda (y la validación lo rechaza antes)', () => {
    for (const t of [0, -1, TOPE_MAXIMO_USD + 1, 'x', null]) expect(resolverUrl(run, { tope_usd: t })).not.toContain('maxTotalChargeUsd')
  })
})

async function validar(f: Flujo, body: Record<string, unknown>) {
  const fn = new AsyncFunction('$input', codigo(f, 'Validate Body'))
  const s = await (fn as any)({ first: () => ({ json: { body } }) })
  return s[0].json as { validation_ok: boolean; validation_errors: string[]; dry_run: boolean; body: any }
}

describe('Validate Body · regresión del portero (mismas entradas, misma salida) y lo nuevo', () => {
  const FUNCIONES = [...String(codigo(ANTES, 'Validate Body')).matchAll(/^\s*'([a-z_0-9]+)',?\s*(?:\/\/.*)?$/gm)].map((m) => m[1])
  it('encuentra las funciones permitidas (incluye las del portero)', () => {
    for (const f of ['own_google_maps_profile', 'resenas_google_maps', 'menciones_en_redes', 'instagram_scraper']) expect(FUNCIONES).toContain(f)
  })
  for (const fn of ['own_google_maps_profile', 'resenas_google_maps', 'menciones_en_redes', 'instagram_scraper', 'website_content_scraper']) {
    for (const dry of [true, false]) {
      it(`${fn} · dry_run=${dry}: salida idéntica sin campos nuevos`, async () => {
        const body = { client_id: 'c1', apify_function: fn, destination: 'respuesta', dry_run: dry, params: { username: ['x'] } }
        expect(await validar(HOY, body)).toEqual(await validar(ANTES, body))
      })
    }
  }
  it('con los campos nuevos válidos pasa y el cuerpo viaja entero', async () => {
    const body = { client_id: 'c1', apify_function: 'instagram_scraper', destination: 'respuesta', dry_run: true, origen: 'plan', workflow_execution_id: 'abc-123', tope_usd: 0.4 }
    const r = await validar(HOY, body)
    expect(r.validation_ok).toBe(true)
    expect(r.body).toEqual(body)
  })
  it('lo nuevo inválido se rechaza ANTES de pagar', async () => {
    const base = { client_id: 'c1', apify_function: 'instagram_scraper', destination: 'respuesta', dry_run: true }
    for (const [campo, valor, msg] of [['origen', 'Plan X', 'origen invalid'], ['origen', 7, 'origen invalid'], ['tope_usd', 0, 'tope_usd invalid'], ['tope_usd', 99, 'tope_usd invalid'], ['tope_usd', '0.3', 'tope_usd invalid'], ['workflow_execution_id', 'x'.repeat(65), 'workflow_execution_id invalid']] as const) {
      const r = await validar(HOY, { ...base, [campo]: valor })
      expect(r.validation_ok, `${campo}=${String(valor)}`).toBe(false)
      expect(r.validation_errors.join('|')).toContain(msg)
    }
  })
  it('null y ausente cuentan igual (el que llama puede mandar null)', async () => {
    const base = { client_id: 'c1', apify_function: 'instagram_scraper', destination: 'respuesta', dry_run: true }
    expect((await validar(HOY, { ...base, origen: null, tope_usd: null, workflow_execution_id: null })).validation_ok).toBe(true)
  })
})

/** corre «Armar la fila de la libreta» (en ensayo no llama a nadie) con o sin el pedido original */
async function fila(f: Flujo, pedido: Record<string, unknown> | null, ensayo = true) {
  const fn = new AsyncFunction('$', '$env', codigo(f, 'Armar la fila de la libreta'))
  const ctx = { dry_run: ensayo, apify_function: 'menciones_en_redes', client_id: 'c1', chunks_count: 3 }
  const $ = (n: string) => {
    if (n === 'final-response-ok') return { first: () => ({ json: ctx }) }
    if (n === 'Validate Body' && pedido) return { first: () => ({ json: { body: pedido } }) }
    throw new Error('nodo ' + n)
  }
  const s = await (fn as any).call({ helpers: { httpRequest: async () => { throw new Error('sin red') } } }, $, { APIFY_API_TOKEN: undefined })
  const r = s[0].json
  return { ...r, description: JSON.parse(r.description) } as Record<string, any>
}

describe('la fila de la libreta: igual que hoy salvo los campos aditivos', () => {
  it('sin origen: igual que ANTES y con origen «sin_origen»', async () => {
    const a = await fila(ANTES, null), h = await fila(HOY, { client_id: 'c1', apify_function: 'menciones_en_redes' })
    const { origen, ...resto } = h.description
    expect(origen).toBe('sin_origen')
    expect(Object.keys(resto).sort()).toEqual(Object.keys(a.description).sort())
    for (const k of Object.keys(a.description)) if (k !== 'momento') expect(resto[k]).toEqual(a.description[k])
    for (const k of ['category', 'service', 'amount_usd', 'amount_usd_exact', 'date']) expect(h[k]).toEqual(a[k])
  })
  it('sin el nodo «Validate Body» a la mano no se rompe (tolerante)', async () => {
    expect((await fila(HOY, null)).description.origen).toBe('sin_origen')
  })
  it('con origen, ejecución y tope: la fila los lleva', async () => {
    const h = await fila(HOY, { origen: 'plan', workflow_execution_id: 'e-9', tope_usd: 0.3 })
    expect(h.description).toMatchObject({ origen: 'plan', workflow_execution_id: 'e-9', tope_usd: 0.3 })
  })
  it('un origen malformado no entra al libro', async () => {
    expect((await fila(HOY, { origen: 'DROP TABLE' })).description.origen).toBe('sin_origen')
  })
  it('la regresión muerde: quitar el origen del código rompe la prueba (mutación)', async () => {
    const mut = JSON.parse(JSON.stringify(HOY)) as Flujo
    const n = nodo(mut, 'Armar la fila de la libreta')
    n.parameters.jsCode = cambiar(String(n.parameters.jsCode).split('\r\n').join('\n'), '    origen: _origen,\n', '', 'mut')
    expect((await fila(mut, { origen: 'plan' })).description.origen).toBeUndefined()
  })
})

describe('final-response-ok: la respuesta del portero conserva todo y gana el eco del origen', () => {
  async function responder(f: Flujo, body: Record<string, unknown> | null) {
    const fn = new AsyncFunction('$', '$input', codigo(f, 'final-response-ok'))
    const ctx = { client_id: 'c1', apify_function: 'menciones_en_redes', destination: 'respuesta', sections: [{ text: 'hola' }], dry_run: true }
    const $ = (n: string) => {
      if (n === 'pre-destination') return { first: () => ({ json: ctx }) }
      if (n === 'Validate Body') return { first: () => ({ json: { body: body ?? {} } }) }
      throw new Error('nodo ' + n)
    }
    return (await (fn as any)($, { all: () => [] }))[0].json as Record<string, any>
  }
  it('mismas claves de siempre con los mismos valores', async () => {
    const a = await responder(ANTES, null), h = await responder(HOY, {})
    const { origen, ...resto } = h
    expect(origen).toBe('sin_origen')
    expect(resto).toEqual(a)
  })
  it('devuelve el origen pedido', async () => { expect((await responder(HOY, { origen: 'plan' })).origen).toBe('plan') })
})
