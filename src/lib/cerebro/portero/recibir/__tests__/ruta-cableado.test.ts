/** PASO 7 · la ruta `recibir` entrega a `recibir` las piezas REALES: la llamada de texto, la llamada con visión (H3), el registro, la lectura y el almacén. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { llamarAlModelo, llamarAlModeloConImagen } from '@/lib/cerebro/portero/modelo'
import { recibir } from '@/lib/cerebro/portero/recibir/recibir'
import { POST } from '@/app/api/brain/portero/recibir/route'

vi.mock('@/lib/cerebro/portero/recibir/recibir', () => ({ recibir: vi.fn(async () => ({ status: 200, cuerpo: { ok: true } })) }))

const LLAVE = 'llave-interna-de-prueba'
let antes: string | undefined
beforeEach(() => { antes = process.env.INTERNAL_API_KEY; process.env.INTERNAL_API_KEY = LLAVE })
afterEach(() => { if (antes === undefined) delete process.env.INTERNAL_API_KEY; else process.env.INTERNAL_API_KEY = antes; vi.clearAllMocks() })

describe('el cableado de la ruta `recibir`', () => {
  it('con la llave interna, entrega a `recibir` la llamada de texto Y la llamada con visión reales, el registro, la lectura y el almacén; devuelve lo que `recibir` contesta', async () => {
    const r = await POST(new Request('http://localhost/api/brain/portero/recibir', { method: 'POST', headers: { 'x-api-key': LLAVE }, body: JSON.stringify({ cliente: 'c1' }) }))
    expect(r.status).toBe(200)
    expect(await r.json()).toEqual({ ok: true })
    const deps = vi.mocked(recibir).mock.calls[0][0]
    expect(deps.llamarModelo).toBe(llamarAlModelo)
    expect(deps.llamarModeloConImagen).toBe(llamarAlModeloConImagen)
    for (const k of ['consulta', 'almacen', 'registrar'] as const) expect(deps[k], k).toBeDefined()
    expect(typeof deps.almacen.aplicar).toBe('function')
  })
  it('un cuerpo que no es JSON → 400 sin llamar a `recibir`', async () => {
    const r = await POST(new Request('http://localhost/api/brain/portero/recibir', { method: 'POST', headers: { 'x-api-key': LLAVE }, body: 'no es json' }))
    expect(r.status).toBe(400)
    expect(recibir).not.toHaveBeenCalled()
  })
})
