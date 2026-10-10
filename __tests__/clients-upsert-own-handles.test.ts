/**
 * Relevo 59 · recomendado de CC#3: `own_handles` dado en el alta se guarda en clients.config.apify.own_handles ANTES de la materia, sin pisar nada más. Supabase simulado.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fusionarHandlesPropios, handlesPropios, usuarioDe } from '@/lib/clients/own-handles'

describe('usuarioDe / handlesPropios', () => {
  it('normaliza @usuario, usuario y direcciones; descarta lo que no parece un usuario', () => {
    expect(usuarioDe('@naufrago.ec')).toBe('naufrago.ec')
    expect(usuarioDe('https://www.instagram.com/naufrago.ec/')).toBe('naufrago.ec')
    expect(usuarioDe('https://instagram.com/naufrago.ec/?hl=es')).toBe('naufrago.ec')
    expect(usuarioDe('  usuario_1 ')).toBe('usuario_1')
    for (const x of ['', '   ', 'dos palabras', '<script>', 5, null, undefined, 'a'.repeat(80)]) expect(usuarioDe(x)).toBeNull()
  })
  it('solo redes conocidas; lo demás se declara', () => {
    const r = handlesPropios({ instagram: '@clinica', facebook: 'https://facebook.com/clinica.ec/', myspace: 'x', tiktok: 'no valido!', youtube: '' })
    expect(r.validos).toEqual({ instagram: 'clinica', facebook: 'clinica.ec' })
    expect(r.descartados).toEqual(['myspace', 'tiktok: no valido!'])
    expect(handlesPropios(null)).toEqual({ validos: {}, descartados: [] })
    expect(handlesPropios([1])).toEqual({ validos: {}, descartados: [] })
  })
})
describe('fusionarHandlesPropios', () => {
  it('lo dado manda sobre lo anterior de esa red; las otras cuentas y el resto de la config se conservan', () => {
    const antes = { zona_horaria: 'America/Guayaquil', apify: { own_handles: { instagram: 'viejo', tiktok: 'tt' }, competitor_list: [1] } }
    expect(fusionarHandlesPropios(antes, { instagram: 'nuevo' })).toEqual({ zona_horaria: 'America/Guayaquil', apify: { own_handles: { instagram: 'nuevo', tiktok: 'tt' }, competitor_list: [1] } })
    expect(antes.apify.own_handles.instagram).toBe('viejo')
    expect(fusionarHandlesPropios(null, { instagram: 'a' })).toEqual({ apify: { own_handles: { instagram: 'a' } } })
  })
})

const mockAuth = vi.fn()
vi.mock('@/lib/internal-auth', () => ({ checkInternalKey: (r: Request) => mockAuth(r) }))
let configEnBase: unknown = {}
let escrituras: Array<Record<string, unknown>> = []
vi.mock('@/lib/supabase', () => ({
  getSupabaseAdmin: () => ({
    from(t: string) {
      if (t === 'client_journey_state') return { insert: () => ({ select: () => ({ single: async () => ({ data: { id: 'j-1' }, error: null }) }) }) }
      if (t !== 'clients') throw new Error('tabla inesperada ' + t)
      return {
        upsert: () => ({ select: () => ({ single: async () => ({ data: { id: 'c-1', name: 'X', slug: 'x' }, error: null }) }) }),
        select: () => ({ eq: () => ({ single: async () => ({ data: null, error: null }), maybeSingle: async () => ({ data: { config: configEnBase }, error: null }) }) }),
        update: (fila: Record<string, unknown>) => ({ eq: async () => { escrituras.push(fila); return { error: null } } }),
      }
    },
  }),
}))
import { POST } from '@/app/api/clients/upsert/route'
const pedido = (c: Record<string, unknown>) => new Request('http://x/api/clients/upsert', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Clinica Ejemplo', ...c }) })

describe('POST /api/clients/upsert · own_handles', () => {
  beforeEach(() => { mockAuth.mockReturnValue({ ok: true }); configEnBase = { zona_horaria: 'America/Guayaquil', apify: { competitor_list: [1] } }; escrituras = [] })
  it('sin el campo: nada cambia', async () => {
    const j = await (await POST(pedido({}))).json(); expect(j).not.toHaveProperty('own_handles'); expect(escrituras).toEqual([])
  })
  it('con handles válidos: una sola escritura, fusionada', async () => {
    const j = await (await POST(pedido({ own_handles: { instagram: '@clinicaejemplo' } }))).json()
    expect(j.own_handles).toEqual({ guardados: ['instagram'], descartados: [] })
    expect(escrituras).toEqual([{ config: { zona_horaria: 'America/Guayaquil', apify: { competitor_list: [1], own_handles: { instagram: 'clinicaejemplo' } } } }])
  })
  it('con url_reparto Y own_handles: UNA sola escritura con las dos cosas', async () => {
    const j = await (await POST(pedido({ own_handles: { instagram: 'clinicaejemplo' }, url_reparto: ['https://app.example.com/t/1'] }))).json()
    expect(escrituras).toHaveLength(1)
    expect(escrituras[0]).toEqual({ config: { zona_horaria: 'America/Guayaquil', apify: { competitor_list: [1], own_handles: { instagram: 'clinicaejemplo' }, url_reparto: ['https://app.example.com/t/1'] } } })
    expect(j.own_handles.guardados).toEqual(['instagram']); expect(j.url_reparto.guardadas).toBe(1)
  })
  it('solo basura: no escribe y lo declara; el alta sigue', async () => {
    const r = await POST(pedido({ own_handles: { instagram: 'dos palabras', myspace: 'x' } })); const j = await r.json()
    expect(r.status).toBe(200); expect(escrituras).toEqual([]); expect(j.own_handles).toEqual({ guardados: [], descartados: ['instagram: dos palabras', 'myspace'] })
  })
})
