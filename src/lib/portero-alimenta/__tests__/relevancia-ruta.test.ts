/**
 * La ruta `/api/brain/alimentar/juicio-de-lo-ajeno` (encargo 4): llave interna, pide cliente, ensayo por omisión y pasa el pedido tal cual (con dobles: no llama al modelo).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({ auth: { ok: true } as { ok: boolean; reason?: string }, juzgar: vi.fn(), deps: vi.fn(() => ({ soy: 'deps' })) }))
vi.mock('@/lib/internal-auth', () => ({ checkInternalKey: () => m.auth }))
vi.mock('@/lib/supabase', () => ({ getSupabaseAdmin: () => ({}) }))
vi.mock('@/lib/portero-alimenta/relevancia', () => ({ juzgarRelevancia: m.juzgar }))
vi.mock('@/lib/portero-alimenta/relevancia-entorno', () => ({ depsDeRelevanciaDelEntorno: m.deps }))

import { POST } from '@/app/api/brain/alimentar/juicio-de-lo-ajeno/route'

const C1 = '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312'
const pedir = async (cuerpo: unknown) => {
  const r = await POST(new Request('http://x/api/brain/alimentar/juicio-de-lo-ajeno', { method: 'POST', body: typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo) }))
  return { status: r.status, body: (await r.json()) as Record<string, unknown> }
}

describe('la ruta del juicio de relevancia', () => {
  beforeEach(() => { m.auth = { ok: true }; m.juzgar.mockReset(); m.juzgar.mockResolvedValue({ estado: 'ok', juzgadas: 0 }) })
  it('sin llave interna: 401 y no juzga', async () => {
    m.auth = { ok: false, reason: 'x' }
    expect((await pedir({ client_id: C1 })).status).toBe(401)
    expect(m.juzgar).not.toHaveBeenCalled()
  })
  it('JSON roto o sin cliente: 400', async () => {
    expect((await pedir('{')).status).toBe(400)
    expect((await pedir({})).body).toEqual({ error: 'falta_client_id' })
    expect(m.juzgar).not.toHaveBeenCalled()
  })
  it('por omisión es ENSAYO y escribe; pasa flujo, tandas e ids', async () => {
    await pedir({ client_id: C1 })
    expect(m.juzgar).toHaveBeenLastCalledWith({ soy: 'deps' }, { clientes: [C1], dry_run: true, workflow_id: undefined, workflow_execution_id: undefined, tandas_por_cliente: undefined, ids: undefined, escribir: true, hasta: expect.any(Number) })
    await pedir({ clientes: [C1, ' '], dry_run: false, workflow_id: 'w', workflow_execution_id: 'e', tandas: 2, ids: ['a', 3], escribir: false })
    expect(m.juzgar).toHaveBeenLastCalledWith({ soy: 'deps' }, { clientes: [C1], dry_run: false, workflow_id: 'w', workflow_execution_id: 'e', tandas_por_cliente: 2, ids: ['a'], escribir: false, hasta: expect.any(Number) })
  })
  it('la hora límite cuenta desde que entra el pedido (300 s de la ruta menos 20 s)', async () => {
    const antes = Date.now()
    await pedir({ client_id: C1 })
    const hasta = m.juzgar.mock.calls[0][1].hasta as number
    expect(hasta).toBeGreaterThanOrEqual(antes + 280_000)
    expect(hasta).toBeLessThanOrEqual(Date.now() + 280_000)
  })
  it('dry_run solo se apaga con false exacto', async () => {
    await pedir({ client_id: C1, dry_run: 'false' })
    expect(m.juzgar.mock.calls[0][1].dry_run).toBe(true)
  })
  it('responde ok según el estado; un error del juicio es 500', async () => {
    m.juzgar.mockResolvedValueOnce({ estado: 'apagado' })
    expect((await pedir({ client_id: C1 })).body).toEqual({ ok: false, estado: 'apagado' })
    m.juzgar.mockRejectedValueOnce(new Error('caída'))
    expect(await pedir({ client_id: C1 })).toEqual({ status: 500, body: { error: 'relevancia_error', detalle: 'caída' } })
  })
})
