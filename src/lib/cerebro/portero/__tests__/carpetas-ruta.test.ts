/**
 * Encargo 7 (21-nov) · pedido a1 de CC6 en #1271: la ruta de carpetas es la puerta de TODO el vault de un cliente,
 * así que exige la llave interna: sin ella 401 y NO lee nada (ni una consulta a la base). Mismo patrón que la ruta `recibir`.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/cerebro/portero/entorno', () => ({ consultaDelEntorno: vi.fn(() => async () => ({ filas: [], error: null })) }))

import { GET } from '@/app/api/brain/portero/carpetas/route'
import { consultaDelEntorno } from '@/lib/cerebro/portero/entorno'

const ANTES = process.env.INTERNAL_API_KEY
beforeAll(() => { process.env.INTERNAL_API_KEY = 'llave-de-prueba' })
afterAll(() => { if (ANTES === undefined) delete process.env.INTERNAL_API_KEY; else process.env.INTERNAL_API_KEY = ANTES })

describe('GET /api/brain/portero/carpetas', () => {
  it('🔴 sin la llave interna → 401 y no lee nada', async () => {
    const r = await GET(new Request('http://localhost/api/brain/portero/carpetas?client_id=c1'))
    expect(r.status).toBe(401)
    expect((await r.json()).code).toBe('E-AUTH-001')
    expect(vi.mocked(consultaDelEntorno)).not.toHaveBeenCalled()
  })
  it('con una llave equivocada → 401 y tampoco lee', async () => {
    const r = await GET(new Request('http://localhost/api/brain/portero/carpetas?client_id=c1', { headers: { 'x-api-key': 'no-es' } }))
    expect(r.status).toBe(401)
    expect(vi.mocked(consultaDelEntorno)).not.toHaveBeenCalled()
  })
  it('con la llave correcta sí pasa (la prueba no es vacía): 200 y una sola lectura del entorno', async () => {
    const r = await GET(new Request('http://localhost/api/brain/portero/carpetas?client_id=c1', { headers: { 'x-api-key': 'llave-de-prueba' } }))
    expect(r.status).toBe(200)
    expect(vi.mocked(consultaDelEntorno)).toHaveBeenCalledTimes(1)
  })
})
