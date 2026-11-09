/**
 * GO 09-nov · rehacer un modelo 3D · la ruta de cotizar trata «rehacer» como «con foto»: 3D sin imagen previa (solo la conversión).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase', () => ({ getSupabaseAdmin: () => ({}) }))

const CLIENTE = 'a0000000-0000-4000-8000-0000000000e1'
const MODELO = 'b0000000-0000-4000-8000-0000000000e2'
async function cotizar(body: Record<string, unknown>) {
  const { POST } = await import('@/app/api/estudio/cotizar/route')
  const r = await POST(new Request('http://x/api/estudio/cotizar', { method: 'POST', headers: { 'x-api-key': 'k', 'content-type': 'application/json' }, body: JSON.stringify(body) }))
  return { status: r.status, j: await r.json() }
}
beforeEach(() => { process.env.INTERNAL_API_KEY = 'k' })

describe('POST /api/estudio/cotizar · rehacer', () => {
  it('rehacer un 3D Tripo en alta cuesta solo la conversión (US$ 0,40), sin imagen previa', async () => {
    const { status, j } = await cotizar({ client_id: CLIENTE, tipo: '3d', modelo: 'tripo-h3.1', calidad: 'alta', rehacer_pieza_id: MODELO })
    expect(status).toBe(200)
    expect(j.total_usd).toBe(0.4)
    expect(j.partes.map((x: { que: string }) => x.que)).toEqual(['3D · Tripo H3.1'])
  })
  it('rehacer junto con «con foto» no choca: sigue siendo una sola imagen de partida', async () => {
    const { status, j } = await cotizar({ client_id: CLIENTE, tipo: '3d', modelo: 'tripo-h3.1', calidad: 'alta', rehacer_pieza_id: MODELO, con_foto: true })
    expect(status).toBe(200)
    expect(j.total_usd).toBe(0.4)
  })
  it('sin foto ni rehacer, el 3D suma la imagen previa', async () => {
    const { j } = await cotizar({ client_id: CLIENTE, tipo: '3d', modelo: 'tripo-h3.1', calidad: 'alta', prompt: 'un termo naranja' })
    expect(j.total_usd).toBeGreaterThan(0.4)
  })
})

describe('POST /api/estudio/cotizar · varias imágenes (GO 09-nov 22:45Z)', () => {
  it('con 2 o más imágenes cotiza el modelo de varias referencias (US$ 0,15), sin mandar las imágenes', async () => {
    const { status, j } = await cotizar({ client_id: CLIENTE, tipo: 'imagen', prompt: 'mezcla', n_fotos: 3, con_foto: true })
    expect(status).toBe(200)
    expect(j).toMatchObject({ total_usd: 0.15, partes: [{ que: 'imagen con 3 referencias', usd: 0.15 }] })
  })
  it('con una sola sigue el precio de siempre; con 7 no cotiza', async () => {
    const una = await cotizar({ client_id: CLIENTE, tipo: 'imagen', prompt: 'mezcla', n_fotos: 1, con_foto: true })
    expect(una.j.total_usd).toBeLessThan(0.1)
    expect((await cotizar({ client_id: CLIENTE, tipo: 'imagen', prompt: 'mezcla', n_fotos: 7 })).status).toBe(400)
  })
})
