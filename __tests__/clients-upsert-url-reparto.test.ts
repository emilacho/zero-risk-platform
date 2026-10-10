/**
 * D-3 (firmado) · `url_reparto` OPCIONAL en el alta → `clients.config.apify.url_reparto`, sin pisar nada más y sin rechazar nunca el alta.
 * Sin base real: Supabase simulado.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fusionarUrlReparto, MAX_URL_REPARTO, urlsDeReparto } from '@/lib/clients/url-reparto'

describe('urlsDeReparto', () => {
  it('acepta lista o texto separado por coma/punto y coma/salto; solo http(s) con dominio; sin repetidas', () => {
    expect(urlsDeReparto(['https://app.example.com/tienda/1', ' http://otra.example.org/x '])).toEqual({ validas: ['https://app.example.com/tienda/1', 'http://otra.example.org/x'], descartadas: [] })
    expect(urlsDeReparto('https://a.example.com/1, https://b.example.com/2;\nhttps://a.example.com/1').validas).toEqual(['https://a.example.com/1', 'https://b.example.com/2'])
  })
  it('descarta y DECLARA lo que no sirve (nunca rechaza)', () => {
    const r = urlsDeReparto(['ftp://x.example.com', 'javascript:alert(1)', 'https://sinpunto', 'no es una url', '', 5, null, 'https://ok.example.com'])
    expect(r.validas).toEqual(['https://ok.example.com'])
    expect(r.descartadas).toEqual(['ftp://x.example.com', 'javascript:alert(1)', 'https://sinpunto', 'no es una url'])
    expect(urlsDeReparto(undefined)).toEqual({ validas: [], descartadas: [] })
    expect(urlsDeReparto({ a: 1 })).toEqual({ validas: [], descartadas: [] })
  })
  it(`tope de ${MAX_URL_REPARTO} y largo máximo`, () => {
    const muchas = Array.from({ length: 8 }, (_, i) => `https://app${i}.example.com/`)
    const r = urlsDeReparto(muchas)
    expect(r.validas).toHaveLength(MAX_URL_REPARTO); expect(r.descartadas).toHaveLength(3)
    expect(urlsDeReparto(['https://x.example.com/' + 'a'.repeat(600)]).validas).toEqual([])
  })
})

describe('fusionarUrlReparto', () => {
  it('pone la lista y deja todo lo demás igual (config y apify)', () => {
    const antes = { zona_horaria: 'America/Guayaquil', business_model: 'x', apify: { own_handles: { instagram: 'a' }, competitor_list: [1], last_populated_source: 'auto' } }
    const d = fusionarUrlReparto(antes, ['https://a.example.com'])
    expect(d).toEqual({ ...antes, apify: { ...antes.apify, url_reparto: ['https://a.example.com'] } })
    expect(antes.apify).not.toHaveProperty('url_reparto') // no muta la entrada
  })
  it('sin config previa: la crea', () => {
    expect(fusionarUrlReparto(null, ['https://a.example.com'])).toEqual({ apify: { url_reparto: ['https://a.example.com'] } })
    expect(fusionarUrlReparto([], ['https://a.example.com'])).toEqual({ apify: { url_reparto: ['https://a.example.com'] } })
  })
})

// ─── la ruta ───
const mockAuth = vi.fn()
vi.mock('@/lib/internal-auth', () => ({ checkInternalKey: (r: Request) => mockAuth(r) }))
let configEnBase: unknown = {}
let escrito: Record<string, unknown> | null = null
let falloAlEscribir = false
vi.mock('@/lib/supabase', () => ({
  getSupabaseAdmin: () => ({
    from(t: string) {
      if (t === 'client_journey_state') return { insert: () => ({ select: () => ({ single: async () => ({ data: { id: 'j-1' }, error: null }) }) }) }
      if (t !== 'clients') throw new Error('tabla inesperada ' + t)
      return {
        upsert: () => ({ select: () => ({ single: async () => ({ data: { id: 'c-1', name: 'Clinica Ejemplo', slug: 'clinica-ejemplo' }, error: null }) }) }),
        select: () => ({ eq: () => ({ single: async () => ({ data: null, error: null }), maybeSingle: async () => ({ data: { config: configEnBase }, error: null }) }) }),
        update: (fila: Record<string, unknown>) => ({ eq: async () => { if (falloAlEscribir) return { error: { message: 'la base rechazó' } }; escrito = fila; return { error: null } } }),
      }
    },
  }),
}))
import { POST } from '@/app/api/clients/upsert/route'
const pedido = (cuerpo: Record<string, unknown>) => new Request('http://x/api/clients/upsert', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Clinica Ejemplo', ...cuerpo }) })

describe('POST /api/clients/upsert · url_reparto', () => {
  beforeEach(() => { mockAuth.mockReturnValue({ ok: true }); configEnBase = { zona_horaria: 'America/Guayaquil', apify: { own_handles: { instagram: 'clinicaejemplo' } } }; escrito = null; falloAlEscribir = false })
  it('sin el campo: la respuesta no cambia y no se toca la config', async () => {
    const r = await POST(pedido({})); const j = await r.json()
    expect(r.status).toBe(200); expect(j).not.toHaveProperty('url_reparto'); expect(escrito).toBeNull()
  })
  it('con direcciones válidas: se fusionan en config.apify.url_reparto sin pisar lo demás', async () => {
    const j = await (await POST(pedido({ url_reparto: ['https://app.example.com/t/1', 'basura'] }))).json()
    expect(j.url_reparto).toEqual({ guardadas: 1, descartadas: ['basura'] })
    expect(escrito).toEqual({ config: { zona_horaria: 'America/Guayaquil', apify: { own_handles: { instagram: 'clinicaejemplo' }, url_reparto: ['https://app.example.com/t/1'] } } })
  })
  it('solo basura: no escribe nada y lo dice (el alta sigue)', async () => {
    const r = await POST(pedido({ url_reparto: ['nada', 'ftp://x.example.com'] })); const j = await r.json()
    expect(r.status).toBe(200); expect(j.url_reparto).toEqual({ guardadas: 0, descartadas: ['nada', 'ftp://x.example.com'] }); expect(escrito).toBeNull()
  })
  it('si la base falla al guardarlas: el alta NO falla y el error se declara', async () => {
    falloAlEscribir = true
    const r = await POST(pedido({ url_reparto: ['https://app.example.com/t/1'] })); const j = await r.json()
    expect(r.status).toBe(200); expect(j.ok).toBe(true); expect(j.url_reparto.guardadas).toBe(0); expect(j.url_reparto.error).toContain('la base rechazó')
  })
  it('null o ausente = no se pidió', async () => {
    expect(await (await POST(pedido({ url_reparto: null }))).json()).not.toHaveProperty('url_reparto')
  })
})
