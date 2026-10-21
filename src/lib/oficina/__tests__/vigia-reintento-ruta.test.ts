/**
 * La ruta del vigía de la oficina con el reintento de piezas colgado (③): después de lo demás, nunca lo frena, y en seco solo calcula.
 * Se prueba la RUTA real con sus piezas simuladas (llave, puertos, trabajos), para fijar el ORDEN y que ningún camino escriba de más.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
  orden: [] as string[],
  llaveOk: true,
  estado: 'encendida' as 'apagada' | 'encendida',
  reintento: { accion: 'vigilado', emitidos: 2 } as Record<string, unknown>,
  argsReintento: [] as unknown[],
}))
vi.mock('@/lib/oficina/ruta', () => ({
  checkLlaveDeLaSala: () => (h.llaveOk ? { ok: true } : { ok: false, status: 401, error: 'unauthorized', detalle: 'falta la llave' }),
  esObjeto: (v: unknown) => typeof v === 'object' && v !== null && !Array.isArray(v),
  puertosReales: () => ({ P: { almacen: { leerConfig: async () => ({ estado: h.estado, familias_activas: [], clientes_ensayo: [] }) }, ahora: () => new Date('2026-10-21T12:00:00Z') }, db: {} }),
}))
vi.mock('@/lib/oficina/vigia', () => ({
  vencerBandeja: async () => { h.orden.push('bandeja'); return { vencidas: ['a'] } },
  revisarPasosMuertos: async () => { h.orden.push('muertos'); return { reanudar: [], fallidos: [], cierres: [] } },
}))
vi.mock('@/lib/oficina/reintento-adaptador', () => ({
  reintentoDeLaCadena: async (_db: unknown, env: unknown, o: { ejecutar: boolean }) => { h.orden.push(o.ejecutar ? 'reintento' : 'reintento_en_seco'); h.argsReintento.push({ env, o }); return h.reintento },
}))
import { POST } from '@/app/api/oficina/vigia/route'

const llamar = (cuerpo: unknown) => POST(new Request('https://app.test/api/oficina/vigia', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(cuerpo) }))
beforeEach(() => { h.orden = []; h.llaveOk = true; h.estado = 'encendida'; h.reintento = { accion: 'vigilado', emitidos: 2 }; h.argsReintento = [] })

describe('POST /api/oficina/vigia con el reintento de piezas', () => {
  it('una pasada normal: primero la bandeja, luego los pasos muertos, DESPUÉS el reintento, y la respuesta lo trae', async () => {
    const r = await llamar({}); const j = await r.json()
    expect(r.status).toBe(200); expect(h.orden).toEqual(['bandeja', 'muertos', 'reintento'])
    expect(j).toMatchObject({ accion: 'vigilado', vencidas: ['a'], reintento: { accion: 'vigilado', emitidos: 2 } })
    expect(h.argsReintento[0]).toMatchObject({ o: { ejecutar: true } })
  })
  it('si el reintento falla (devuelve error), lo demás ya quedó hecho y la respuesta sigue siendo 200', async () => {
    h.reintento = { accion: 'error', detalle: 'caída' }
    const r = await llamar({}); const j = await r.json()
    expect(r.status).toBe(200); expect(h.orden).toEqual(['bandeja', 'muertos', 'reintento']); expect(j.reintento).toMatchObject({ accion: 'error' }); expect(j.vencidas).toEqual(['a'])
  })
  it('«reintento_en_seco»: SOLO calcula el plan; no vence la bandeja, no toca pasos muertos y no ejecuta el reintento', async () => {
    const r = await llamar({ reintento_en_seco: true }); const j = await r.json()
    expect(r.status).toBe(200); expect(h.orden).toEqual(['reintento_en_seco']); expect(j).toMatchObject({ accion: 'reintento_en_seco', reintento: { accion: 'vigilado' } })
    expect(h.argsReintento[0]).toMatchObject({ o: { ejecutar: false } })
  })
  it('«dry_run: true» no escribe nada: ni bandeja, ni pasos muertos, ni reintento', async () => {
    const r = await llamar({ dry_run: true }); expect((await r.json()).accion).toBe('dry_run'); expect(h.orden).toEqual([])
  })
  it('con la oficina apagada no hace nada (tampoco reintenta)', async () => {
    h.estado = 'apagada'
    const r = await llamar({}); expect((await r.json()).accion).toBe('apagada'); expect(h.orden).toEqual([])
  })
  it('sin la llave de la sala: 401 y nada corre (tampoco el plan en seco)', async () => {
    h.llaveOk = false
    expect((await llamar({})).status).toBe(401); expect((await llamar({ reintento_en_seco: true })).status).toBe(401); expect(h.orden).toEqual([])
  })
  it('un «reintento_en_seco» que no es el booleano verdadero NO cuenta como seco (corre la pasada normal)', async () => {
    await llamar({ reintento_en_seco: 'true' }); expect(h.orden).toEqual(['bandeja', 'muertos', 'reintento'])
  })
})
