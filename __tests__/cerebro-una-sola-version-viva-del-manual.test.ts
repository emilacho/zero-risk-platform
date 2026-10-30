/**
 * 30-oct · condiciones 1 y 2 de Cerebro sobre la puerta única de reindexado del manual:
 *   (1) una sola versión viva en el cerebro: al entrar la vigente se retiran los trozos de las anteriores; una versión vieja NO retira nada;
 *   (2) cada trozo viaja con la fuente/confianza/estado de su campo.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/internal-auth', () => ({ checkInternalKey: vi.fn(() => ({ ok: true })) }))

const CLIENTE = '5c2d2dd5-a49e-4da3-87c3-03b504b734f6'
const V2 = '22222222-2222-3333-4444-555555555555'
const V1 = '11111111-2222-3333-4444-555555555555'
let fila: Record<string, unknown> = {}
let masAltaId = V2
const borrados: Array<{ neq: string }> = []

vi.mock('@/lib/supabase', () => ({
  getSupabaseAdmin: () => ({
    from: (tabla: string) => ({
      select: () => ({
        eq: (_c: string, _v: string) => ({
          maybeSingle: async () => ({ data: fila, error: null }),
          order: () => ({ limit: async () => ({ data: [{ id: masAltaId }], error: null }) }),
        }),
      }),
      delete: () => ({ eq: () => ({ eq: () => ({ neq: (_c: string, v: string) => { borrados.push({ neq: v }); return { select: async () => ({ data: [{ id: 'a' }, { id: 'b' }], error: null }) } } }) }) }),
      _t: tabla,
    }),
  }),
}))

let cuerpoIngest: { sections: Array<{ section_label: string; metadata?: Record<string, unknown> }> } | null = null
global.fetch = vi.fn(async (_u: unknown, init?: { body?: string }) => { cuerpoIngest = JSON.parse(String(init?.body)); return new Response(JSON.stringify({ chunks_upserted: 1 }), { status: 200 }) }) as unknown as typeof fetch

const req = (source_id: string) => new Request('https://example.com/api/brain/reembed-source-row', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': 'k' }, body: JSON.stringify({ source_table: 'client_brand_books', source_id, client_id: CLIENTE }) })

describe('el manual en el cerebro · una sola versión viva y procedencia por trozo', () => {
  beforeEach(() => {
    borrados.length = 0; cuerpoIngest = null
    fila = { id: V2, client_id: CLIENTE, updated_at: new Date().toISOString(), brand_mission: 'Llevar el mar a la mesa de todos los días', content_text: JSON.stringify({ brand_book_draft: { _field_meta: { mision: { estado: 'confirmado', fuente: 'sitio', confianza: 0.9 } } } }) }
  })
  it('la versión vigente entra con la procedencia de su campo y retira los trozos de las anteriores', async () => {
    masAltaId = V2
    const { POST } = await import('../src/app/api/brain/reembed-source-row/route')
    const res = await POST(req(V2))
    const j = await res.json()
    expect(cuerpoIngest?.sections.find((s) => s.section_label === 'brand_mission')?.metadata).toMatchObject({ campo: 'mision', procedencia: { fuente: 'sitio', confianza: 0.9, estado: 'confirmado' } })
    expect(borrados).toEqual([{ neq: V2 }])
    expect(j.trozos_retirados_de_versiones_anteriores).toBe(2)
  })
  it('una versión que NO es la vigente no retira nada', async () => {
    masAltaId = V2
    fila = { ...fila, id: V1 }
    const { POST } = await import('../src/app/api/brain/reembed-source-row/route')
    const j = await (await POST(req(V1))).json()
    expect(borrados).toEqual([])
    expect(j.trozos_retirados_de_versiones_anteriores).toBeNull()
  })
})
