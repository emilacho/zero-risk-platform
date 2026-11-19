/**
 * 19-nov · juntar públicos (CC1 · certifica CC6) · GET /api/brand-book/[clientId] devuelve SOLO los públicos vigentes.
 * Desde 202611190700 un público absorbido por otro tiene `fusionado_en`; el visor del manual no debe mostrarlo dos veces.
 * La base falsa APLICA los filtros (eq · is), así la prueba ve qué fila sale y cuál no. Sin red.
 */
import { describe, it, expect, vi } from 'vitest'

const CID = '0736401b-8a9c-4e57-9ab0-e4bad25cb630'
const P1 = '11111111-1111-4111-8111-111111111111'
const filas: Record<string, Array<Record<string, unknown>>> = {
  clients: [{ id: CID, name: 'Cliente', slug: 'c', industry: 'x', market: 'y', status: 'active' }],
  client_brand_books: [],
  client_icp_documents: [
    { id: P1, client_id: CID, audience_segment: 'Turistas de playa', segment_priority: 1, fusionado_en: null },
    { id: 'abs', client_id: CID, audience_segment: 'Turista playero', segment_priority: 2, fusionado_en: P1 },
    { id: 'seg', client_id: CID, audience_segment: 'Zona norte', segment_priority: 3, fusionado_en: null, segmento_de: P1 },
    { id: 'otro', client_id: 'otro-cliente', audience_segment: 'Ajeno', segment_priority: 1, fusionado_en: null },
  ],
}

vi.mock('@/lib/supabase', () => ({
  getSupabaseAdmin: () => ({
    from: (tabla: string) => {
      const filtros: Array<(f: Record<string, unknown>) => boolean> = []
      const salida = () => {
        const d = (filas[tabla] ?? []).filter((f) => filtros.every((p) => p(f)))
        return { data: d, error: null }
      }
      const q: Record<string, unknown> = {}
      q.select = () => q
      q.eq = (c: string, v: unknown) => { filtros.push((f) => f[c] === v); return q }
      q.is = (c: string, v: unknown) => { filtros.push((f) => (f[c] ?? null) === v); return q }
      q.order = () => q
      q.limit = () => q
      q.maybeSingle = async () => { const r = salida(); return { data: r.data[0] ?? null, error: null } }
      q.then = (res: (x: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(salida()).then(res, rej)
      return q
    },
  }),
}))

const { GET } = await import('../src/app/api/brand-book/[clientId]/route')

describe('GET /api/brand-book · solo públicos vigentes', () => {
  it('🔴 el absorbido (fusionado_en) NO sale; el vigente y el segmento SÍ; nada de otro cliente', async () => {
    const res = await GET(new Request(`http://x/api/brand-book/${CID}`), { params: Promise.resolve({ clientId: CID }) })
    expect(res.status).toBe(200)
    const j = await res.json()
    expect((j.icps as Array<{ id: string }>).map((x) => x.id)).toEqual([P1, 'seg'])
  })
})
