/** 02-nov · los pedidos del manual los vigila el mismo riesgo que los del plan, y el título dice de qué documento son. */
import { describe, expect, it } from 'vitest'
import { DbFalsa } from '../src/lib/oficina/__tests__/dbfalsa'
import { leerRiesgos } from '../src/lib/direccion/riesgos'
import type { Contexto } from '../src/lib/direccion/comun'

const AHORA = new Date('2026-11-02T15:00:00Z')
const C = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const hace = (min: number) => new Date(AHORA.getTime() - min * 60_000).toISOString()
const titulos = async (filas: Array<Record<string, unknown>>) => {
  const db = new DbFalsa().semilla('clients', [{ id: C, name: 'Uno', status: 'active' }]).semilla('plan_cambios', filas)
  const r = await leerRiesgos({ db, ahora: () => AHORA, env: {} } as unknown as Contexto)
  return r.riesgos.filter((x) => String(x.id).startsWith('cambios')).map((x) => x.titulo)
}

describe('🔴 riesgos de los pedidos del manual', () => {
  it('no se pudo despertar: lo dice del manual', async () => {
    expect(await titulos([{ id: 'p', client_id: C, documento: 'manual', estado: 'pendiente', despertado: false, actualizado_en: hace(1) }])).toEqual(['Pedido de cambios al manual: no se pudo despertar la reescritura'])
  })
  it('el del plan sigue hablando del plan', async () => {
    expect(await titulos([{ id: 'p', client_id: C, documento: 'plan', estado: 'pendiente', despertado: false, actualizado_en: hace(1) }])).toEqual(['Pedido de cambios al plan: no se pudo despertar la reescritura'])
  })
  it('🔴 el manual que falló no esconde al plan que falló, ni al revés', async () => {
    const t = await titulos([{ id: 'a', client_id: C, documento: 'manual', estado: 'fallido', despertar_detalle: 'sin cambios reales', actualizado_en: hace(1) }, { id: 'b', client_id: C, documento: 'plan', estado: 'fallido', despertar_detalle: 'x', actualizado_en: hace(2) }])
    expect(t.some((x) => /al manual/.test(x))).toBe(true)
    expect(t.some((x) => /al plan/.test(x))).toBe(true)
  })
  it('🔴 un pedido del manual que salió bien después limpia solo los suyos', async () => {
    const t = await titulos([{ id: 'a', client_id: C, documento: 'manual', estado: 'aplicado', actualizado_en: hace(1) }, { id: 'b', client_id: C, documento: 'plan', estado: 'fallido', despertar_detalle: 'x', actualizado_en: hace(2) }])
    expect(t).toHaveLength(1)
    expect(t[0]).toMatch(/al plan/)
  })
})
