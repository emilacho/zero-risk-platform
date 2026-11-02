/** Las rutas del archivo exigen la llave interna; sin ella ni tocan la base. US$ 0. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { POST as archivar } from '@/app/api/cadena/archivo/archivar/route'
import { POST as desarchivar } from '@/app/api/cadena/archivo/desarchivar/route'
import { POST as recuperar } from '@/app/api/cadena/archivo/recuperar-pieza/route'

const base = vi.hoisted(() => ({ getSupabaseAdmin: vi.fn(() => { throw new Error('no debía tocar la base') }) }))
vi.mock('@/lib/supabase', () => ({ getSupabaseAdmin: base.getSupabaseAdmin }))

const previa = process.env.INTERNAL_API_KEY

describe('la llave interna', () => {
  beforeEach(() => { process.env.INTERNAL_API_KEY = 'llave-de-prueba'; base.getSupabaseAdmin.mockClear() })
  afterEach(() => { if (previa === undefined) delete process.env.INTERNAL_API_KEY; else process.env.INTERNAL_API_KEY = previa })

  it.each([['archivar', archivar], ['desarchivar', desarchivar], ['recuperar-pieza', recuperar]])('🔴 %s sin llave responde 401', async (nombre, ruta) => {
    const r = await ruta(new Request(`https://x.test/api/cadena/archivo/${nombre}`, { method: 'POST', body: '{}' }))
    expect(r.status).toBe(401)
    expect(base.getSupabaseAdmin).not.toHaveBeenCalled()
  })
})
