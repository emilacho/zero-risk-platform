/** La ruta GET /api/brain/consultar pasa `publico` a la consulta (encargo 5 · parte B). Con dobles: US$ 0. */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({ consultar: vi.fn(), manual: vi.fn() }))
vi.mock('@/lib/internal-auth', () => ({ checkInternalKey: (r: Request) => (r.headers.get('x-api-key') === 'k' ? { ok: true } : { ok: false, reason: 'no' }) }))
vi.mock('@/lib/supabase', () => ({ getSupabaseAdmin: () => ({ soy: 'db' }) }))
vi.mock('@/lib/portero-alimenta/consultar', () => ({ rutaConsultar: m.consultar }))
vi.mock('@/lib/portero-alimenta/estado-del-manual', () => ({ leerEstadoDelManual: m.manual }))
vi.mock('@/lib/portero-alimenta/aprendizaje/entorno', () => ({ consultarAprendizajeDelEntorno: vi.fn() }))

import { GET } from '../../../app/api/brain/consultar/route'

const C1 = '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312'
const pedir = (qs: string, llave = 'k') => GET(new Request(`https://x/api/brain/consultar?${qs}`, { headers: { 'x-api-key': llave } }))

describe('ruta consultar · el parámetro publico', () => {
  beforeEach(() => { m.consultar.mockReset().mockResolvedValue({ status: 200, body: { ok: true } }); m.manual.mockReset().mockResolvedValue(null) })
  it('llega a la consulta tal cual', async () => {
    await pedir(`client_id=${C1}&oficina=perfil&agente=a&publico=profesional`)
    expect(m.consultar.mock.calls[0][1]).toMatchObject({ client_id: C1, oficina: 'perfil', agente: 'a', publico: 'profesional' })
  })
  it('sin publico llega null (la consulta de siempre)', async () => {
    await pedir(`client_id=${C1}&oficina=perfil&agente=a&clase=resenas`)
    expect(m.consultar.mock.calls[0][1].publico).toBeNull()
  })
  it('sin llave: 401 y no consulta', async () => {
    const r = await pedir(`client_id=${C1}&oficina=perfil&agente=a&publico=consumo`, 'mala')
    expect(r.status).toBe(401)
    expect(m.consultar).not.toHaveBeenCalled()
  })
})
