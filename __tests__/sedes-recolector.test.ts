/**
 * EL RECOLECTOR DE SEDES · pruebas a costo cero con los datos REALES de Náufrago y una base en memoria · CC#1 · 2026-10-02
 * (encargo Lenovo «sedes, mapas, cerebro y voz» puntos 1, 2, 3 y 6).
 *
 * Se demuestra: lee sitio + Instagram propio + Mapas · crea las sedes SÓLO desde las fuentes propias · DESCARTA el homónimo de Gualaceo y no guarda nada de él ·
 * ignora los raspados de la competencia y los de ensayo · es idempotente · lo MÁS RECIENTE de cada fuente reemplaza a lo viejo (sin conflicto falso) · si la base falla lo declara.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { recolectarSedes } from '../src/lib/sedes/recolectar'

const FX = join(process.cwd(), '__tests__', 'fixtures', 'sedes-naufrago')
const SITIO = JSON.parse(readFileSync(join(FX, 'sitio-pagina.json'), 'utf8'))
const IG = JSON.parse(readFileSync(join(FX, 'instagram-perfil.json'), 'utf8'))
const MAPAS = JSON.parse(readFileSync(join(FX, 'mapas-homonimo-gualaceo.json'), 'utf8'))
const CID = '41dd3d62-d6de-4c9a-9996-6df78c1da118'

// ── una base en memoria con la forma mínima de PostgREST que usa el recolector ──
type Fila = Record<string, unknown>
function baseEnMemoria(tablas: Record<string, Fila[]>, opciones: { fallaEn?: string } = {}) {
  let n = 0
  const nuevoId = () => '00000000-0000-4000-8000-' + String(++n).padStart(12, '0')
  const llamadas: { tabla: string; op: string; filas?: number }[] = []
  function from(tabla: string) {
    const q: { filtros: [string, unknown][]; en: [string, unknown[]][]; orden: [string, boolean] | null; tope: number | null; insertadas: Fila[] | null; proyectar: boolean; cambios: Fila | null } =
      { filtros: [], en: [], orden: null, tope: null, insertadas: null, proyectar: false, cambios: null }
    const api: Record<string, unknown> = {
      select: () => api, // sirve tanto para leer como para encadenar tras un insert
      eq: (c: string, v: unknown) => { q.filtros.push([c, v]); return api },
      in: (c: string, v: unknown[]) => { q.en.push([c, v]); return api },
      order: (c: string, o: { ascending: boolean }) => { q.orden = [c, o.ascending]; return api },
      limit: (n: number) => { q.tope = n; return api },
      insert: (filas: Fila[]) => {
        const con = filas.map((f) => ({ id: nuevoId(), created_at: '2026-10-02T00:00:00Z', ...f }))
        ;(tablas[tabla] ||= []).push(...con)
        q.insertadas = con
        llamadas.push({ tabla, op: 'insert', filas: con.length })
        return api
      },
      update: (v: Fila) => { q.cambios = v; return api }, // anotar «reconfirmado» en una fila ya guardada
      then: (ok: (v: unknown) => unknown) => {
        if (opciones.fallaEn === tabla) return Promise.resolve({ data: null, error: { message: 'la base no contesta' } }).then(ok)
        let filas = q.insertadas ?? (tablas[tabla] || []).filter((f) => q.filtros.every(([c, v]) => f[c] === v) && q.en.every(([c, vs]) => vs.includes(f[c])))
        if (q.cambios) { for (const f of filas) Object.assign(f, q.cambios); llamadas.push({ tabla, op: 'update', filas: filas.length }); return Promise.resolve({ data: filas, error: null }).then(ok) }
        if (q.orden) { const [c, asc] = q.orden; filas = [...filas].sort((a, b) => (String(a[c]) < String(b[c]) ? -1 : 1) * (asc ? 1 : -1)) }
        if (q.tope !== null) filas = filas.slice(0, q.tope)
        if (!q.insertadas) llamadas.push({ tabla, op: 'select' })
        return Promise.resolve({ data: filas, error: null }).then(ok)
      },
    }
    return api
  }
  return { cliente: { from } as never, tablas, llamadas }
}

const igReal = (extra: Partial<Fila> = {}): Fila => ({ id: 'ig-1', client_id: CID, apify_function: 'instagram_scraper', params: { usernames: ['naufrago.ec'], resultsLimit: 1 }, respuesta: [IG], ensayo: false, created_at: '2026-10-01T23:45:36.495346+00:00', ...extra })
const mapasHomonimo = (): Fila => ({ id: 'mp-1', client_id: CID, apify_function: 'google_maps_scraper', params: { searchStringsArray: ['Náufrago'], locationQuery: 'Ecuador' }, respuesta: [MAPAS.item], ensayo: false, created_at: '2026-10-01T23:45:54.143236+00:00' })
const mundo = (extras: Fila[] = []) => baseEnMemoria({
  clients: [{ id: CID, name: 'Náufrago', config: { apify: { own_handles: { instagram: 'naufrago.ec' } } } }],
  client_web_pages: [{ client_id: CID, owner_role: 'propio', url: SITIO.url, content_text: SITIO.content_text, crawled_at: SITIO.crawled_at }],
  apify_raw: [igReal(), mapasHomonimo(), ...extras],
  client_sedes: [],
  client_sede_datos: [],
})

describe('el recolector con los datos REALES de Náufrago', () => {
  it('crea Guayaquil y Olón SÓLO desde el sitio y la bio · el horario de cada sede con su fuente · la dirección de Olón queda «sin dato»', async () => {
    const m = mundo()
    const r = await recolectarSedes(m.cliente, CID)
    expect(r.ok).toBe(true)
    expect(m.tablas.client_sedes.map((s) => s.clave).sort()).toEqual(['guayaquil', 'olon'])
    const g = r.sedes.find((s) => s.clave === 'guayaquil')!
    const o = r.sedes.find((s) => s.clave === 'olon')!
    expect(g.horario).toMatchObject({ estado: 'una_fuente', valor: 'jueves a lunes 07:00–15:00' })
    expect(o.horario.valor).toContain('jueves a lunes 08:00–16:00')
    expect(o.horario.fuentes[0]).toMatchObject({ fuente: 'instagram' })
    expect(o.direccion.estado).toBe('sin_dato')
    expect(g.canal_pedido.estado).toBe('coincide') // el teléfono del sitio y el de la bio son el mismo número
  })
  it('🔴 la ficha de Gualaceo se DESCARTA con su motivo y NO deja NI UNA fila en la base (ni sede, ni dato)', async () => {
    const m = mundo()
    const r = await recolectarSedes(m.cliente, CID)
    expect(r.descartes).toHaveLength(1)
    expect(r.descartes[0].motivo).toMatch(/Gualaceo.*no es una sede de este cliente/)
    expect(r.fuentes_leidas.mapas).toBe(0)
    expect(JSON.stringify(m.tablas.client_sede_datos)).not.toMatch(/Gualaceo|Luis Ríos|Mapas|mapas/)
    expect(m.tablas.client_sede_datos.some((d) => d.fuente === 'mapas')).toBe(false)
    expect(m.tablas.client_sedes.some((s) => /gualaceo/.test(String(s.clave)))).toBe(false)
  })
  it('la voz: devuelve los textos de los posts propios (sin la cola de hashtags)', async () => {
    const r = await recolectarSedes(mundo().cliente, CID)
    expect(r.textos_propios.length).toBeGreaterThan(3)
    expect(r.textos_propios.length).toBeLessThanOrEqual(8)
    expect(JSON.stringify(r.textos_propios)).not.toMatch(/#syntropic/)
  })
  it('es IDEMPOTENTE: la segunda vez no guarda nada nuevo y la ficha es la misma', async () => {
    const m = mundo()
    const a = await recolectarSedes(m.cliente, CID)
    const filas = m.tablas.client_sede_datos.length
    const b = await recolectarSedes(m.cliente, CID)
    expect(a.nuevas).toBeGreaterThan(0)
    expect(b.nuevas).toBe(0)
    expect(m.tablas.client_sede_datos.length).toBe(filas)
    expect(m.tablas.client_sedes).toHaveLength(2)
    expect(b.sedes).toEqual(a.sedes)
  })
})

describe('lo que NO cuenta como fuente del cliente', () => {
  it('🔴 el raspado de Instagram de la COMPETENCIA (misma tabla) NO se usa · tampoco el de ENSAYO (datos inventados)', async () => {
    const competidor = igReal({ id: 'ig-c', params: { usernames: ['lacevicheriaguayaca'] }, created_at: '2026-10-02T01:00:00+00:00', respuesta: [{ username: 'lacevicheriaguayaca', biography: '📍Cuenca 🕓Lunes-Viernes 09:00-18:00\n☎️0999999999', latestPosts: [] }] })
    const ensayo = igReal({ id: 'ig-e', ensayo: true, created_at: '2026-10-02T02:00:00+00:00', respuesta: [{ username: 'naufrago.ec', biography: '📍Quito 🕓Lunes-Domingo 01:00-02:00', latestPosts: [] }] })
    const m = mundo([competidor, ensayo])
    const r = await recolectarSedes(m.cliente, CID)
    expect(m.tablas.client_sedes.map((s) => s.clave).sort()).toEqual(['guayaquil', 'olon'])
    expect(JSON.stringify(m.tablas.client_sede_datos)).not.toMatch(/Cuenca|Quito|09:00-18:00|01:00-02:00/)
    expect(r.sedes.find((s) => s.clave === 'olon')!.horario.valor).toContain('08:00–16:00')
  })
  it('🔴 las páginas web que NO son del sitio propio (las de la competencia están en la misma tabla) NO se leen', async () => {
    const m = mundo()
    const paginaAjena = JSON.stringify({ '@context': 'https://schema.org', '@type': 'Restaurant', name: 'Competidor', address: { '@type': 'PostalAddress', streetAddress: 'Calle 9', addressLocality: 'Cuenca' }, openingHoursSpecification: [{ dayOfWeek: ['Monday'], opens: '01:00', closes: '02:00' }] })
    m.tablas.client_web_pages.push({ client_id: CID, owner_role: 'competidor', url: 'https://competidor.ec', content_text: paginaAjena, crawled_at: '2026-10-02T00:00:00Z' })
    await recolectarSedes(m.cliente, CID)
    expect(m.tablas.client_sedes.map((s) => s.clave).sort()).toEqual(['guayaquil', 'olon'])
    expect(JSON.stringify(m.tablas.client_sede_datos)).not.toMatch(/Cuenca|Calle 9|01:00-02:00/)
  })
  it('un cliente SIN Instagram propio registrado: la bio de un Instagram cualquiera no se toma (no se adivina de quién es)', async () => {
    const m = baseEnMemoria({ clients: [{ id: CID, name: 'Náufrago', config: {} }], client_web_pages: [], apify_raw: [igReal()], client_sedes: [], client_sede_datos: [] })
    const r = await recolectarSedes(m.cliente, CID)
    expect(r.ok).toBe(true)
    expect(r.sedes).toEqual([])
    expect(r.textos_propios).toEqual([])
  })
  it('un cliente sin nada raspado: ok con cero sedes (se declara, no se inventa)', async () => {
    const m = baseEnMemoria({ clients: [{ id: CID, name: 'Otro', config: {} }], client_web_pages: [], apify_raw: [], client_sedes: [], client_sede_datos: [] })
    expect(await recolectarSedes(m.cliente, CID)).toMatchObject({ ok: true, sedes: [], descartes: [], nuevas: 0 })
  })
})

describe('lo MÁS RECIENTE de cada fuente reemplaza a lo viejo', () => {
  it('si Instagram cambió su horario entre dos raspados, NO hay conflicto falso con su propia versión vieja', async () => {
    const m = mundo()
    await recolectarSedes(m.cliente, CID)
    const nuevoPerfil = { ...IG, biography: 'Náufrago te espera!\n📍Olon 🕓Miércoles-Domingo 09:00-17:00\nPedidos☎️0997744288' }
    m.tablas.apify_raw.push(igReal({ id: 'ig-2', respuesta: [nuevoPerfil], created_at: '2026-10-05T10:00:00+00:00' }))
    const r = await recolectarSedes(m.cliente, CID)
    const o = r.sedes.find((s) => s.clave === 'olon')!
    expect(o.horario.estado).toBe('una_fuente')
    expect(o.horario.valor).toContain('miércoles a domingo 09:00–17:00')
    expect(m.tablas.client_sede_datos.filter((d) => d.fuente === 'instagram' && d.campo === 'horario')).toHaveLength(2) // el historial se conserva
  })
})

describe('si la base falla, se DECLARA (no se devuelve una ficha vacía como si fuera «sin sedes»)', () => {
  it('la lectura del sitio falla ⇒ ok:false con el motivo y cero sedes', async () => {
    const m = baseEnMemoria({ clients: [{ id: CID, name: 'N', config: {} }], client_web_pages: [], apify_raw: [], client_sedes: [], client_sede_datos: [] }, { fallaEn: 'client_web_pages' })
    const r = await recolectarSedes(m.cliente, CID)
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/páginas del sitio.*la base no contesta/)
  })
  it('un cliente que no existe ⇒ ok:false', async () => {
    const m = baseEnMemoria({ clients: [], client_web_pages: [], apify_raw: [], client_sedes: [], client_sede_datos: [] })
    expect((await recolectarSedes(m.cliente, CID)).error).toMatch(/no existe/)
  })
})
