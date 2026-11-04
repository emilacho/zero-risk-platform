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
const pedido = (status: string, es_prueba: boolean, total_usd = 10, created_at = '2026-11-02T10:00:00Z', payment_status = 'CAPTURED', payment_method = 'PAYPHONE') => ({ status, es_prueba, total_usd, created_at, payment_status, payment_method })
const conPago = (status: string, payment_status: string, metodo = 'PAYPHONE') => pedido(status, false, 19.22, '2026-11-02T10:00:00Z', payment_status, metodo)

/** una base falsa con lo justo: tablas públicas y el área del sitio */
function base(o: { areas?: Record<string, unknown[]>; errorDeArea?: { code: string; message?: string }; slug?: unknown; sedes?: unknown[]; datos?: unknown[]; config?: unknown; explotar?: boolean; fichas?: unknown[]; errorDeFichas?: boolean } = {}) {
  const pedidas: string[] = []
  const consulta = (filas: unknown[], error: unknown = null) => {
    const c: Record<string, unknown> = {}
    for (const m of ['select', 'eq', 'in', 'order', 'is', 'or', 'limit']) c[m] = (...a: unknown[]) => { if (m === 'select') pedidas.push(String(a[0])); return c }
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
      if (t === 'cerebro_fichas') return consulta(o.fichas ?? [], o.errorDeFichas ? { code: '500', message: 'caída' } : null)
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
  it.each(['CANCELLED', 'cancelled', 'FAILED', 'REJECTED', 'EXPIRED', 'REFUNDED', 'ABANDONED', '', '  '])('🔴 «%s» sin marca no es venta, aunque esté cobrado', (s) => {
    expect(resumirPedidos([pedido(s, false)])).toMatchObject({ pedidos_reales: 0, no_concretados: 1, ingreso_usd: 0 })
  })
  it.each(['PENDING_PAYMENT', 'PENDING_LOCATION', 'PENDING_OPERATOR', 'PENDING_LOCATION_DETAIL', 'CONFIRMED', 'pending_payment'])('🔴 %s sin cobrar no es venta', (s) => {
    expect(resumirPedidos([conPago(s, 'PENDING')])).toMatchObject({ pedidos_reales: 0, no_concretados: 1, ingreso_usd: 0 })
  })
  it.each(['ACCEPTED', 'READY', 'DELIVERED', 'NEEDS_ATTENTION', 'PENDING'])('🔴 %s sin marca sí es venta', (s) => {
    expect(resumirPedidos([pedido(s, false, 19.22)])).toMatchObject({ pedidos_reales: 1, ingreso_usd: 19.22 })
  })
  // regla de CC4: las combinaciones de la tabla real, medidas el 4-nov, más la que señaló el certificador
  it.each([
    ['PENDING', 'CAPTURED', 'PAYPHONE'], // cobrado y despachado: el sitio lo deja así hasta que la cocina lo mueve
    ['ACCEPTED', 'CAPTURED', 'CARD_DEBIT'],
    ['READY', 'CAPTURED', 'PAYPHONE'],
    ['DELIVERED', 'CAPTURED', 'PAYPHONE'],
    ['NEEDS_ATTENTION', 'CAPTURED', 'PAYPHONE'], // cobrado sin motorizado
    ['PENDING_LOCATION', 'CAPTURED', 'PAYPHONE'], // ya se cobró: falta la ubicación
    ['DELIVERED', 'PARTIAL_REFUND', 'PAYPHONE'],
    ['DELIVERED', 'PENDING', 'CASH_ON_DELIVERY'], // el efectivo nunca pasa a cobrado
  ])('🔴 %s con pago %s por %s es venta', (estado, pago, metodo) => {
    expect(resumirPedidos([conPago(estado, pago, metodo)])).toMatchObject({ pedidos_reales: 1, no_concretados: 0, ingreso_usd: 19.22 })
  })
  it.each([
    ['CANCELLED', 'CAPTURED', 'PAYPHONE'], // cobrado y cancelado: ese dinero se devuelve
    ['CANCELLED', 'PENDING', 'CASH_ON_DELIVERY'],
    ['PENDING_PAYMENT', 'PENDING', 'PAYPHONE'],
    ['PENDING_PAYMENT', 'AUTHORIZED', 'PAYPHONE'], // retenido, todavía sin cobrar
    ['PENDING_LOCATION', 'PENDING', 'CASH_ON_DELIVERY'],
    ['PENDING', 'PENDING', 'CASH_ON_DELIVERY'], // efectivo sin entregar: puede no concretarse
    ['ACCEPTED', 'PENDING', 'CASH_ON_DELIVERY'],
    ['READY', 'PENDING', 'CASH_ON_DELIVERY'],
    ['DELIVERED', 'PENDING', 'PAYPHONE'], // entregado, pero no es efectivo y no se cobró
    ['DELIVERED', 'FAILED', 'PAYPHONE'],
    ['DELIVERED', 'REFUNDED', 'PAYPHONE'],
    ['DELIVERED', 'REFUNDED', 'CASH_ON_DELIVERY'], // efectivo devuelto
    ['PENDING', 'FAILED', 'PAYPHONE'],
  ])('🔴 %s con pago %s por %s no es venta', (estado, pago, metodo) => {
    expect(resumirPedidos([conPago(estado, pago, metodo)])).toMatchObject({ pedidos_reales: 0, no_concretados: 1, ingreso_usd: 0 })
  })
  it('🔴 la venta pagada del certificador ya no dice «sin ventas»', () => {
    expect(resumirPedidos([conPago('PENDING', 'CAPTURED')]).texto).toContain('1 pedido real por el sitio, US$ 19.22')
  })
  it('🔴 dice qué es la suma, también sin ventas: lleva el envío y no es lo que le queda al local', () => {
    expect(resumirPedidos([pedido('DELIVERED', false)]).ingreso_es).toContain('con el envío')
    expect(resumirPedidos([]).ingreso_es).toContain('no es lo que le queda al local')
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
    const r = await leerVentasDelSitio(base({ areas: { naufrago: [pedido('DELIVERED', true), conPago('PENDING_PAYMENT', 'PENDING')] }, sedes, datos: porAbrir }).db, CL)
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
  it('🔴 sin cliente no se consulta nada y lo dice, sin confundirlo con un cliente sin pedidos conectados', async () => {
    const r = await leerVentasDelSitio(base({ explotar: true }).db, null)
    expect(r).toMatchObject({ estado: 'sin_fuente', texto: 'no se indicó el cliente: no se sabe cuánto vende por el sitio' })
  })
  it('🔴 lee el pago y el método, sin los cuales no se distingue una venta', async () => {
    const b = base({ areas: { naufrago: [conPago('PENDING', 'CAPTURED')] } })
    expect(await leerVentasDelSitio(b.db, CL)).toMatchObject({ pedidos_reales: 1 })
    expect(b.pedidas.join(',')).toContain('payment_status')
    expect(b.pedidas.join(',')).toContain('payment_method')
  })
  it('🔴 si los pedidos no caben en el tope de páginas no dice «medido»: una suma incompleta no es una cifra', async () => {
    const pagina = Array.from({ length: 1000 }, () => pedido('DELIVERED', false, 1))
    const db = base().db
    const llena = () => { const c: Record<string, unknown> = { select: () => c, order: () => c, range: () => c, then: (ok: (r: unknown) => unknown) => ok({ data: pagina, error: null }) }; return c }
    const r = await leerVentasDelSitio({ from: db.from.bind(db), schema: () => ({ from: llena }) }, CL)
    expect(r).toMatchObject({ estado: 'no_se_pudo', pedidos_reales: 0 })
    expect(r.texto).not.toContain(SIN_VENTAS_DEL_SITIO)
  })
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
  type R = { estado: string; motivo?: string; datos: { visitas: number; conducta_de_visitas: { evento: string }[]; embudo?: unknown; nota_de_la_lectura: string; ventas_del_negocio: { texto: string; estado: string; por_la_web: { pedidos_reales: number; pruebas_excluidas: number; texto: string } } } }
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
    expect(r.datos.ventas_del_negocio.por_la_web).toMatchObject({ pedidos_reales: 0, pruebas_excluidas: 2 })
    expect(r.datos.ventas_del_negocio.por_la_web.texto).toBe('sin ventas reales por el sitio todavía; la sede de Guayaquil aún no abre')
  })
  it('🔴 la caja llega con lo del sitio como desglose', async () => {
    mocks.db = base({ areas: { naufrago: [pedido('DELIVERED', true)] }, fichas: [
      { atributo: 'metrica:loyverse:ingreso:ultimos_30_dias', provenance_tag: { metrica: { valor: 5799.3 }, datos: { ventana_hasta: '2026-11-04' } } },
      { atributo: 'metrica:loyverse:tickets:ultimos_30_dias', provenance_tag: { metrica: { valor: 524 } } },
    ] }).db
    const r = await pedir()
    expect(r.datos.ventas_del_negocio.estado).toBe('medido')
    expect(r.datos.ventas_del_negocio.texto).toContain('5799.30 en 524 tickets')
    expect(r.datos.ventas_del_negocio.texto).toContain('no se suma')
    expect(r.datos.ventas_del_negocio.por_la_web.pedidos_reales).toBe(0)
  })
  describe('el redactor corta los datos de cada brazo a 2.500 caracteres', () => {
    const CORTE = 2500
    const cuarentaEventos = Array.from({ length: 40 }, (_, i) => ['evento_de_conducta_numero_' + i, 100 - i, 50])
    beforeEach(() => { vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ results: cuarentaEventos }), { status: 200 }))) })
    it('🔴 con el tope de 40 tipos de evento, las ventas y su nota igual llegan', async () => {
      const r = await pedir()
      expect(r.datos.conducta_de_visitas).toHaveLength(40)
      const leido = JSON.stringify(r.datos).slice(0, CORTE)
      expect(JSON.stringify(r.datos).length).toBeGreaterThan(CORTE)
      expect(leido).toContain('sin ventas reales por el sitio todavía; la sede de Guayaquil aún no abre')
      expect(leido).toContain('no cuenta ventas')
    })
    it('🔴 la cifra de la caja entra en lo que lee el redactor, también con el tope de eventos', async () => {
      mocks.db = base({ fichas: [
        { atributo: 'metrica:loyverse:ingreso:ultimos_30_dias', provenance_tag: { metrica: { valor: 5799.3 }, datos: { ventana_hasta: '2026-11-04' } } },
        { atributo: 'metrica:loyverse:tickets:ultimos_30_dias', provenance_tag: { metrica: { valor: 524 } } },
      ] }).db
      const r = await pedir()
      const leido = JSON.stringify(r.datos).slice(0, CORTE)
      expect(JSON.stringify(r.datos).length).toBeGreaterThan(CORTE)
      expect(leido).toContain('5799.30 en 524 tickets')
      expect(leido).toContain('no se suma')
    })
    it('🔴 las ventas van antes que la lista de eventos', async () => {
      const llaves = Object.keys((await pedir()).datos)
      expect(llaves.indexOf('ventas_del_negocio')).toBeLessThan(llaves.indexOf('conducta_de_visitas'))
      expect(llaves.indexOf('nota_de_la_lectura')).toBeLessThan(llaves.indexOf('conducta_de_visitas'))
    })
  })
  it('🔴 si la analítica solo trae eventos de venta no dice que no registra ninguno, y las ventas igual llegan', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ results: [['order_submitted', 3, 2]] }), { status: 200 })))
    const r = await pedir()
    expect(r.estado).not.toBe('trajo')
    expect(r.motivo).toContain('solo registra eventos de venta')
    expect(r.motivo).not.toContain('no registra ningún evento')
    expect(r.motivo).toContain('sin ventas reales por el sitio todavía')
  })
  it('🔴 si la analítica responde vacía sigue diciendo que no registra ninguno', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ results: [] }), { status: 200 })))
    expect((await pedir()).motivo).toContain('no registra ningún evento')
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
    expect(r.datos.ventas_del_negocio.por_la_web.texto).not.toContain(SIN_VENTAS_DEL_SITIO)
  })
})
