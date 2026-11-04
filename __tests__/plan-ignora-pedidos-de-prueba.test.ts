/**
 * 04-nov · las ventas del sitio salen de los pedidos y la analítica queda como conducta de visitas. La corrida del 4-nov leyó «988 visitas → 3 pedidos» donde los pedidos eran pruebas del dueño.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BANDERA_DE_LA_CASA, condicionDeLaCasa, soloConducta } from '../src/lib/planeacion/datos-de-prueba'
import { leerVentasDelSitio, resumirPedidos, SIN_VENTAS_DEL_SITIO, type DbDeVentas } from '../src/lib/planeacion/ventas-del-sitio'

const mocks = vi.hoisted(() => ({ db: null as unknown }))
vi.mock('@/lib/supabase', () => ({ getSupabaseAdmin: () => mocks.db }))

const CL = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
// los estados reales de la tabla de pedidos de Náufrago, medidos el 4-nov
const pedido = (status: string, es_prueba: boolean, total_usd = 10, created_at = '2026-11-02T10:00:00Z') => ({ status, es_prueba, total_usd, created_at })

/** una base falsa con lo justo: tablas públicas y el área del sitio */
function base(o: { areas?: Record<string, unknown[]>; errorDeArea?: { code: string; message?: string }; slug?: unknown; sedes?: unknown[]; datos?: unknown[]; config?: unknown; explotar?: boolean } = {}) {
  const pedidas: string[] = []
  const consulta = (filas: unknown[], error: unknown = null) => {
    const c: Record<string, unknown> = {}
    for (const m of ['select', 'eq', 'in', 'order']) c[m] = (...a: unknown[]) => { if (m === 'select') pedidas.push(String(a[0])); return c }
    c.range = (a: number, b: number) => { c.pagina = filas.slice(a, b + 1); return c }
    c.then = (ok: (r: unknown) => unknown) => ok({ data: error ? null : (c.pagina ?? filas), error })
    return c
  }
  const db = {
    from(t: string) {
      if (o.explotar) throw new Error('caída')
      if (t === 'clients') return consulta([{ slug: 'slug' in o ? o.slug : 'naufrago', config: o.config ?? {} }])
      if (t === 'client_sedes') return consulta(o.sedes ?? [])
      if (t === 'client_sede_datos') return consulta(o.datos ?? [])
      throw new Error('tabla inesperada ' + t)
    },
    schema(s: string) {
      return { from: () => (o.errorDeArea ? consulta([], o.errorDeArea) : s in (o.areas ?? {}) ? consulta((o.areas ?? {})[s]) : consulta([], { code: 'PGRST106', message: 'Invalid schema' })) }
    },
  }
  return { db: db as unknown as DbDeVentas, pedidas }
}

describe('qué cuenta como venta', () => {
  it('🔴 lo marcado como prueba no cuenta, aunque esté entregado', () => {
    const r = resumirPedidos([pedido('DELIVERED', true), pedido('ACCEPTED', true), pedido('READY', true)])
    expect(r).toMatchObject({ pedidos_reales: 0, ingreso_usd: 0, pruebas_excluidas: 3, primera_venta: null })
  })
  it.each(['PENDING_PAYMENT', 'PENDING_LOCATION', 'CANCELLED', 'pending_payment', 'FAILED', ''])('🔴 %s sin marca no es venta', (s) => {
    expect(resumirPedidos([pedido(s, false)])).toMatchObject({ pedidos_reales: 0, no_concretados: 1, ingreso_usd: 0 })
  })
  it.each(['ACCEPTED', 'READY', 'DELIVERED'])('🔴 %s sin marca sí es venta', (s) => {
    expect(resumirPedidos([pedido(s, false, 19.22)])).toMatchObject({ pedidos_reales: 1, ingreso_usd: 19.22 })
  })
  it('🔴 suma, redondea y dice el período', () => {
    const r = resumirPedidos([pedido('DELIVERED', false, 10.1, '2026-11-03T00:00:00Z'), pedido('READY', false, 0.2, '2026-11-01T00:00:00Z'), pedido('DELIVERED', true, 99, '2026-10-01T00:00:00Z')])
    expect(r).toMatchObject({ pedidos_reales: 2, ingreso_usd: 10.3, primera_venta: '2026-11-01T00:00:00Z', ultima_venta: '2026-11-03T00:00:00Z', pruebas_excluidas: 1 })
    expect(r.texto).toBe('2 pedidos reales por el sitio, US$ 10.3 en total, del 2026-11-01 al 2026-11-03')
  })
  it('un total ilegible no vuelve inválida la suma', () => {
    expect(resumirPedidos([pedido('READY', false, 'x' as never), pedido('READY', false, 5)])).toMatchObject({ pedidos_reales: 2, ingreso_usd: 5 })
  })
})

describe('lo que recibe quien redacta', () => {
  it('🔴 con 0 reales y la sede por abrir dice la frase firmada', () => {
    expect(resumirPedidos([pedido('DELIVERED', true)], ['Guayaquil']).texto).toBe('sin ventas reales por el sitio todavía; la sede de Guayaquil aún no abre')
  })
  it('sin sede por abrir no inventa ninguna', () => { expect(resumirPedidos([]).texto).toBe(SIN_VENTAS_DEL_SITIO) })
  it('varias sedes', () => { expect(resumirPedidos([], ['A', 'B', 'C']).texto).toContain('las sedes de A, B y C aún no abren') })
})

describe('leer de la base', () => {
  const sedes = [{ id: 's1', clave: 'guayaquil', ciudad: 'Guayaquil' }, { id: 's2', clave: 'olon', ciudad: 'Olon' }]
  const porAbrir = [{ sede_id: 's1', campo: 'estado_de_la_sede', valor_texto: 'por abrir', observado_en: '2026-10-15T22:13:16Z' }]

  it('🔴 lee el área del cliente y la sede sale de la base', async () => {
    const r = await leerVentasDelSitio(base({ areas: { naufrago: [pedido('DELIVERED', true), pedido('PENDING_PAYMENT', false)] }, sedes, datos: porAbrir }).db, CL)
    expect(r).toMatchObject({ estado: 'medido', pedidos_reales: 0, pruebas_excluidas: 1, no_concretados: 1, sedes_por_abrir: ['Guayaquil'] })
    expect(r.texto).toBe('sin ventas reales por el sitio todavía; la sede de Guayaquil aún no abre')
  })
  it('🔴 lo más nuevo manda: una sede que ya abrió no se menciona', async () => {
    const datos = [...porAbrir, { sede_id: 's1', campo: 'estado_de_la_sede', valor_texto: 'abierta', observado_en: '2026-11-01T00:00:00Z' }]
    expect((await leerVentasDelSitio(base({ areas: { naufrago: [] }, sedes, datos }).db, CL)).sedes_por_abrir).toEqual([])
  })
  it('🔴 la ficha manda sobre el dato de la sede', async () => {
    const r = await leerVentasDelSitio(base({ areas: { naufrago: [] }, sedes, datos: porAbrir, config: { apify: { sedes_estado: { guayaquil: 'abierta', olon: 'por_abrir' } } } }).db, CL)
    expect(r.sedes_por_abrir).toEqual(['Olon'])
  })
  it('🔴 cliente sin tabla: dice que no se sabe, jamás «sin ventas»', async () => {
    const r = await leerVentasDelSitio(base({ slug: 'otro_cliente', areas: {} }).db, CL)
    expect(r.estado).toBe('sin_fuente')
    expect(r.texto).not.toContain(SIN_VENTAS_DEL_SITIO)
    expect(r.texto).toContain('no se sabe')
  })
  it.each(['PGRST205', '42P01', '3F000'])('🔴 %s también es sin tabla', async (code) => {
    expect((await leerVentasDelSitio(base({ errorDeArea: { code } }).db, CL)).estado).toBe('sin_fuente')
  })
  it.each(['con-guion', 'Mayus', '', null, "x'; drop"])('🔴 un slug «%s» no se usa como área', async (slug) => {
    expect((await leerVentasDelSitio(base({ slug, areas: { [String(slug)]: [pedido('DELIVERED', false)] } }).db, CL)).estado).toBe('sin_fuente')
  })
  it('🔴 lectura fallida: dice que no se sabe, jamás «sin ventas»', async () => {
    const r = await leerVentasDelSitio(base({ errorDeArea: { code: '42703', message: 'no existe la columna es_prueba' } }).db, CL)
    expect(r.estado).toBe('no_se_pudo')
    expect(r.texto).not.toContain(SIN_VENTAS_DEL_SITIO)
  })
  it('🔴 base caída: no revienta y no afirma', async () => {
    const r = await leerVentasDelSitio(base({ explotar: true }).db, CL)
    expect(r.estado).toBe('no_se_pudo')
    expect(r.texto).not.toContain(SIN_VENTAS_DEL_SITIO)
  })
  it('sin cliente no se consulta nada', async () => { expect((await leerVentasDelSitio(base().db, null)).estado).toBe('sin_fuente') })
  it('🔴 no pide datos del comprador', async () => {
    const b = base({ areas: { naufrago: [] } })
    await leerVentasDelSitio(b.db, CL)
    expect(b.pedidas.join(',')).not.toMatch(/customer|phone|email|address|\*/)
  })
  it('🔴 lee todas las páginas, no solo las primeras mil', async () => {
    const filas = Array.from({ length: 2500 }, () => pedido('DELIVERED', false, 1))
    expect(await leerVentasDelSitio(base({ areas: { naufrago: filas } }).db, CL)).toMatchObject({ pedidos_reales: 2500, ingreso_usd: 2500 })
  })
})

describe('la analítica queda como conducta', () => {
  const fila = (evento: string) => ({ evento, veces: 3, personas: 1 })
  it('🔴 un evento marcado no cuenta, en cualquier sitio y sin tocar su ficha', () => {
    expect(BANDERA_DE_LA_CASA).toBe('es_prueba')
    expect(condicionDeLaCasa()).toContain("coalesce(toString(properties.es_prueba), '') not in ('true', '1')")
  })
  it.each(['cart_opened', 'cart', 'checkout_started', 'order_submitted', 'order_delivered', 'payment_succeeded', 'purchase', 'Purchase', 'pedido_entregado', 'pago_confirmado', 'compra'])('🔴 %s no sale de la analítica', (e) => {
    expect(soloConducta([fila(e)])).toEqual([])
  })
  it.each(['$pageview', 'menu_viewed', 'ruleta_spun', 'error_en_el_navegador', 'reorder', 'ver_carta', 'carta_vista'])('🔴 %s sí sale', (e) => {
    expect(soloConducta([fila(e)])).toHaveLength(1)
  })
})

describe('el brazo de punta a punta, con analítica y base falsas', () => {
  let sqls: string[] = []
  const conPedidos = () => base({ areas: { naufrago: [pedido('DELIVERED', true), pedido('DELIVERED', true)] }, sedes: [{ id: 's1', clave: 'guayaquil', ciudad: 'Guayaquil' }], datos: [{ sede_id: 's1', campo: 'estado_de_la_sede', valor_texto: 'por abrir', observado_en: '2026-10-15T00:00:00Z' }] }).db
  beforeEach(() => {
    process.env.INTERNAL_API_KEY = 'k'
    process.env.POSTHOG_PROJECT_ID = '1'
    process.env.POSTHOG_PERSONAL_API_KEY = 'x'
    process.env.POSTHOG_API_URL = 'https://ph.test'
    mocks.db = conPedidos()
    sqls = []
    vi.stubGlobal('fetch', vi.fn(async (_u: string, init: { body: string }) => {
      sqls.push(JSON.parse(init.body).query.query as string)
      return new Response(JSON.stringify({ results: [['$pageview', 1000, 422], ['cart_opened', 69, 52], ['order_submitted', 3, 2], ['menu_viewed', 74, 55]] }), { status: 200 })
    }))
  })
  afterEach(() => vi.unstubAllGlobals())
  type R = { estado: string; motivo?: string; datos: { visitas: number; conducta_de_visitas: { evento: string }[]; embudo?: unknown; nota_de_la_lectura: string; ventas_del_sitio: { pedidos_reales: number; pruebas_excluidas: number; texto: string } } }
  const pedir = async () => {
    const { POST } = await import('@/app/api/planeacion/brazo/posthog/route')
    const r = await POST(new Request('https://x.test/api/planeacion/brazo/posthog', { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': 'k' }, body: JSON.stringify({ client_id: CL, pedidos: [{ brazo: 'posthog', objetivo: 'analitica_propia', params: { dominio: 'sitio.ec' } }] }) }))
    return ((await r.json()).respuestas[0]) as R
  }
  it('🔴 sin embudo: visitas sí, carrito y pedido de la analítica no', async () => {
    const r = await pedir()
    expect(r.datos.embudo).toBeUndefined()
    expect(r.datos.visitas).toBe(1000)
    expect(r.datos.conducta_de_visitas.map((f) => f.evento)).toEqual(['$pageview', 'menu_viewed'])
    expect(r.datos.nota_de_la_lectura).toContain('no cuenta ventas')
    expect(JSON.stringify(r.datos)).not.toContain('order_submitted')
  })
  it('🔴 las ventas salen de los pedidos, con la frase firmada', async () => {
    const r = await pedir()
    expect(r.datos.ventas_del_sitio).toMatchObject({ pedidos_reales: 0, pruebas_excluidas: 2 })
    expect(r.datos.ventas_del_sitio.texto).toBe('sin ventas reales por el sitio todavía; la sede de Guayaquil aún no abre')
  })
  it('🔴 una sola consulta a la analítica, con la marca de la casa', async () => {
    await pedir()
    expect(sqls).toHaveLength(1)
    expect(sqls[0]).toContain('properties.es_prueba')
  })
  it('🔴 si la analítica falla, las ventas igual llegan y el fallo se dice', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 504 })))
    const r = await pedir()
    expect(r.estado).toBe('sin_respuesta')
    expect(r.motivo).toContain('504')
    expect(r.motivo).toContain('sin ventas reales por el sitio todavía; la sede de Guayaquil aún no abre')
  })
  it('🔴 si fallan los pedidos, las visitas llegan y no se afirma «sin ventas»', async () => {
    mocks.db = base({ errorDeArea: { code: '42703' } }).db
    const r = await pedir()
    expect(r.estado).toBe('trajo')
    expect(r.datos.visitas).toBe(1000)
    expect(r.datos.ventas_del_sitio.texto).not.toContain(SIN_VENTAS_DEL_SITIO)
  })
})
