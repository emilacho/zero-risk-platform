/**
 * 04-nov · lo marcado como prueba no entra al plan, para cualquier sitio. La corrida del 4-nov leyó «988 visitas → 3 pedidos» donde los pedidos eran pruebas del dueño.
 */
import fs from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BANDERA_DE_LA_CASA, condicionDeLaCasa, condicionDesdeElCorte, condicionesHogQL, fundirConElCorte, hayVentasEnElEmbudo, leerDatosDePrueba, rotuloDeExclusion } from '../src/lib/planeacion/datos-de-prueba'

describe('la marca de la casa', () => {
  it('🔴 un evento marcado no cuenta, en cualquier sitio y sin tocar su ficha', () => {
    expect(BANDERA_DE_LA_CASA).toBe('es_prueba')
    expect(condicionDeLaCasa()).toContain("coalesce(toString(properties.es_prueba), '') not in ('true', '1')")
  })
  it('🔴 la consulta del brazo la lleva siempre y dice si no hay ventas', () => {
    const r = fs.readFileSync('src/app/api/planeacion/brazo/posthog/route.ts', 'utf8')
    expect(r).toContain('condicionesHogQL(prueba) + condicionDeLaCasa()')
    expect(r).toContain('ventas_por_el_sitio: SIN_VENTAS_DEL_SITIO')
  })
})

describe('lo de venta anterior a una fecha', () => {
  const dp = leerDatosDePrueba({ pedidos_de_prueba_hasta: '2026-11-04' })
  it('🔴 no va como condición de la consulta completa: en producción daba 504 con match y con like', () => {
    expect(condicionesHogQL(dp)).toBe('')
  })
  it('🔴 la segunda consulta pide solo lo ocurrido desde el corte', () => {
    expect(condicionDesdeElCorte(dp)).toBe(" and timestamp >= parseDateTimeBestEffort('2026-11-04')")
    expect(condicionDesdeElCorte(null)).toBe('')
    expect(condicionDesdeElCorte(leerDatosDePrueba({ nota: 'x', distinct_ids: ['a'] }))).toBe('')
  })
  it('🔴 lo dice en el rótulo', () => { expect(rotuloDeExclusion(dp)).toContain('lo de venta anterior al 2026-11-04') })
  it('🔴 una fecha mala se descarta y se declara: no borra nada', () => {
    const m = leerDatosDePrueba({ pedidos_de_prueba_hasta: "2026'; drop" })
    expect(m?.pedidos_de_prueba_hasta).toBeNull()
    expect(m?.descartado).toContain('pedidos_de_prueba_hasta no es una fecha')
    expect(condicionDesdeElCorte(m)).toBe('')
  })
  it('🔴 sin nada en la ficha, nada cambia', () => {
    expect(leerDatosDePrueba({})).toBeNull()
    expect(condicionesHogQL(null)).toBe('')
  })
})

describe('la fecha de corte con hora (el valor real de la ficha)', () => {
  const corte = '2026-11-04T20:39:48Z'
  const dp = leerDatosDePrueba({ pedidos_de_prueba_hasta: corte })
  it('🔴 se acepta y llega entera a la consulta', () => {
    expect(dp?.pedidos_de_prueba_hasta).toBe(corte)
    expect(dp?.descartado).toEqual([])
    expect(condicionDesdeElCorte(dp)).toContain("timestamp >= parseDateTimeBestEffort('2026-11-04T20:39:48Z')")
  })
})

describe('fundir las dos consultas', () => {
  // nombres y cifras del embudo real de Náufrago, medido 4-nov
  const fila = (evento: string, veces: number) => ({ evento, veces, personas: 1 })
  const completa = [fila('$pageview', 1000), fila('menu_viewed', 74), fila('cart_opened', 69), fila('error_en_el_navegador', 50), fila('checkout_started', 48), fila('order_delivered', 4), fila('order_submitted', 3)]
  it('🔴 lo de venta anterior al corte desaparece; lo demás queda intacto', () => {
    expect(fundirConElCorte(completa, [fila('$pageview', 9)]).map((f) => f.evento)).toEqual(['$pageview', 'menu_viewed', 'error_en_el_navegador'])
    expect(fundirConElCorte(completa, [fila('$pageview', 9)])[0].veces).toBe(1000)
  })
  it('🔴 un pedido real posterior al corte sí cuenta, con su cifra de después', () => {
    const r = fundirConElCorte(completa, [fila('order_submitted', 2), fila('cart_opened', 5)])
    expect(r.find((f) => f.evento === 'order_submitted')?.veces).toBe(2)
    expect(r.find((f) => f.evento === 'cart_opened')?.veces).toBe(5)
    expect(r.find((f) => f.evento === 'order_delivered')).toBeUndefined()
  })
  it('🔴 sale ordenado por veces, como la consulta', () => {
    expect(fundirConElCorte([fila('menu_viewed', 74), fila('$pageview', 1000)], [fila('order_paid', 80)]).map((f) => f.veces)).toEqual([1000, 80, 74])
  })
  it.each(['cart_opened', 'checkout_started', 'order_submitted', 'payment_succeeded', 'purchase', 'pedido_entregado', 'pago_confirmado', 'compra'])('🔴 %s se trata como venta', (e) => {
    expect(fundirConElCorte([fila(e, 3)], [])).toEqual([])
  })
  it.each(['$pageview', 'menu_viewed', 'ruleta_spun', 'error_en_el_navegador'])('🔴 %s no se trata como venta', (e) => {
    expect(fundirConElCorte([fila(e, 3)], [])).toHaveLength(1)
  })
})

describe('el brazo con corte, de punta a punta con la analítica falsa', () => {
  let sqls: string[] = []
  beforeEach(() => {
    process.env.INTERNAL_API_KEY = 'k'
    process.env.POSTHOG_PROJECT_ID = '1'
    process.env.POSTHOG_PERSONAL_API_KEY = 'x'
    process.env.POSTHOG_API_URL = 'https://ph.test'
    sqls = []
    vi.stubGlobal('fetch', vi.fn(async (_u: string, init: { body: string }) => {
      const sql = JSON.parse(init.body).query.query as string
      sqls.push(sql)
      const results = sql.includes('parseDateTimeBestEffort') ? [['$pageview', 2, 1], ['order_submitted', 1, 1]] : [['$pageview', 1000, 422], ['order_submitted', 3, 2], ['order_delivered', 4, 4]]
      return new Response(JSON.stringify({ results }), { status: 200 })
    }))
  })
  afterEach(() => vi.unstubAllGlobals())
  const pedir = async (params: Record<string, unknown>) => {
    const { POST } = await import('@/app/api/planeacion/brazo/posthog/route')
    const r = await POST(new Request('https://x.test/api/planeacion/brazo/posthog', { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': 'k' }, body: JSON.stringify({ pedidos: [{ brazo: 'posthog', objetivo: 'analitica_propia', params }] }) }))
    return ((await r.json()).respuestas[0]) as { estado: string; motivo?: string; datos: { visitas: number; embudo: { evento: string; veces: number }[]; pruebas_excluidas?: string } }
  }
  it('🔴 visitas de la completa, ventas solo de después del corte', async () => {
    const r = await pedir({ dominio: 'sitio.ec', datos_de_prueba: { pedidos_de_prueba_hasta: '2026-11-04T20:39:48Z' } })
    expect(sqls).toHaveLength(2)
    expect(r.datos.visitas).toBe(1000)
    expect(r.datos.embudo).toEqual([{ evento: '$pageview', veces: 1000, personas: 422 }, { evento: 'order_submitted', veces: 1, personas: 1 }])
    expect(r.datos.pruebas_excluidas).toContain('lo de venta anterior al 2026-11-04')
  })
  it('🔴 las dos consultas llevan la marca de la casa', async () => {
    await pedir({ dominio: 'sitio.ec', datos_de_prueba: { pedidos_de_prueba_hasta: '2026-11-04T20:39:48Z' } })
    for (const q of sqls) expect(q).toContain('properties.es_prueba')
  })
  it('🔴 sin corte en la ficha, una sola consulta: nada cambia ni cuesta más', async () => {
    const r = await pedir({ dominio: 'sitio.ec' })
    expect(sqls).toHaveLength(1)
    expect(r.datos.embudo.map((f) => f.evento)).toContain('order_delivered')
  })
  it('🔴 si falla la consulta del corte, el brazo no entrega ventas de prueba como reales: avisa', async () => {
    vi.stubGlobal('fetch', vi.fn(async (_u: string, init: { body: string }) => (JSON.parse(init.body).query.query.includes('parseDateTimeBestEffort') ? new Response('{}', { status: 504 }) : new Response(JSON.stringify({ results: [['order_submitted', 3, 2]] }), { status: 200 }))))
    const r = await pedir({ dominio: 'sitio.ec', datos_de_prueba: { pedidos_de_prueba_hasta: '2026-11-04T20:39:48Z' } })
    expect(r.estado).toBe('sin_respuesta')
    expect(r.motivo).toContain('504')
  })
})

describe('sin ventas reales', () => {
  it('🔴 con un pedido real no lo dice', () => { expect(hayVentasEnElEmbudo(['$pageview', 'order_submitted'])).toBe(true) })
  it('🔴 abrir un carrito no es una venta', () => { expect(hayVentasEnElEmbudo(['$pageview', 'cart_opened', 'checkout_started'])).toBe(false) })
  it('🔴 sin eventos de venta, lo dice', () => { expect(hayVentasEnElEmbudo(['$pageview', 'menu_viewed'])).toBe(false) })
  it.each(['order_submitted', 'order_delivered', 'order_paid', 'order_completed', 'order_placed', 'order_confirmed', 'checkout_completed', 'payment_succeeded', 'payment_completed', 'purchase', 'pedido_entregado', 'pago_confirmado', 'compra'])('🔴 %s es una venta', (e) => { expect(hayVentasEnElEmbudo([e])).toBe(true) })
  it.each(['order_viewed', 'order_created', 'order_cancelled', 'order_failed', 'cart_opened', 'checkout_started', 'payment_failed', 'pedido_iniciado', 'pago_fallido', 'compra_cancelada'])('🔴 %s no es una venta', (e) => { expect(hayVentasEnElEmbudo([e])).toBe(false) })
})
