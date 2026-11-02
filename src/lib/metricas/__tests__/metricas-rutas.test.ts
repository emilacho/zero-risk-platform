/** Las rutas de métricas exigen la llave interna; sin ella ni tocan la base. US$ 0. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { POST as registrar } from '@/app/api/metricas/registrar/route'
import { POST as vincular } from '@/app/api/metricas/vincular/route'
import { GET as resumen } from '@/app/api/metricas/resumen/route'

const base = vi.hoisted(() => ({ getSupabaseAdmin: vi.fn(() => { throw new Error('no debía tocar la base') }) }))
vi.mock('@/lib/supabase', () => ({ getSupabaseAdmin: base.getSupabaseAdmin }))

const URL_BASE = 'https://x.test/api/metricas'
const previa = process.env.INTERNAL_API_KEY

describe('la llave interna', () => {
  beforeEach(() => { process.env.INTERNAL_API_KEY = 'llave-de-prueba'; base.getSupabaseAdmin.mockClear() })
  afterEach(() => { if (previa === undefined) delete process.env.INTERNAL_API_KEY; else process.env.INTERNAL_API_KEY = previa })

  it.each([
    ['registrar', registrar], ['vincular', vincular],
  ])('🔴 %s sin llave responde 401', async (nombre, ruta) => {
    const r = await ruta(new Request(`${URL_BASE}/${nombre}`, { method: 'POST', body: '{}' }))
    expect(r.status).toBe(401)
    expect(base.getSupabaseAdmin).not.toHaveBeenCalled()
  })

  it('🔴 resumen sin llave responde 401', async () => {
    expect((await resumen(new Request(`${URL_BASE}/resumen?client_id=x`))).status).toBe(401)
    expect(base.getSupabaseAdmin).not.toHaveBeenCalled()
  })
})
