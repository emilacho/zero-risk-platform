/**
 * EL BOTÓN «FLUJO DE LA CAMPAÑA» · el rojo por la bolsa mide el tope MAYOR de la planificación (🟡 de CC3 a #1174, 13:15Z).
 * Hoy todos los topes de la planificación valen US$ 1 (el piso), así que medir solo el del calendario daría lo mismo. Esta prueba sube el de la
 * ESTRATEGIA (como si alguien subiera su esperado) y exige que una campaña parada allí NO se dé por resuelta con una bolsa que solo alcanza para un calendario.
 */
import { describe, expect, it, vi } from 'vitest'

vi.mock('../constantes', async (importOriginal) => {
  const real = await importOriginal<typeof import('../constantes')>()
  return { ...real, topeDelPaso: (p: Parameters<typeof real.topeDelPaso>[0]) => (p === 'estrategia' ? 1.6 : real.topeDelPaso(p)) }
})

import { causaQueSigue, topeDeLaPlanificacion } from '../flujo-de-campana'
import type { Almacen, Campana } from '../almacen'

const campana = { id: 'c-1', client_id: 'k', estado: 'necesita_humano', estado_motivo: 'el presupuesto de planificación se agotó (US$ 5.00 de 6)', presupuesto_planificacion_usd: 6, tope_gasto_usd: 6 } as unknown as Campana // 18-nov (grupo A): el tope de la campaña en 6, para que la regla no agrande la bolsa y la prueba siga midiendo el tope mayor
const almacen = (gastado: number) => ({ corridasDeCampana: async () => [{ paso: 'estrategia', costo_usd: gastado, estado: 'ok' }] }) as unknown as Almacen

describe('el tope mayor de la planificación', () => {
  it('con la estrategia a US$ 1,60, el tope que se mide es 1,60 (no el 1 del calendario)', () => {
    expect(topeDeLaPlanificacion()).toBe(1.6)
  })
  it('🔴 una bolsa que alcanza para un calendario (5 + 1 ≤ 6) pero NO para la estrategia (5 + 1,6 > 6): la causa SIGUE', async () => {
    expect(await causaQueSigue(almacen(5), campana)).toMatch(/sigue sin alcanzar/)
  })
  it('con lo que alcanza para la estrategia (4,4 + 1,6 = 6): resuelta', async () => {
    expect(await causaQueSigue(almacen(4.4), campana)).toBeNull()
  })
})
