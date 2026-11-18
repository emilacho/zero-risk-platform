/**
 * ENCARGO 2 de Cerebro (17-nov) · pedido de CC6 (p6): los hechos del negocio van DESPUÉS del vigilante y aparte.
 * La ruta devuelve el MISMO código y el MISMO cuerpo del vigilante, con hechos y sin hechos; solo suma `hechos_del_negocio`. Un fallo de los hechos no cambia nada más.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({ vigilante: { status: 200, body: {} as Record<string, unknown> }, hechos: vi.fn(), origen: vi.fn() }))
vi.mock('@/lib/internal-auth', () => ({ checkInternalKey: () => ({ ok: true }) }))
vi.mock('@/lib/supabase', () => ({ getSupabaseAdmin: () => ({}) }))
vi.mock('@/lib/portero-alimenta/datos', () => ({ interruptoresDelEntorno: () => ({}), umbralesDeGastoDelEntorno: () => ({}) }))
vi.mock('@/lib/portero-alimenta/avisos', () => ({ avisarAAlertas: () => async () => undefined, apagarFlujoDelPortero: () => async () => undefined }))
vi.mock('@/lib/portero-alimenta/modo', () => ({ modoDelEntorno: () => ({ modo: 'normal' }) }))
vi.mock('@/lib/portero-alimenta/anomalia', () => ({ umbralesDeAnomaliaDelEntorno: () => ({}) }))
vi.mock('@/lib/portero-alimenta/vigilante', () => ({ rutaVigilar: async () => m.vigilante }))
vi.mock('@/lib/portero-alimenta/hechos-preguntas', () => ({ hechosDeLaCorridaDelVigilante: m.hechos, preguntarPorHttp: () => async () => ({ status: 200, body: {} }) }))
vi.mock('@/lib/finanzas/conversa/modelo-run-sdk', () => ({ baseDeRunSdk: () => 'http://x' }))
vi.mock('@/lib/portero-alimenta/origen-de-lo-ajeno', () => ({ origenDeLaCorridaDelVigilante: m.origen }))

import { POST } from '@/app/api/brain/alimentar/vigilar/route'

const llamar = async () => {
  const r = await POST(new Request('http://x/api/brain/alimentar/vigilar', { method: 'POST', body: JSON.stringify({ dry_run: false, workflow_id: 'wf', workflow_execution_id: 'ex' }) }))
  return { status: r.status, body: (await r.json()) as Record<string, unknown> }
}
const DEL_VIGILANTE = { ok: true, apagado: false, clientes: [{ client_id: 'c1', salud: 'bien' }], motivo: null }

describe('🔴 la ruta del vigilante: los hechos no cambian ni su código ni su cuerpo', () => {
  beforeEach(() => { m.hechos.mockReset(); m.origen.mockReset(); m.origen.mockResolvedValue(null) })
  it.each([200, 207, 409, 500])('código %s del vigilante: igual con hechos, sin hechos y con hechos que fallan', async (status) => {
    m.vigilante = { status, body: { ...DEL_VIGILANTE } }
    m.hechos.mockResolvedValueOnce([{ client_id: 'c1', estado: 'ok', hechos: 3, sin_dato: 4 }])
    const con = await llamar()
    m.hechos.mockResolvedValueOnce(null)
    const sin = await llamar()
    m.hechos.mockRejectedValueOnce(new Error('se cayó la lectura'))
    const falla = await llamar()
    expect([con.status, sin.status, falla.status]).toEqual([status, status, status])
    expect(sin.body).toEqual(DEL_VIGILANTE)
    expect(con.body).toEqual({ ...DEL_VIGILANTE, hechos_del_negocio: [{ client_id: 'c1', estado: 'ok', hechos: 3, sin_dato: 4 }] })
    expect(falla.body).toEqual({ ...DEL_VIGILANTE, hechos_del_negocio: { error: 'se cayó la lectura' } })
  })
  it('los hechos reciben lo que revisó el vigilante (su cuerpo) y el pedido original', async () => {
    m.vigilante = { status: 200, body: { ...DEL_VIGILANTE } }
    m.hechos.mockResolvedValueOnce(null)
    await llamar()
    expect(m.hechos).toHaveBeenCalledWith(expect.anything(), { dry_run: false, workflow_id: 'wf', workflow_execution_id: 'ex' }, DEL_VIGILANTE)
  })

  // ENCARGO 3 de Cerebro, fase B: el origen de lo ajeno va igual de aparte
  it.each([200, 207, 409, 500])('código %s: el origen de lo ajeno tampoco cambia ni el código ni el cuerpo del vigilante', async (status) => {
    m.vigilante = { status, body: { ...DEL_VIGILANTE } }
    const ORIGEN = [{ tabla: 'client_social_images', client_id: 'c1', estado: 'ok', clasificadas: 2 }]
    m.hechos.mockResolvedValue(null)
    m.origen.mockResolvedValueOnce(ORIGEN)
    const con = await llamar()
    m.origen.mockRejectedValueOnce(new Error('se cayó la clasificación'))
    const falla = await llamar()
    m.origen.mockResolvedValueOnce(null)
    const sin = await llamar()
    expect([con.status, falla.status, sin.status]).toEqual([status, status, status])
    expect(con.body).toEqual({ ...DEL_VIGILANTE, origen_de_lo_ajeno: ORIGEN })
    expect(falla.body).toEqual({ ...DEL_VIGILANTE, origen_de_lo_ajeno: { error: 'se cayó la clasificación' } })
    expect(sin.body).toEqual(DEL_VIGILANTE)
  })
  it('con hechos y origen a la vez, van los dos; el origen recibe el pedido original y el cuerpo del vigilante', async () => {
    m.vigilante = { status: 207, body: { ...DEL_VIGILANTE } }
    m.hechos.mockResolvedValueOnce([{ client_id: 'c1' }])
    m.origen.mockResolvedValueOnce([{ client_id: 'c1' }])
    const r = await llamar()
    expect(r).toEqual({ status: 207, body: { ...DEL_VIGILANTE, hechos_del_negocio: [{ client_id: 'c1' }], origen_de_lo_ajeno: [{ client_id: 'c1' }] } })
    expect(m.origen).toHaveBeenCalledWith(expect.anything(), { dry_run: false, workflow_id: 'wf', workflow_execution_id: 'ex' }, DEL_VIGILANTE)
  })
})
