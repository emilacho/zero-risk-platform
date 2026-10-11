/**
 * Ronda 68 · Apify: UNA fila por corrida, importe real en la libreta de cada llamada, y la búsqueda de Google con `queries` como texto.
 * Sin Apify de verdad: las 7 corridas y sus entradas son las REALES de la repetición del tramo 1 (grabadas), los flujos son los del respaldo.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { cambiar, servicioApify, reconciliacion, planeacion, armarCuerpo, SERP_VIEJO } from '../scripts/worker-staging/construir-ronda68.mjs'

type Nodo = { name: string; executeOnce?: boolean; parameters: Record<string, any> }
type Flujo = { nodes: Nodo[]; connections: unknown; active?: boolean }
const WS = join(process.cwd(), 'scripts/worker-staging')
const flujo = (p: string) => JSON.parse(readFileSync(join(WS, p), 'utf8')) as Flujo
const SERV_ANTES = flujo('3lyknrP3PoS2KzUf/servicio-apify-ANTES-ronda68-2026-10-11.json')
const SERV_HOY = flujo('3lyknrP3PoS2KzUf/servicio-apify-ARREGLADO-ronda68-2026-10-11.json')
const REC_ANTES = flujo('jrnP5qTvEh0ACGkM/anotar-gasto-ANTES-ronda68-2026-10-11.json')
const REC_HOY = flujo('jrnP5qTvEh0ACGkM/anotar-gasto-ARREGLADO-ronda68-2026-10-11.json')
const PLAN_ANTES = flujo('X9F0zp6LQ2xGEYVS/planeacion-ANTES-ronda68-2026-10-11.json')
const PLAN_HOY = flujo('X9F0zp6LQ2xGEYVS/planeacion-ARREGLADA-ronda68-2026-10-11.json')
const REAL = JSON.parse(readFileSync(join(process.cwd(), '__tests__/fixtures/ronda68/apify-corridas-reales.json'), 'utf8')) as { items: any[]; entradas: Record<string, any> }
const nodo = (f: Flujo, n: string) => f.nodes.find((x) => x.name === n)!
const codigo = (f: Flujo, n: string) => String(nodo(f, n).parameters.jsCode).split('\r\n').join('\n')
const AsyncFunction = Object.getPrototypeOf(async function () { /* */ }).constructor as new (...a: string[]) => (...b: unknown[]) => Promise<any>

/** doble de Apify con las corridas reales */
const apifyReal = (extra: { items?: any[]; entradas?: Record<string, any>; falla?: (u: string) => boolean } = {}) => async (u: string) => {
  if (extra.falla?.(u)) throw new Error('HTTP 503')
  if (u.includes('/actor-runs')) return { data: { items: extra.items ?? REAL.items } }
  const m = u.match(/key-value-stores\/([^/]+)\/records\/INPUT/)
  if (m) { const e = (extra.entradas ?? REAL.entradas)[m[1]]; if (!e) throw new Error('HTTP 404'); return e }
  throw new Error('url inesperada ' + u)
}

/** corre el código de un nodo «Armar la fila de la libreta» con un mundo falso */
async function correrFila(f: Flujo, mundo: { dry_run?: boolean; cuerpo?: unknown; http: (u: string) => Promise<any>; token?: string | undefined; ahoraMs?: number }) {
  const fn = new AsyncFunction('$', '$env', 'Date', codigo(f, 'Armar la fila de la libreta'))
  const ctx = { dry_run: mundo.dry_run === true, apify_function: 'instagram_scraper', client_id: 'c1', chunks_count: 3 }
  const $ = (n: string) => {
    if (n === 'final-response-ok') return { first: () => ({ json: ctx }) }
    if (n === 'Armar el cuerpo del raspador') { if (mundo.cuerpo === undefined) throw new Error('sin nodo'); return { first: () => ({ json: { cuerpo: mundo.cuerpo } }) } }
    throw new Error('nodo ' + n)
  }
  const ahora = mundo.ahoraMs
  const FechaFalsa = class extends Date { constructor(...a: any[]) { super((a.length ? a[0] : (ahora ?? Date.now())) as number) } static now() { return ahora ?? Date.now() } }
  const yo = { helpers: { httpRequest: async (o: { url: string }) => mundo.http(o.url) } }
  const salida = await (fn as any).call(yo, $, { APIFY_API_TOKEN: 'token' in mundo ? mundo.token : 'tok' }, FechaFalsa)
  return salida[0].json as Record<string, any>
}

describe('importe real: cada llamada encuentra SU corrida por lo que mandó (7 de 7 reales, con corridas a la vez)', () => {
  for (const r of REAL.items) {
    it(`corrida ${r.startedAt.slice(11, 19)} · actor ${String(r.actId).slice(0, 8)} · US$ ${Number(r.usageTotalUsd).toFixed(4)}`, async () => {
      const cuerpo = REAL.entradas[r.defaultKeyValueStoreId]
      // «ahora» = 5 s después de que terminó (la fila de la libreta se arma justo después de la llamada)
      const fila = await correrFila(SERV_HOY, { cuerpo, http: apifyReal(), ahoraMs: new Date(r.finishedAt).getTime() + 5000 })
      const d = JSON.parse(fila.description)
      expect(d.run_id).toBe(r.id)
      expect(fila.amount_usd_exact).toBe(Number(r.usageTotalUsd.toFixed(6)))
      expect(fila.amount_usd).toBe(Number(r.usageTotalUsd.toFixed(2)))
      expect(d.costo_conocido).toBe(true)
      expect(fila.service).toBe('apify:instagram_scraper')
    })
  }
})

describe('sin prueba NO se adivina: importe nulo y el motivo escrito', () => {
  const ref = REAL.items[0], cuerpoRef = REAL.entradas[ref.defaultKeyValueStoreId]
  const ahora = new Date(ref.finishedAt).getTime() + 5000
  const sinImporte = async (m: Parameters<typeof correrFila>[1]) => {
    const f = await correrFila(SERV_HOY, { ahoraMs: ahora, ...m })
    const d = JSON.parse(f.description)
    expect(f.amount_usd).toBeNull(); expect(f.amount_usd_exact).toBeNull(); expect(d.costo_conocido).toBe(false); expect(d.run_id).toBeUndefined()
    expect(d.motivo).toMatch(/NO se adivina/)
    return d.motivo as string
  }
  it('dos corridas con la misma entrada (llamadas idénticas a la vez) → no se sabe cuál es de cuál', async () => {
    const copia = { ...REAL.items[0], id: 'otra-corrida', defaultKeyValueStoreId: 'kv-otra' }
    const motivo = await sinImporte({ cuerpo: cuerpoRef, http: apifyReal({ items: [...REAL.items, copia], entradas: { ...REAL.entradas, 'kv-otra': cuerpoRef } }) })
    expect(motivo).toMatch(/misma entrada/)
  })
  it('ninguna corrida tiene la entrada que se mandó', async () => {
    expect(await sinImporte({ cuerpo: { directUrls: ['https://www.instagram.com/nadie/'] }, http: apifyReal() })).toMatch(/ninguna tiene la entrada/)
  })
  it('ninguna corrida cayó dentro de la llamada (pasó mucho tiempo)', async () => {
    expect(await sinImporte({ cuerpo: cuerpoRef, http: apifyReal(), ahoraMs: ahora + 3_600_000 })).toMatch(/ninguna corrida de la cuenta/)
  })
  it('Apify no contesta o la llave falta → sin importe, la llamada NO falla', async () => {
    expect(await sinImporte({ cuerpo: cuerpoRef, http: apifyReal({ falla: () => true }) })).toMatch(/no se pudo leer/)
    expect(await sinImporte({ cuerpo: cuerpoRef, http: apifyReal(), token: undefined })).toMatch(/sin llave/)
  })
  it('sin lo que se mandó y varias corridas posibles → no se adivina', async () => {
    expect(await sinImporte({ http: apifyReal() })).toMatch(/no guardó lo que mandó|ninguna corrida/)
  })
  it('un ensayo es un cero de verdad (no se pregunta a Apify)', async () => {
    let preguntas = 0
    const f = await correrFila(SERV_HOY, { dry_run: true, http: async () => { preguntas++; return {} } })
    expect(f.amount_usd).toBe(0); expect(f.amount_usd_exact).toBe(0); expect(preguntas).toBe(0)
    expect(JSON.parse(f.description).ensayo).toBe(true)
  })
})

describe('UNA fila por corrida: «Guardar lo crudo» corre una sola vez', () => {
  it('el nodo usa $items() (todas las filas) y por eso, sin «una sola vez», escribía N copias idénticas', () => {
    expect(JSON.stringify(nodo(SERV_ANTES, 'Guardar lo crudo').parameters)).toContain('$items()')
    expect(nodo(SERV_ANTES, 'Guardar lo crudo').executeOnce).toBeUndefined()
    expect(nodo(SERV_HOY, 'Guardar lo crudo').executeOnce).toBe(true)
  })
  it('sigue guardando TODAS las filas de la corrida en esa única fila (filas = cuántas trajo)', () => {
    const cuerpo = String(nodo(SERV_HOY, 'Guardar lo crudo').parameters.jsonBody)
    expect(cuerpo).toContain('filas: items.length')
    expect(cuerpo).toContain('respuesta: texto.length > 200000')
  })
})

describe('la búsqueda de Google (ejecución 173262): el actor pide `queries` como TEXTO', () => {
  const constructor = (f: Flujo) => {
    const c = codigo(f, 'Armar el cuerpo del raspador')
    const ini = c.indexOf('google_serp_scraper:')
    const linea = c.slice(ini, c.indexOf('\n', ini)).replace(/,\s*$/, '')
    return new Function('return ({' + linea + '})')().google_serp_scraper as (j: unknown) => { queries: unknown; maxPagesPerQuery: number }
  }
  it('rojo (lo de antes): una lista de búsquedas salía como lista y Apify contestaba «Field input.queries must be string»', () => {
    expect(constructor(SERV_ANTES)({ params: { queries: ['restaurante de mariscos costero ecuatoriano'], de_donde: 'el rubro de la ficha' } }).queries).toEqual(['restaurante de mariscos costero ecuatoriano'])
  })
  it('verde: el CASO REAL (una búsqueda + la anotación `de_donde`) sale como texto y `de_donde` no viaja', () => {
    const r = constructor(SERV_HOY)({ params: { queries: ['restaurante de mariscos costero ecuatoriano'], de_donde: 'el rubro de la ficha' } })
    expect(r).toEqual({ queries: 'restaurante de mariscos costero ecuatoriano', maxPagesPerQuery: 1 })
  })
  it('varias búsquedas = una por línea · texto tal cual sigue valiendo · vacíos fuera · sin nada = texto vacío', () => {
    const k = constructor(SERV_HOY)
    expect(k({ params: { queries: ['a b', '  c  ', '', null] } }).queries).toBe('a b\nc')
    expect(k({ params: { queries: 'una sola' } }).queries).toBe('una sola')
    expect(k({ params: { searchTerms: ['x'] } }).queries).toBe('x')
    expect(k({ params: {} }).queries).toBe('')
  })
  it('el constructor viejo está una vez y el cambio es SOLO esa línea', () => {
    expect(codigo(SERV_ANTES, 'Armar el cuerpo del raspador')).toContain(SERP_VIEJO)
    expect(codigo(SERV_HOY, 'Armar el cuerpo del raspador')).not.toContain(SERP_VIEJO)
    expect(() => cambiar('x', 'y', 'z', 'q')).toThrow(/esperaba 1/)
  })
})

describe('la reconciliación del día no cuenta dos veces lo anotado en su llamada', () => {
  async function correrAgrupar(f: Flujo, opts: { anotadas: string[] | 'falla'; corridas: Array<{ run_id: string; usd: number }> }) {
    const fn = new AsyncFunction('$', '$input', '$env', 'Date', codigo(f, 'Agrupar por día'))
    const dia = '2026-10-11'
    const corridas = opts.corridas.map((c) => ({ json: { run_id: c.run_id, actor: 'a', estado: 'SUCCEEDED', usd: c.usd, dia, momento: dia + 'T08:00:00Z', segundos: 5, dataset_id: 'd' } }))
    const conteos = opts.corridas.map(() => ({ json: { data: { itemCount: 1 } } }))
    const ahora = Date.parse('2026-10-12T05:00:00Z')
    const FechaFalsa = class extends Date { constructor(...a: any[]) { super((a.length ? a[0] : ahora) as number) } static now() { return ahora } }
    const yo = { helpers: { httpRequest: async () => { if (opts.anotadas === 'falla') throw new Error('base caída'); return opts.anotadas.map((id) => ({ description: JSON.stringify({ run_id: id, costo_conocido: true }) })).concat([{ description: 'no es json' }, { description: JSON.stringify({ costo_conocido: false }) }]) } } }
    const salida = await (fn as any).call(yo, (n: string) => ({ all: () => corridas }), { all: () => conteos }, { SUPABASE_SERVICE_ROLE_KEY: 'k' }, FechaFalsa)
    return salida.map((s: { json: Record<string, any> }) => s.json)
  }
  it('rojo (lo de antes): suma TODAS las corridas del día', async () => {
    const [x] = await (async () => {
      const fn = new AsyncFunction('$', '$input', '$env', 'Date', codigo(REC_ANTES, 'Agrupar por día'))
      const ahora = Date.parse('2026-10-12T05:00:00Z')
      const FechaFalsa = class extends Date { constructor(...a: any[]) { super((a.length ? a[0] : ahora) as number) } static now() { return ahora } }
      const corridas = [{ json: { run_id: 'r1', actor: 'a', estado: 'S', usd: 0.2, dia: '2026-10-11', momento: '2026-10-11T08:00:00Z', segundos: 1, dataset_id: 'd' } }, { json: { run_id: 'r2', actor: 'a', estado: 'S', usd: 0.1, dia: '2026-10-11', momento: '2026-10-11T08:00:00Z', segundos: 1, dataset_id: 'd' } }]
      return (await (fn as any).call({}, () => ({ all: () => corridas }), { all: () => [{ json: { data: { itemCount: 1 } } }, { json: { data: { itemCount: 1 } } }] }, {}, FechaFalsa)).map((s: any) => s.json)
    })()
    expect(x.amount_usd_exact).toBe(0.3)
  })
  it('verde: la fila del día es el RESTO (lo que no quedó anotado en su llamada) y dice cuánto estaba anotado y el total', async () => {
    const [fila] = await correrAgrupar(REC_HOY, { anotadas: ['r1'], corridas: [{ run_id: 'r1', usd: 0.2 }, { run_id: 'r2', usd: 0.1 }] })
    expect(fila.amount_usd_exact).toBe(0.1)
    const d = JSON.parse(fila.description)
    expect(d).toMatchObject({ anotadas_en_su_llamada: 1, anotadas_usd: 0.2, total_del_dia_usd: 0.3, resto_sin_atribuir_a_una_llamada: true, lectura_de_las_anotadas: 'ok' })
    expect(d.detalle.find((x: any) => x.run_id === 'r1').anotada_en_su_llamada).toBe(true)
    expect(d.detalle.find((x: any) => x.run_id === 'r2').anotada_en_su_llamada).toBe(false)
  })
  it('si no se puede leer la libreta NO se descuenta nada (mejor contar de más que perder gasto) y se dice', async () => {
    const [fila] = await correrAgrupar(REC_HOY, { anotadas: 'falla', corridas: [{ run_id: 'r1', usd: 0.2 }, { run_id: 'r2', usd: 0.1 }] })
    expect(fila.amount_usd_exact).toBe(0.3)
    expect(JSON.parse(fila.description).lectura_de_las_anotadas).toMatch(/fallo: no se descontó nada/)
  })
  it('sin ninguna anotada = igual que antes', async () => {
    const [fila] = await correrAgrupar(REC_HOY, { anotadas: [], corridas: [{ run_id: 'r1', usd: 0.2 }, { run_id: 'r2', usd: 0.1 }] })
    expect(fila.amount_usd_exact).toBe(0.3)
  })
})

describe('planeación: el redactor entrega la vuelta desde el corredor (como el Brief y la Pieza)', () => {
  it('el pedido lleva callback_mode «runner» y NADA más cambió en el flujo', () => {
    const antes = String(nodo(PLAN_ANTES, 'Pedir el plan al redactor').parameters.jsonBody), hoy = String(nodo(PLAN_HOY, 'Pedir el plan al redactor').parameters.jsonBody)
    expect(antes).not.toContain('callback_mode')
    expect(hoy).toContain("callback_url: $execution.resumeUrl, callback_mode: 'runner', force_restart:")
    expect(hoy.replace("callback_mode: 'runner', ", '')).toBe(antes)
    const dif = PLAN_ANTES.nodes.filter((n) => JSON.stringify(n) !== JSON.stringify(nodo(PLAN_HOY, n.name))).map((n) => n.name)
    expect(dif).toEqual(['Pedir el plan al redactor'])
    expect(PLAN_HOY.connections).toEqual(PLAN_ANTES.connections)
    expect(PLAN_HOY.active).toBe(PLAN_ANTES.active)
  })
  it('el agente es de la lista que puede entregar la vuelta por el corredor', async () => {
    const { AGENTES_CON_VUELTA_POR_EL_CORREDOR } = await import('@/app/api/agents/run-sdk/route')
    expect(AGENTES_CON_VUELTA_POR_EL_CORREDOR).toContain('campaign-brief-agent')
    expect(String(nodo(PLAN_HOY, 'Pedir el plan al redactor').parameters.jsonBody)).toContain("agent: 'campaign-brief-agent'")
  })
})

describe('los flujos se reconstruyen igual desde su respaldo y SOLO cambian los nodos previstos', () => {
  const cambian = (a: Flujo, b: Flujo) => a.nodes.filter((n) => JSON.stringify(n) !== JSON.stringify(nodo(b, n.name))).map((n) => n.name).sort()
  it('Servicio de Apify', () => {
    expect(JSON.stringify(servicioApify(SERV_ANTES))).toBe(JSON.stringify(SERV_HOY))
    expect(cambian(SERV_ANTES, SERV_HOY)).toEqual(['Armar el cuerpo del raspador', 'Armar la fila de la libreta', 'Guardar lo crudo'])
    expect(SERV_HOY.connections).toEqual(SERV_ANTES.connections); expect(SERV_HOY.nodes.length).toBe(SERV_ANTES.nodes.length); expect(SERV_HOY.active).toBe(SERV_ANTES.active)
  })
  it('reconciliación diaria', () => {
    expect(JSON.stringify(reconciliacion(REC_ANTES))).toBe(JSON.stringify(REC_HOY))
    expect(cambian(REC_ANTES, REC_HOY)).toEqual(['Agrupar por día'])
    expect(REC_HOY.connections).toEqual(REC_ANTES.connections); expect(REC_HOY.active).toBe(REC_ANTES.active)
  })
  it('planeación', () => { expect(JSON.stringify(planeacion(PLAN_ANTES))).toBe(JSON.stringify(PLAN_HOY)) })
  it('armarCuerpo sólo cambia la línea de Google', () => {
    const c = codigo(SERV_ANTES, 'Armar el cuerpo del raspador')
    const d = armarCuerpo(c)
    expect(c.split('\n').filter((l, i) => l !== d.split('\n')[i]).length).toBe(1)
  })
})
