/**
 * T5 · paso 5 · el brazo «INFORME DE MERCADO» en la PLANEACIÓN (`X9F0zp6LQ2xGEYVS`) · US$ 0, sin red.
 * Se ejecuta el CÓDIGO REAL de `⓪ Llave`, `elegir brazos`, `Brazo · mercado`, `firma de la rama · mercado` y de la junta, y la RUTA REAL `POST /api/planeacion/brazo/mercado` de CC1
 * (la base y el corredor del modelo son dobles en memoria; el modelo no se llama de verdad).
 * Lo que fija: sin `con_mercado` el flujo pide LO MISMO que el vivo (no gasta nada nuevo); con `con_mercado: true` sale UN pedido más a la rama nueva;
 * un valor raro se rechaza antes de gastar; el pedido llega a la ruta con la firma real de la corrida; el material vuelve como PROPUESTA y la junta lo cuenta como un cuarto brazo.
 */
import fs from 'node:fs'
import path from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { recorrer, type Http } from './_emulador-n8n'

const supabaseMock = { from: vi.fn() }
vi.mock('@/lib/supabase', () => ({ getSupabaseAdmin: () => supabaseMock }))
vi.mock('@/lib/internal-auth', () => ({
  checkInternalKey: (r: Request) => (r.headers.get('x-api-key') === 'llave-interna' ? { ok: true } : { ok: false, reason: 'Invalid x-api-key' }),
}))
import { POST as rutaMercado } from '@/app/api/planeacion/brazo/mercado/route'

const RAIZ = path.join(__dirname, '..', 'scripts', 'ops', 'oficina-marketing')
const leer = (carpeta: 'vivo' | 'nuevo') => JSON.parse(fs.readFileSync(path.join(RAIZ, carpeta, 'X9F0zp6LQ2xGEYVS.json'), 'utf8'))
const vivo = leer('vivo'), nuevo = leer('nuevo')
const AsyncFunction = Object.getPrototypeOf(async () => 0).constructor
const CLIENTE = '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312'
const ENV = { SALA_DISPATCH_KEY: 'k-sala' }
const FICHA = { id: CLIENTE, name: 'Cafetería Prueba', industry: 'restaurante', website_url: 'https://cafeteria-prueba.example', country: 'Ecuador', config: {} }
const WEBHOOK = (body: Record<string, unknown>) => ({ 'Webhook · planeacion': [{ headers: { 'x-sala-dispatch-key': 'k-sala' }, body }] })
const web = (body: Record<string, unknown>) => ({ headers: { 'x-sala-dispatch-key': 'k-sala' }, body })

const elegir = (flujo: any, body: Record<string, unknown>, ficha: Record<string, unknown> = FICHA) =>
  recorrer(flujo, 'elegir brazos', ficha, { previos: WEBHOOK(body), hasta: ['V9 · ¿relleno permitido para Apify?'], env: ENV, http: async () => { throw new Error('elegir brazos no llama a nadie') } })

beforeEach(() => {
  supabaseMock.from.mockReset()
  vi.unstubAllGlobals()
  process.env.INTERNAL_API_KEY = 'llave-interna'
  process.env.FINANZAS_RUN_SDK_BASE = 'https://plataforma.test'
})

describe('el cableado de la rama nueva', () => {
  it('sale de «elegir brazos», pasa por su firma y entra por la 4.ª entrada de la junta (4 entradas)', () => {
    expect(nuevo.connections['elegir brazos'].main[0].map((c: any) => c.node)).toEqual([...vivo.connections['elegir brazos'].main[0].map((c: any) => c.node), 'Brazo · mercado'])
    expect(nuevo.connections['Brazo · mercado'].main[0]).toEqual([{ node: 'firma de la rama · mercado', type: 'main', index: 0 }])
    expect(nuevo.connections['firma de la rama · mercado'].main[0]).toEqual([{ node: 'Junta · esperar los 3 brazos', type: 'main', index: 3 }])
    expect(nuevo.nodes.find((n: any) => n.name === 'Junta · esperar los 3 brazos').parameters.numberInputs).toBe(4)
    // las otras tres entradas siguen donde estaban
    const entradas = Object.entries(nuevo.connections).flatMap(([de, c]: any) => (c.main ?? []).flat().filter((x: any) => x.node === 'Junta · esperar los 3 brazos').map((x: any) => [de, x.index]))
    expect(Object.fromEntries(entradas)).toMatchObject({ 'firma de la rama · mercado': 3 })
    expect(entradas.map((e: any) => e[1]).sort()).toEqual([0, 1, 2, 3])
  })
  it('«Brazo · mercado» es hermano de «Brazo · PostHog» (misma forma, otra ruta y otro nombre de brazo)', () => {
    const a = vivo.nodes.find((n: any) => n.name === 'Brazo · PostHog'), b = nuevo.nodes.find((n: any) => n.name === 'Brazo · mercado')
    expect(b.parameters.url).toContain('/api/planeacion/brazo/mercado')
    expect(b.parameters.jsonBody).toContain('pedidos: ($json.pedidos || []).filter(p => p.brazo === "mercado")')
    expect(b.parameters.options).toEqual(a.parameters.options)
    expect(b.parameters.headerParameters).toEqual(a.parameters.headerParameters)
    expect(b.onError).toBe(a.onError)
    for (const n of ['Brazo · mercado', 'firma de la rama · mercado']) expect(JSON.stringify(nuevo.nodes.find((x: any) => x.name === n))).not.toMatch(/posthog/i)
  })
})

describe('«⓪ Llave» · con_mercado', () => {
  const llave = (body: Record<string, unknown>) => recorrer(nuevo, '⓪ Llave · Webhook · planeacion', web(body), { env: ENV, hasta: ['V9 · ¿pide el pre-vuelo?'] })
  it('true, false, null o ausente pasan', async () => {
    for (const cm of [true, false, null, undefined]) expect((await llave({ client_id: CLIENTE, con_mercado: cm })).ultimo).toBe('V9 · ¿pide el pre-vuelo?')
  })
  it('🔴 cualquier otro valor DETIENE antes de gastar (un «true» entre comillas no enciende un gasto)', async () => {
    for (const raro of ['true', 'si', 1, 0, [], {}]) await expect(llave({ client_id: CLIENTE, con_mercado: raro })).rejects.toThrow(/PLANEACION_CON_MERCADO_INVALIDO/)
  })
})

describe('«elegir brazos» · apagado es el flujo de hoy', () => {
  it('sin con_mercado (o false) la salida es IDÉNTICA a la del vivo', async () => {
    for (const b of [{ client_id: CLIENTE }, { client_id: CLIENTE, con_mercado: false }, { client_id: CLIENTE, con_mercado: null }]) {
      const hoy = await elegir(vivo, b), ahora = await elegir(nuevo, b)
      expect(ahora.item).toEqual(hoy.item)
      expect(ahora.item.pedidos.some((p: any) => p.brazo === 'mercado')).toBe(false)
    }
  })
  it('un disparo que no es webhook (cron) tampoco pide mercado y no se cae', async () => {
    const r = await recorrer(nuevo, 'elegir brazos', FICHA, { hasta: ['V9 · ¿relleno permitido para Apify?'], env: ENV })
    expect(r.item.pedidos.some((p: any) => p.brazo === 'mercado')).toBe(false)
  })
  it('con con_mercado: true sale UN pedido más, a la rama nueva; los demás pedidos son los de hoy', async () => {
    const hoy = await elegir(vivo, { client_id: CLIENTE }), con = await elegir(nuevo, { client_id: CLIENTE, con_mercado: true })
    const extra = con.item.pedidos.filter((p: any) => p.brazo === 'mercado')
    expect(extra).toHaveLength(1)
    expect(extra[0]).toMatchObject({ brazo: 'mercado', objetivo: 'informe_mercado', params: {} })
    const sinOrden = (ps: any[]) => ps.filter((p) => p.brazo !== 'mercado').map(({ orden: _o, ...r }) => r)
    expect(sinOrden(con.item.pedidos)).toEqual(sinOrden(hoy.item.pedidos))
    expect(con.item.pedidos.map((p: any) => p.orden)).toEqual(con.item.pedidos.map((_: any, i: number) => i + 1))
    expect(con.item.descartados).toEqual(hoy.item.descartados)
  })
  it('un cliente sin rubro igual lo pide: el hueco lo declara la ruta («falta industry»), no este nodo', async () => {
    const con = await elegir(nuevo, { client_id: CLIENTE, con_mercado: true }, { ...FICHA, industry: 'unknown' })
    expect(con.item.pedidos.filter((p: any) => p.brazo === 'mercado')).toHaveLength(1)
  })
})

describe('el recorrido completo contra la RUTA REAL de CC1', () => {
  const MD = '- Señal: crece la demanda de desayunos tempranos · fuente: INEC, encuesta de hábitos 2026 (inec.gob.ec) · fecha: 2026-03 · confianza: media · oportunidad: promo de desayuno · faltó: cifra por ciudad\n- Señal: los pedidos por app suben · fuente: informe anual de la app X (app-x.com/informe) · fecha: 2026-01 · confianza: alta · oportunidad: menú delivery · faltó: ticket promedio\n- Señal: feriado largo en noviembre · fuente: calendario oficial · fecha: 2026-11 · confianza: alta · oportunidad: promoción de feriado · faltó: afluencia'
  const ficha = () => {
    const q: Record<string, any> = {}
    for (const m of ['select', 'eq']) q[m] = vi.fn(() => q)
    q.maybeSingle = vi.fn(async () => ({ data: { name: 'Cafetería Prueba', industry: 'restaurante', market: 'Quito', country: 'Ecuador' }, error: null }))
    supabaseMock.from.mockReturnValue(q)
  }
  // la «red» del flujo: la llamada a la ruta se hace en memoria con la misma cabecera y el mismo cuerpo que armó el nodo
  const rutaEnMemoria = (visto: { cuerpo?: any }): Http => async (url, headers, cuerpo) => {
    expect(url).toBe('https://api.test/api/planeacion/brazo/mercado')
    visto.cuerpo = cuerpo
    const r = await rutaMercado(new Request(url, { method: 'POST', headers: { ...headers, 'content-type': 'application/json' }, body: JSON.stringify(cuerpo) }))
    return { statusCode: r.status, body: await r.json() }
  }
  const correr = async (body: Record<string, unknown>, env: Record<string, string> = {}) => {
    const pedidos = (await elegir(nuevo, body)).item
    const visto: { cuerpo?: any } = {}
    const rama = await recorrer(nuevo, 'Brazo · mercado', pedidos, { env: { ...ENV, ...env }, http: rutaEnMemoria(visto), previos: { ...WEBHOOK(body), 'elegir brazos': [pedidos] }, hasta: ['firma de la rama · mercado'] })
    const firma = new AsyncFunction('$input', '$', '$env', '$workflow', '$execution', nuevo.nodes.find((n: any) => n.name === 'firma de la rama · mercado').parameters.jsCode)
    const dolar = (n: string) => ({ first: () => ({ json: n === 'elegir brazos' ? pedidos : {} }) })
    // el nodo HTTP no pide la respuesta completa: n8n entrega el CUERPO de la ruta como ítem (no el envoltorio del simulador)
    const salida = await firma({ all: () => [{ json: rama.item.body }] }, dolar, ENV, { id: 'wf' }, { id: 'ex' })
    return { pedidos, visto, material: salida.map((s: any) => s.json) }
  }

  it('ensayo (dry_run: true): la ruta contesta «sin_respuesta» DECLARADO, no llama al modelo y el material sale con el nombre del brazo', async () => {
    ficha()
    const fetchEspia = vi.fn(); vi.stubGlobal('fetch', fetchEspia)
    const r = await correr({ client_id: CLIENTE, con_mercado: true, dry_run: true })
    expect(fetchEspia).not.toHaveBeenCalled()
    expect(r.visto.cuerpo).toMatchObject({ brazo: 'mercado', client_id: CLIENTE, workflow_id: 'wf-puerta', workflow_execution_id: 'ex-1', dry_run: true })
    expect(r.visto.cuerpo.pedidos).toHaveLength(1)
    expect(r.material).toHaveLength(1)
    expect(r.material[0]).toMatchObject({ brazo: 'mercado', objetivo: 'informe_mercado', estado: 'sin_respuesta' })
    expect(r.material[0].motivo).toMatch(/ensayo|NO SE MIRÓ/i)
  })
  it('real (dry_run: false) con informe de 3 señales: «trajo», rotulado PROPUESTA y NO dato del cliente; el modelo se pide UNA vez con el tope por omisión', async () => {
    ficha()
    const fetchEspia = vi.fn(async () => new Response(JSON.stringify({ output: MD, cost_usd: 0.2 }), { status: 200 })); vi.stubGlobal('fetch', fetchEspia)
    const r = await correr({ client_id: CLIENTE, con_mercado: true, dry_run: false })
    expect(r.material).toHaveLength(1)
    const m = r.material[0]
    expect(m).toMatchObject({ brazo: 'mercado', objetivo: 'informe_mercado', estado: 'trajo' })
    expect(m.datos.es_dato_del_cliente).toBe(false)
    expect(m.datos.informe).toMatch(/PROPUESTA/)
    expect(m.fuente).toMatch(/PROPUESTA, no dato del cliente/)
    expect(fetchEspia).toHaveBeenCalledTimes(1)
    expect(JSON.parse((fetchEspia.mock.calls[0] as any)[1].body)).toMatchObject({ agent: 'market_research_analyst', client_id: CLIENTE })
  })
  it('🔴 la ruta que rechaza la llave NO se confunde con «no hay mercado»: llega como hueco con motivo y sin gasto', async () => {
    ficha()
    const fetchEspia = vi.fn(); vi.stubGlobal('fetch', fetchEspia)
    const r = await correr({ client_id: CLIENTE, con_mercado: true, dry_run: false }, { INTERNAL_API_KEY: 'llave-equivocada' })
    expect(fetchEspia).not.toHaveBeenCalled()
    expect(r.material).toHaveLength(1)
    // la ruta rechaza el sobre ENTERO (no sabe de qué objetivo hablaba) · la junta lo anota como hueco de «informe_mercado» («no llegó a la junta»), igual que con los otros brazos
    expect(r.material[0]).toMatchObject({ brazo: 'mercado', estado: 'sin_respuesta' })
    expect(r.material[0].motivo).toMatch(/rechaz/i)
  })
})

describe('la rama sin pedido no inventa material', () => {
  const firmaCon = (pedidos: any[], entrada: any) => {
    const f = new AsyncFunction('$input', '$', '$env', '$workflow', '$execution', nuevo.nodes.find((n: any) => n.name === 'firma de la rama · mercado').parameters.jsCode)
    return f({ all: () => [{ json: entrada }] }, () => ({ first: () => ({ json: { pedidos } }) }), {}, {}, {})
  }
  it('sin pedido a «mercado», la firma no produce ningún ítem (ni en éxito ni en error)', async () => {
    const pedidos = [{ brazo: 'apify', objetivo: 'sitio_propio' }]
    expect(await firmaCon(pedidos, { respuestas: [] })).toEqual([])
    expect(await firmaCon(pedidos, { error: { message: 'x' } })).toEqual([])
  })
  it('con pedido y un fallo de red, el hueco queda firmado como «mercado» (no «desconocido»)', async () => {
    const out = await firmaCon([{ brazo: 'mercado', objetivo: 'informe_mercado' }], { error: { message: 'ECONNRESET' } })
    expect(out).toHaveLength(1)
    expect(out[0].json).toMatchObject({ brazo: 'mercado', objetivo: 'informe_mercado' })
    expect(out[0].json.error).toBeTruthy()
  })
})

describe('la junta cuenta el cuarto brazo', () => {
  it('con material de mercado «trajo», brazos_pedidos y brazos_que_contestaron lo incluyen', async () => {
    const pedidos = [{ brazo: 'apify', objetivo: 'sitio_propio' }, { brazo: 'mercado', objetivo: 'informe_mercado' }]
    const junta = new AsyncFunction('$input', '$', '$env', '$workflow', '$execution', nuevo.nodes.find((n: any) => n.name === '[PLANEACIÓN] Junta de brazos').parameters.jsCode)
    const items = [
      { json: { brazo: 'apify', objetivo: 'sitio_propio', estado: 'sin_dato', datos: {}, fuente: 'a', motivo: 'se miró y no hay' } },
      { json: { brazo: 'mercado', objetivo: 'informe_mercado', estado: 'trajo', datos: { informe: '[informe de mercado · PROPUESTA: no es dato del cliente]\n- x', es_dato_del_cliente: false }, fuente: 'mercado · PROPUESTA, no dato del cliente' } },
    ]
    const dolar = (n: string) => ({ first: () => ({ json: n === 'elegir brazos' ? { pedidos, descartados: [] } : {} }), last: () => ({ json: {} }), all: () => [] })
    const out = await junta({ all: () => items, first: () => items[0] }, dolar, {}, { id: 'wf' }, { id: 'ex' })
    const j = out[0].json
    const texto = JSON.stringify(j)
    expect(texto).toContain('informe_mercado')
    expect(texto).toContain('es_dato_del_cliente')
    expect(j.resumen ?? j).toBeTruthy()
    expect(texto).toMatch(/"brazos_pedidos":2/)
    expect(texto).toMatch(/"brazos_que_contestaron":2/)
  })
})
