/**
 * 04-nov · lo marcado como prueba no entra al plan, para cualquier sitio. La corrida del 4-nov leyó «988 visitas → 3 pedidos» donde los pedidos eran pruebas del dueño.
 */
import fs from 'node:fs'
import { describe, expect, it } from 'vitest'
import { BANDERA_DE_LA_CASA, condicionDeLaCasa, condicionesHogQL, hayVentasEnElEmbudo, leerDatosDePrueba, rotuloDeExclusion } from '../src/lib/planeacion/datos-de-prueba'

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
  it('🔴 deja fuera carrito, cobro y pedido anteriores; las visitas siguen', () => {
    const q = condicionesHogQL(dp)
    expect(q).toContain("not (match(event, '^(cart|checkout|order|payment|purchase|pedido|pago|compra)') and timestamp < parseDateTimeBestEffort('2026-11-04'))")
    expect(new RegExp('^(cart|checkout|order|payment|purchase|pedido|pago|compra)').test('$pageview')).toBe(false)
    expect(new RegExp('^(cart|checkout|order|payment|purchase|pedido|pago|compra)').test('menu_viewed')).toBe(false)
  })
  it('🔴 lo dice en el rótulo', () => { expect(rotuloDeExclusion(dp)).toContain('lo de venta anterior al 2026-11-04') })
  it('🔴 una fecha mala se descarta y se declara: no borra nada', () => {
    const m = leerDatosDePrueba({ pedidos_de_prueba_hasta: "2026'; drop" })
    expect(m?.pedidos_de_prueba_hasta).toBeNull()
    expect(m?.descartado).toContain('pedidos_de_prueba_hasta no es una fecha')
    expect(condicionesHogQL(m)).toBe('')
  })
  it('🔴 sin nada en la ficha, nada cambia', () => {
    expect(leerDatosDePrueba({})).toBeNull()
    expect(condicionesHogQL(null)).toBe('')
  })
})

describe('la fecha de corte con hora (el valor real de la ficha)', () => {
  const corte = '2026-11-04T18:06:00Z'
  const dp = leerDatosDePrueba({ pedidos_de_prueba_hasta: corte })
  it('🔴 se acepta y llega entera a la consulta', () => {
    expect(dp?.pedidos_de_prueba_hasta).toBe(corte)
    expect(dp?.descartado).toEqual([])
    expect(condicionesHogQL(dp)).toContain("timestamp < parseDateTimeBestEffort('2026-11-04T18:06:00Z')")
  })
})

describe('sin ventas reales', () => {
  it('🔴 con un pedido real no lo dice', () => { expect(hayVentasEnElEmbudo(['$pageview', 'order_submitted'])).toBe(true) })
  it('🔴 abrir un carrito no es una venta', () => { expect(hayVentasEnElEmbudo(['$pageview', 'cart_opened', 'checkout_started'])).toBe(false) })
  it('🔴 sin eventos de venta, lo dice', () => { expect(hayVentasEnElEmbudo(['$pageview', 'menu_viewed'])).toBe(false) })
  it.each(['order_submitted', 'order_delivered', 'order_paid', 'order_completed', 'order_placed', 'order_confirmed', 'checkout_completed', 'payment_succeeded', 'payment_completed', 'purchase', 'pedido_entregado', 'pago_confirmado', 'compra'])('🔴 %s es una venta', (e) => { expect(hayVentasEnElEmbudo([e])).toBe(true) })
  it.each(['order_viewed', 'order_created', 'order_cancelled', 'order_failed', 'cart_opened', 'checkout_started', 'payment_failed', 'pedido_iniciado', 'pago_fallido', 'compra_cancelada'])('🔴 %s no es una venta', (e) => { expect(hayVentasEnElEmbudo([e])).toBe(false) })
})
