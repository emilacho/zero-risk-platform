/**
 * 21-nov · a1 de CC6 en #1268 · la RUTA `GET /api/tablero-estado-del-pedido` pide la llave interna (`x-api-key`): sin ella o con otra, 401 y no lee nada;
 * con la buena, entrega lo que dice el estado del pedido con su status y sin caché. Si leer lanza, 503 `estado_ilegible`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({ lecturas: [] as unknown[], lanza: null as string | null }))
vi.mock('@/lib/cadena/almacen-supabase', () => ({ almacenDeSupabase: () => ({ soy: 'el almacén' }) }))
vi.mock('@/lib/cadena/crear-campana', () => ({
  estadoParaElTablero: async (al: unknown, q: unknown) => {
    h.lecturas.push({ al, q })
    if (h.lanza) throw new Error(h.lanza)
    return { status: 200, cuerpo: { ok: true, pedido_id: 'p1', estado_del_pedido: 'en_proceso' } }
  },
}))
import { GET } from '@/app/api/tablero-estado-del-pedido/route'

const CLIENTE = '11111111-1111-4111-8111-111111111111', LLAVE = '22222222-2222-4222-8222-222222222222'
const URL_ = `https://app.test/api/tablero-estado-del-pedido?client_id=${CLIENTE}&llave_formulario=${LLAVE}&seco=true`
const pedir = (cabeceras: Record<string, string> = {}) => GET(new Request(URL_, { headers: cabeceras }))
let antes: string | undefined
beforeEach(() => { antes = process.env.INTERNAL_API_KEY; process.env.INTERNAL_API_KEY = 'llave-interna-de-prueba'; h.lecturas = []; h.lanza = null })
afterEach(() => { if (antes === undefined) delete process.env.INTERNAL_API_KEY; else process.env.INTERNAL_API_KEY = antes })

describe('GET /api/tablero-estado-del-pedido · la llave interna', () => {
  it('🔴 sin x-api-key: 401 y no lee nada', async () => {
    const r = await pedir()
    expect(r.status).toBe(401)
    expect(await r.json()).toMatchObject({ ok: false, error: 'unauthorized' })
    expect(h.lecturas).toEqual([])
  })
  it('🔴 con otra llave: 401 y no lee nada', async () => {
    const r = await pedir({ 'x-api-key': 'llave-interna-de-prueBA' })
    expect(r.status).toBe(401)
    expect(h.lecturas).toEqual([])
  })
  it('🔴 con la llave buena: 200 con estado_del_pedido, sin caché, y lee con los parámetros tal cual', async () => {
    const r = await pedir({ 'x-api-key': 'llave-interna-de-prueba' })
    expect(r.status).toBe(200)
    expect(r.headers.get('cache-control')).toBe('no-store')
    expect(await r.json()).toEqual({ ok: true, pedido_id: 'p1', estado_del_pedido: 'en_proceso' })
    expect(h.lecturas).toEqual([{ al: { soy: 'el almacén' }, q: { client_id: CLIENTE, llave_formulario: LLAVE, seco: 'true' } }])
  })
  it('🔴 si leer lanza: 503 estado_ilegible (nunca un 200 que el tablero tome por «en proceso»)', async () => {
    h.lanza = 'la base cayó'
    const r = await pedir({ 'x-api-key': 'llave-interna-de-prueba' })
    expect(r.status).toBe(503)
    expect(await r.json()).toMatchObject({ ok: false, error: 'estado_ilegible' })
  })
})
