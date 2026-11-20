/**
 * 21-nov · CC7 r1 sobre #1259 · la ruta del mínimo de «Crear Campaña» pide la llave interna: sin ella (o con otra) 401 y NO lee la base.
 * Con la llave buena llega al almacén (aquí uno simulado que cuenta las llamadas). US$ 0, sin red.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const leidas: string[] = []
vi.mock('@/lib/cadena/almacen-supabase', () => ({ almacenDeSupabase: () => ({ marca: 'almacen' }) }))
vi.mock('@/lib/cadena/crear-campana', () => ({
  minimoParaElFormulario: async (_al: unknown, q: { client_id: string }) => { leidas.push(q.client_id); return { status: 200, cuerpo: { ok: true, minimo_usd: 52 } } },
}))

import { GET } from '@/app/api/tablero-minimo-de-campana/route'

const URL_ = 'https://x.test/api/tablero-minimo-de-campana?client_id=0b5d3c2a-1111-4c4c-8d8d-000000000001'
const antes = process.env.INTERNAL_API_KEY
beforeEach(() => { process.env.INTERNAL_API_KEY = 'k-interna'; leidas.length = 0 })
afterEach(() => { process.env.INTERNAL_API_KEY = antes })

describe('GET /api/tablero-minimo-de-campana', () => {
  it('🔴 sin la llave interna: 401 y no lee nada', async () => {
    const r = await GET(new Request(URL_))
    expect(r.status).toBe(401)
    expect(leidas).toEqual([])
  })
  it('🔴 con otra llave: 401 y no lee nada', async () => {
    const r = await GET(new Request(URL_, { headers: { 'x-api-key': 'otra' } }))
    expect(r.status).toBe(401)
    expect(leidas).toEqual([])
  })
  it('🔴 con la llave buena: lee el mínimo de ese cliente', async () => {
    const r = await GET(new Request(URL_, { headers: { 'x-api-key': 'k-interna' } }))
    expect(r.status).toBe(200)
    expect(await r.json()).toEqual({ ok: true, minimo_usd: 52 })
    expect(leidas).toEqual(['0b5d3c2a-1111-4c4c-8d8d-000000000001'])
  })
})
