/**
 * Las sedes salen sólo de páginas del cliente (31-oct · CC#2 · Náufrago): `owner_role = 'propio'` también llegó a páginas de terceros (un hotel de Medellín, un diario de
 * Plainview…) y de ellas nacieron las sedes Antioquia, Plainview y Laredo. Ahora una página cuenta sólo si es de SU dominio (o subdominio) o de SU cuenta de Instagram.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { esPaginaDelCliente, recolectarSedes } from '../src/lib/sedes/recolectar'

const FX = join(process.cwd(), '__tests__', 'fixtures', 'sedes-naufrago')
const SITIO = JSON.parse(readFileSync(join(FX, 'sitio-pagina.json'), 'utf8'))
const CID = '41dd3d62-d6de-4c9a-9996-6df78c1da118'
type Fila = Record<string, unknown>

function base(tablas: Record<string, Fila[]>) {
  const from = (tabla: string) => {
    const q = { f: [] as [string, unknown][], ins: null as Fila[] | null }
    const api: Record<string, unknown> = {
      select: () => api, order: () => api, limit: () => api, in: () => api,
      eq: (c: string, v: unknown) => { q.f.push([c, v]); return api },
      insert: (filas: Fila[]) => { q.ins = filas.map((x, i) => ({ id: tabla + '-' + (tablas[tabla]?.length ?? 0) + '-' + i, ...x })); ;(tablas[tabla] ||= []).push(...q.ins); return api },
      update: () => api,
      then: (ok: (v: unknown) => unknown) => Promise.resolve({ data: q.ins ?? (tablas[tabla] || []).filter((r) => q.f.every(([c, v]) => r[c] === v)), error: null }).then(ok),
    }
    return api
  }
  return { cliente: { from } as never, tablas }
}
const ficha = { id: CID, name: 'Náufrago', website_url: 'https://www.naufrago.ec', config: { apify: { own_handles: { instagram: 'naufrago.ec' } } } }
const pagina = (url: string, extra: Fila = {}): Fila => ({ client_id: CID, owner_role: 'propio', url, content_text: SITIO.content_text, crawled_at: SITIO.crawled_at, ...extra })

describe('esPaginaDelCliente', () => {
  it('su dominio, con o sin www, y sus subdominios', () => {
    for (const u of ['https://www.naufrago.ec', 'https://naufrago.ec/menu', 'https://tienda.naufrago.ec/x']) expect(esPaginaDelCliente(u, 'naufrago.ec', 'naufrago.ec')).toBe(true)
  })
  it('su página de Instagram sí; la de otra cuenta no', () => {
    expect(esPaginaDelCliente('https://www.instagram.com/naufrago.ec/', 'naufrago.ec', 'naufrago.ec')).toBe(true)
    expect(esPaginaDelCliente('https://www.instagram.com/otro.negocio/', 'naufrago.ec', 'naufrago.ec')).toBe(false)
  })
  it('🔴 un dominio ajeno o parecido NO (el hotel de Medellín, un sufijo engañoso)', () => {
    for (const u of ['https://www.clickclackhotel.com/en/x', 'https://notnaufrago.ec', 'https://naufrago.ec.estafa.com', 'https://www.myplainview.com/a']) expect(esPaginaDelCliente(u, 'naufrago.ec', 'naufrago.ec')).toBe(false)
  })
  it('sin dominio en la ficha no hay prueba: nada cuenta', () => {
    expect(esPaginaDelCliente('https://www.naufrago.ec', null, null)).toBe(false)
  })
})

describe('recolectarSedes con páginas «propio» de terceros', () => {
  it('🔴 una página de otro dominio marcada «propio» NO crea sede ni guarda nada', async () => {
    const m = base({ clients: [ficha], client_web_pages: [pagina('https://www.clickclackhotel.com/en/hotel-medellin/restaurants/castaway/')], apify_raw: [], client_sedes: [], client_sede_datos: [] })
    const r = await recolectarSedes(m.cliente, CID)
    expect(r.ok).toBe(true)
    expect(m.tablas.client_sedes).toHaveLength(0)
    expect(m.tablas.client_sede_datos).toHaveLength(0)
    expect(r.fuentes_leidas.sitio).toBe(0)
  })
  it('la página de su dominio sigue creando sus sedes aunque haya páginas ajenas al lado', async () => {
    const m = base({ clients: [ficha], client_web_pages: [pagina(SITIO.url), pagina('https://www.myplainview.com/x'), pagina('https://www.clickclackhotel.com/y')], apify_raw: [], client_sedes: [], client_sede_datos: [] })
    const solo = base({ clients: [ficha], client_web_pages: [pagina(SITIO.url)], apify_raw: [], client_sedes: [], client_sede_datos: [] })
    await recolectarSedes(m.cliente, CID); await recolectarSedes(solo.cliente, CID)
    expect(solo.tablas.client_sedes.length).toBeGreaterThan(0)
    expect(m.tablas.client_sedes.map((s) => s.clave).sort()).toEqual(solo.tablas.client_sedes.map((s) => s.clave).sort())
    expect(m.tablas.client_sede_datos).toHaveLength(solo.tablas.client_sede_datos.length)
  })
})
