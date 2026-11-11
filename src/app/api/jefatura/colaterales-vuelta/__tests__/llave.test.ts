/**
 * 11-nov · #1028 🟡 de CC6 · la LLAVE de la ruta `api/jefatura/colaterales-vuelta`: sin llave → 401 · la llave interna NO vale → 401 ·
 * sin `SALA_DISPATCH_KEY` configurada → 503 (cerrada) · con la llave de la sala, llega a la vuelta. Nada toca la base (los puertos se reemplazan).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const recibir = vi.fn(async () => ({ status: 200, cuerpo: { accion: 'juzgada' } }))
vi.mock('@/lib/colaterales/vuelta', async (orig) => ({ ...(await orig<typeof import('@/lib/colaterales/vuelta')>()), recibirVueltaColateral: recibir }))
vi.mock('@/lib/colaterales/puertos-supabase', () => ({ puertosDeSupabase: () => ({}) }))

const SALA = 'llave-de-la-sala-de-prueba'
const INTERNA = 'llave-interna-de-prueba'
const pedido = (cabeceras: Record<string, string>) =>
  new Request('https://x/api/jefatura/colaterales-vuelta', { method: 'POST', headers: { 'content-type': 'application/json', ...cabeceras }, body: JSON.stringify({ marcas: {}, salida: {} }) })

describe('colaterales-vuelta · la llave', () => {
  const antes = { sala: process.env.SALA_DISPATCH_KEY, interna: process.env.INTERNAL_API_KEY }
  beforeEach(() => { process.env.SALA_DISPATCH_KEY = SALA; process.env.INTERNAL_API_KEY = INTERNA; recibir.mockClear() })
  afterEach(() => { process.env.SALA_DISPATCH_KEY = antes.sala; process.env.INTERNAL_API_KEY = antes.interna })

  it('sin llave → 401 y no llega a la vuelta', async () => {
    const { POST } = await import('../route')
    expect((await POST(pedido({}))).status).toBe(401)
    expect(recibir).not.toHaveBeenCalled()
  })
  it('la llave interna no vale (ni como x-api-key ni como llave de la sala) → 401', async () => {
    const { POST } = await import('../route')
    expect((await POST(pedido({ 'x-api-key': INTERNA }))).status).toBe(401)
    expect((await POST(pedido({ 'x-sala-dispatch-key': INTERNA }))).status).toBe(401)
    expect(recibir).not.toHaveBeenCalled()
  })
  it('sin SALA_DISPATCH_KEY configurada → 503 (cerrada), aunque traiga una llave', async () => {
    delete process.env.SALA_DISPATCH_KEY
    const { POST } = await import('../route')
    expect((await POST(pedido({ 'x-sala-dispatch-key': SALA }))).status).toBe(503)
    expect(recibir).not.toHaveBeenCalled()
  })
  it('con la llave de la sala → llega a la vuelta', async () => {
    const { POST } = await import('../route')
    const r = await POST(pedido({ 'x-sala-dispatch-key': SALA }))
    expect(r.status).toBe(200)
    expect(recibir).toHaveBeenCalledTimes(1)
  })
})
