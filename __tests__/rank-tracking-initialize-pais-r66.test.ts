/** r66 · agnóstico · el país del rastreo es del cliente: el del llamador, o el de su ficha; sin ninguno, error claro (antes: 'EC' para todos). */
import { describe, it, expect, vi, beforeEach } from 'vitest'

let ficha: Record<string, unknown> | null = null
const upserts: Array<Record<string, unknown>[]> = []
const mock = {
  from: vi.fn((t: string) => {
    const q: Record<string, unknown> = {}
    q.select = () => q; q.eq = () => q; q.order = () => q; q.limit = () => q
    q.maybeSingle = () => Promise.resolve({ data: t === 'seo_engagements' ? { id: 'e1' } : ficha, error: null })
    q.upsert = (rows: Record<string, unknown>[]) => { upserts.push(rows); return Promise.resolve({ error: null }) }
    return q
  }),
}
vi.mock('@/lib/supabase', () => ({ getSupabaseAdmin: () => mock }))
beforeEach(() => { ficha = null; upserts.length = 0; process.env.INTERNAL_API_KEY = 'k' })
async function llamar(body: Record<string, unknown>) {
  vi.resetModules()
  const { POST } = await import('../src/app/api/rank-tracking/initialize/route')
  const r = await POST(new Request('http://x', { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': 'k' }, body: JSON.stringify({ client_id: 'c1', domain: 'a.test', keywords: ['uno'], ...body }) }))
  return { status: r.status, json: await r.json() }
}
describe('POST /api/rank-tracking/initialize · país', () => {
  it('sin país en el cuerpo ni en la ficha: 400 pais_requerido y NO escribe nada (no adivina)', async () => {
    const r = await llamar({})
    expect(r.status).toBe(400); expect(r.json.error).toBe('pais_requerido'); expect(upserts).toHaveLength(0)
  })
  it('el país de la ficha se usa como código de 2 letras', async () => {
    ficha = { country: 'Colombia' }
    expect((await llamar({})).status).toBe(200); expect(upserts[0][0].country).toBe('CO')
  })
  it('un país de la ficha que no se reconoce tampoco se adivina', async () => {
    ficha = { country: 'Atlantis' }
    expect((await llamar({})).status).toBe(400)
  })
  it('lo que manda el llamador manda (sin tocar la ficha)', async () => {
    ficha = { country: 'Colombia' }
    expect((await llamar({ locale: { country: 'PE' } })).status).toBe(200); expect(upserts[0][0].country).toBe('PE')
  })
})
