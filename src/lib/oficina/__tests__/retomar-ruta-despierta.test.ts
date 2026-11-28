/**
 * 27-nov · GO Lenovo 18:25Z · punto (3): la ruta de turnos DESPIERTA al flujo de la oficina tras reanudar, redibujar y retomar (aviso de CC2 26-nov 18:15Z:
 * `reanudar` dejaba la pieza `en_paso` sin que nadie la moviera). Las funciones del orquestador van simuladas: aquí se prueba el cableado de la ruta. US$ 0.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const MOTIVO = 'el id de foto acortado ya se resuelve (#1287)'
const CAUSA = 'el corte de 800 s del flujo ya se arregló (#1286)'

// ── LA RUTA · reanudar, redibujar y retomar DESPIERTAN al flujo de la oficina cuando lo que sigue es un turno de empleado (aviso de CC2 26-nov 18:15Z)
const mocks = vi.hoisted(() => ({
  reanudar: vi.fn(), redibujar: vi.fn(), retomar: vi.fn(),
}))
vi.mock('@/lib/supabase', () => ({ getSupabaseAdmin: () => ({ from: () => { throw new Error('la ruta no debe leer la base en esta prueba') } }) }))
vi.mock('@/lib/oficina/mesa/orquestador', async (orig) => ({ ...(await orig<object>()), reanudarMesa: mocks.reanudar }))
vi.mock('@/lib/oficina/retomar', async (orig) => ({ ...(await orig<object>()), redibujarPropuestas: mocks.redibujar, retomarMesaCortada: mocks.retomar }))

describe('🔴 la ruta de turnos despierta al flujo tras reanudar, redibujar y retomar', () => {
  const ID = '2a4bf4b5-747b-4740-b8ca-74ee59c754b2'
  const TURNO = { n: 20, paso: 'mesa:integrar:x', agente: 'director' }
  const req = (cuerpo: unknown) => new Request('https://app.test/api/oficina/turnos', { method: 'POST', headers: { 'content-type': 'application/json', 'x-sala-dispatch-key': 'la-llave' }, body: JSON.stringify(cuerpo) })
  const previa = { k: process.env.SALA_DISPATCH_KEY, b: process.env.N8N_WEBHOOK_BASE }
  let llamadas: Array<{ url: string; cuerpo: unknown }>
  let POST: typeof import('@/app/api/oficina/turnos/route').POST
  beforeEach(async () => {
    process.env.SALA_DISPATCH_KEY = 'la-llave'
    process.env.N8N_WEBHOOK_BASE = 'https://n8n.test/webhook'
    llamadas = []
    vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => { llamadas.push({ url: String(url), cuerpo: init?.body ? JSON.parse(String(init.body)) : null }); return new Response('{}', { status: 200 }) })
    for (const f of [mocks.reanudar, mocks.redibujar, mocks.retomar]) f.mockReset().mockResolvedValue({ status: 200, cuerpo: { accion: 'esperar', turno: TURNO } })
    POST = (await import('@/app/api/oficina/turnos/route')).POST
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    for (const [k, v] of [['SALA_DISPATCH_KEY', previa.k], ['N8N_WEBHOOK_BASE', previa.b]] as const) { if (v === undefined) delete process.env[k]; else process.env[k] = v }
  })

  for (const [accion, extra, fn] of [['reanudar', {}, () => mocks.reanudar], ['redibujar', { motivo: MOTIVO }, () => mocks.redibujar], ['retomar', { causa_corregida: CAUSA }, () => mocks.retomar]] as const) {
    it(`«${accion}» con un turno que esperar → despierta al flujo «zero-risk/oficina-turno» con ese encargo y ese turno`, async () => {
      const r = await POST(req({ accion, encargo_id: ID, ...extra }))
      expect(r.status).toBe(200)
      expect(await r.json()).toMatchObject({ accion: 'esperar', despertado: true })
      expect(fn()).toHaveBeenCalledTimes(1)
      const despertares = llamadas.filter((l) => l.url.includes('zero-risk/oficina-turno'))
      expect(despertares).toHaveLength(1)
      expect(despertares[0].cuerpo).toMatchObject({ encargo_id: ID, turno: TURNO })
    })
  }
  it('el motivo y la causa llegan a su función', async () => {
    await POST(req({ accion: 'redibujar', encargo_id: ID, motivo: MOTIVO }))
    expect(mocks.redibujar.mock.calls[0][1]).toBe(ID)
    expect(mocks.redibujar.mock.calls[0][2]).toEqual({ motivo: MOTIVO })
    await POST(req({ accion: 'retomar', encargo_id: ID, causa_corregida: CAUSA }))
    expect(mocks.retomar.mock.calls[0][2]).toEqual({ causa_corregida: CAUSA })
  })
  it('control: si lo que sigue es la parada del dueño (o un 409) NO se despierta a nadie', async () => {
    mocks.redibujar.mockResolvedValue({ status: 200, cuerpo: { accion: 'esperar_dueno', turno: TURNO } })
    expect((await POST(req({ accion: 'redibujar', encargo_id: ID, motivo: MOTIVO }))).status).toBe(200)
    mocks.retomar.mockResolvedValue({ status: 409, cuerpo: { error: 'no_cerro_por_un_corte' } })
    expect((await POST(req({ accion: 'retomar', encargo_id: ID, causa_corregida: CAUSA }))).status).toBe(409)
    expect(llamadas.filter((l) => l.url.includes('zero-risk/oficina-turno'))).toHaveLength(0)
  })
  it('control: una acción desconocida es 400 y no llama a nada', async () => {
    const r = await POST(req({ accion: 'rehacer', encargo_id: ID }))
    expect(r.status).toBe(400)
    expect(llamadas).toHaveLength(0)
  })
})
