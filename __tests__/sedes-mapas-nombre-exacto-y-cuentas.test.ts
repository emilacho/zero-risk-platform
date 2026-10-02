/**
 * LA REGLA NUEVA DE PROPIEDAD DE UNA FICHA DE MAPAS · CC#1 · 2026-10-02 (encargo Lenovo «nombre exacto y cuentas sociales» · autoridad: corrección de Emilio «la prueba de propiedad»).
 *
 * Una ficha de Mapas es del cliente si cumple CUALQUIERA de:
 *   1. NOMBRE EXACTO del alta (normalizado · nada de «contiene») Y ciudad de una sede.
 *   2. coincide teléfono, sitio, dirección o una CUENTA SOCIAL (Instagram · Facebook · TikTok…) con lo ya visto en fuentes propias.
 * Una ficha propia incompleta APORTA lo que trae (con su procedencia) y declara lo que falta. Si dos fichas pasan para la misma sede y chocan, se DECLARA.
 * Datos REALES de Náufrago (captura own_google_maps_profile 29-sep) + sintéticos para lo que la captura no trae. US$ 0.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { recolectarSedes } from '../src/lib/sedes/recolectar'

const require = createRequire(import.meta.url)
const S = require(join(process.cwd(), 'src', 'lib', 'sedes', 'sedes-logica.js'))
const FX = join(process.cwd(), '__tests__', 'fixtures', 'sedes-naufrago')
const SITIO = JSON.parse(readFileSync(join(FX, 'sitio-pagina.json'), 'utf8'))
const IG = JSON.parse(readFileSync(join(FX, 'instagram-perfil.json'), 'utf8'))
const REALES = JSON.parse(readFileSync(join(FX, 'mapas-fichas-reales-own-profile.json'), 'utf8'))
const CID = '41dd3d62-d6de-4c9a-9996-6df78c1da118'
const real = (titulo: string) => REALES.items.find((i: { title: string }) => i.title === titulo)

const propias = () => [...S.observacionesDelSitio(SITIO.content_text, { url: SITIO.url, crawled_at: SITIO.crawled_at }), ...S.observacionesDeInstagram(IG, { observado_en: '2026-10-01T23:45:36Z' })]
const sedes = () => S.descubrirSedes(propias())
const pruebas = (cuentas: string[] = []) => S.pruebasDePropiedad(propias(), { website_url: 'https://www.naufrago.ec', instagram: 'naufrago.ec', cuentas })
const mapas = (item: unknown, p: unknown = pruebas(), nombre = 'Náufrago') => S.observacionesDeMaps(item, sedes(), nombre, { observado_en: '2026-10-02T01:00:00Z', pruebas: p })

describe('regla 1 · nombre EXACTO del alta + ciudad de una sede', () => {
  it('🔴 ROJO de hoy → VERDE: la ficha REAL «Naufrago» de Olón (sin teléfono, dirección = código plus) ENTRA y aporta horario + dirección con su procedencia', () => {
    const r = mapas(real('Naufrago'))
    expect(r.descartado).toBeNull()
    expect(r.prueba).toMatch(/nombre exacto/)
    expect(r.sede).toBe('olon')
    expect(r.observaciones.map((o: { campo: string }) => o.campo).sort()).toEqual(['direccion', 'horario']) // el teléfono falta: no se inventa
    expect(r.observaciones.every((o: { fuente: string; fuente_ref: string }) => o.fuente === 'mapas' && /maps/i.test(o.fuente_ref))).toBe(true)
  })
  it('tildes, mayúsculas y espacios no cuentan: «  NÁUFRAGO » = «Naufrago»', () => {
    expect(mapas({ title: '  NÁUFRAGO ', city: 'Olon', street: '663R+25G' }).descartado).toBeNull()
  })
  it('🔴 los homónimos REALES siguen FUERA: Picantería (Guayaquil) · Marisquería (Gualaceo) · Hostales (Manta)', () => {
    for (const t of ['Picanteria El Naufrago', 'El Naufrago Marisquería', 'Hostal el Naufrago', 'Hostal El Naufrago 2']) {
      const r = mapas(real(t))
      expect(r.observaciones, t).toEqual([])
      expect(r.descartado, t).not.toBeNull()
    }
    expect(mapas(real('Picanteria El Naufrago')).descartado.motivo).toMatch(/no se pudo probar/) // sede (Guayaquil) pero otro negocio
    expect(mapas(real('El Naufrago Marisquería')).descartado.motivo).toMatch(/no es una sede/)
  })
  it('el nombre exacto NO salta la ciudad: «Naufrago» en Gualaceo (no es sede) se descarta', () => {
    expect(mapas({ ...real('Naufrago'), city: 'Gualaceo', address: 'x, Gualaceo, Ecuador' }).descartado.motivo).toMatch(/no es una sede/)
  })
  it('«contiene» no vale: «Naufrago Beach Club» y «El Naufrago» ≠ «Náufrago»', () => {
    for (const title of ['Naufrago Beach Club', 'El Naufrago', 'Naufrago Olon Hostal']) expect(mapas({ title, city: 'Olon' }).descartado, title).not.toBeNull()
  })
})

describe('regla 2 · cuenta social coincidente', () => {
  const homonimo = (extra: Record<string, unknown> = {}) => ({ title: 'Picantería El Náufrago', city: 'Guayaquil', street: 'Av. Los Ríos 123', address: 'Av. Los Ríos 123, Guayaquil', phone: '+593 98 111 2233', ...extra })
  it('Facebook propio (aprendido del sitio o de la ficha) prueba una ficha con OTRO nombre', () => {
    const p = pruebas(['facebook:naufragoec'])
    const r = mapas(homonimo({ website: 'https://www.facebook.com/naufragoec/' }), p)
    expect(r.descartado).toBeNull()
    expect(r.prueba).toMatch(/Facebook @naufragoec/)
  })
  it('TikTok propio · y cuentas en listas del raspado (instagrams[]/facebooks[]) también cuentan', () => {
    expect(mapas(homonimo({ website: 'https://www.tiktok.com/@naufrago.ec' }), pruebas(['tiktok:naufrago.ec'])).prueba).toMatch(/TikTok/)
    expect(mapas(homonimo({ instagrams: ['https://instagram.com/naufrago.ec'] })).prueba).toMatch(/Instagram @naufrago.ec/)
    expect(mapas(homonimo({ facebooks: ['https://facebook.com/naufragoec'] }), pruebas(['facebook:naufragoec'])).prueba).toMatch(/Facebook/)
  })
  it('🔴 la cuenta de OTRO negocio (el hostal de Manta enlaza su Facebook) NO prueba nada', () => {
    const r = mapas(homonimo({ website: 'https://www.facebook.com/hostalnaufrago' }), pruebas(['facebook:naufragoec']))
    expect(r.descartado).not.toBeNull()
  })
  it('un enlace de compartir (sharer) no es una cuenta · ni la cuenta ajena se confunde por prefijo', () => {
    expect(S.cuentasSocialesDe('https://www.facebook.com/sharer/sharer.php?u=x')).toEqual([])
    expect(S.cuentasSocialesDe('https://www.instagram.com/p/ABC123/')).toEqual([])
    expect(S.cuentasSocialesDe('https://www.facebook.com/naufragoec2')).toEqual(['facebook:naufragoec2'])
    expect(mapas(homonimo({ website: 'https://www.facebook.com/naufragoec2' }), pruebas(['facebook:naufragoec'])).descartado).not.toBeNull()
  })
  it('las cuentas se aprenden del texto del sitio propio y del perfil de Instagram (YouTube y LinkedIn incluidos)', () => {
    expect(S.cuentasSocialesDe('síguenos instagram.com/marca.uno · https://www.youtube.com/@marcauno · linkedin.com/company/marca-uno · tiktok.com/@marca.uno · facebook.com/marcauno')).toEqual(['instagram:marca.uno', 'facebook:marcauno', 'tiktok:marca.uno', 'youtube:marcauno', 'linkedin:marca-uno'])
  })
  it('AGNÓSTICO: otro cliente, otra ciudad, otro nombre', () => {
    const o = [{ sede: 'cuenca', ciudad: 'Cuenca', campo: 'ciudad', valor_norm: 'cuenca', fuente: 'sitio', alcance: 'sede' }]
    const s = S.descubrirSedes(o)
    const p = S.pruebasDePropiedad(o, { instagram: 'luna.tienda', cuentas: ['facebook:lunatienda'] })
    expect(S.observacionesDeMaps({ title: 'Luna', city: 'Cuenca' }, s, 'Luna', { pruebas: p, observado_en: 'x' }).descartado).toBeNull() // exacto
    expect(S.observacionesDeMaps({ title: 'Tienda de Luna Cuenca', city: 'Cuenca', website: 'facebook.com/lunatienda' }, s, 'Luna', { pruebas: p, observado_en: 'x' }).prueba).toMatch(/Facebook/)
    expect(S.observacionesDeMaps({ title: 'Luna Park', city: 'Cuenca' }, s, 'Luna', { pruebas: p, observado_en: 'x' }).descartado).not.toBeNull()
  })
})

// ── el recolector con una base en memoria (mismo molde que sedes-mapas-prueba-de-propiedad) ──
type Fila = Record<string, unknown>
function base(tablas: Record<string, Fila[]>) {
  let n = 0
  const from = (t: string) => {
    const q: { f: [string, unknown][]; en: [string, unknown[]][]; ord: [string, boolean] | null; tope: number | null; ins: Fila[] | null } = { f: [], en: [], ord: null, tope: null, ins: null }
    const api: Record<string, unknown> = {
      select: () => api,
      eq: (c: string, v: unknown) => { q.f.push([c, v]); return api },
      in: (c: string, v: unknown[]) => { q.en.push([c, v]); return api },
      order: (c: string, o: { ascending: boolean }) => { q.ord = [c, o.ascending]; return api },
      limit: (k: number) => { q.tope = k; return api },
      insert: (filas: Fila[]) => { const c = filas.map((x) => ({ id: '00000000-0000-4000-8000-' + String(++n).padStart(12, '0'), ...x })); ;(tablas[t] ||= []).push(...c); q.ins = c; return api },
      then: (ok: (v: unknown) => unknown) => {
        let r = q.ins ?? (tablas[t] || []).filter((x) => q.f.every(([c, v]) => x[c] === v) && q.en.every(([c, vs]) => vs.includes(x[c])))
        if (q.ord) { const [c, asc] = q.ord; r = [...r].sort((a, b) => (String(a[c]) < String(b[c]) ? -1 : 1) * (asc ? 1 : -1)) }
        if (q.tope !== null) r = r.slice(0, q.tope)
        return Promise.resolve({ data: r, error: null }).then(ok)
      },
    }
    return api
  }
  return { cliente: { from } as never, tablas }
}
const rawIg = (): Fila => ({ id: 'ig', client_id: CID, apify_function: 'instagram_scraper', params: { usernames: ['naufrago.ec'] }, respuesta: [IG], ensayo: false, created_at: '2026-10-01T23:45:36.495+00:00' })
const rawMapas = (id: string, items: unknown[], cuando: string, fn = 'own_google_maps_profile'): Fila => ({ id, client_id: CID, apify_function: fn, params: {}, respuesta: items, ensayo: false, created_at: cuando })
const mundo = (maps: Fila[], extra: Record<string, unknown> = {}) => base({
  clients: [{ id: CID, name: 'Náufrago', website_url: 'https://www.naufrago.ec', config: { apify: { own_handles: { instagram: 'naufrago.ec' } } }, ...extra }],
  client_web_pages: [{ client_id: CID, owner_role: 'propio', url: SITIO.url, content_text: SITIO.content_text, crawled_at: SITIO.crawled_at }],
  apify_raw: [rawIg(), ...maps], client_sedes: [], client_sede_datos: [],
})

describe('el recolector con la captura REAL · qué aporta Mapas a cada sede', () => {
  it('🔴→🟢 Olón: la ficha «Naufrago» ENTRA y aporta horario 08–16, puntaje 4.8, 24 reseñas, 18 fotos y el código plus · Guayaquil: NADA probado y se declara', async () => {
    const m = mundo([rawMapas('cap', REALES.items, REALES.created_at)])
    const r = await recolectarSedes(m.cliente, CID)
    expect(r.ok).toBe(true)
    const olon = r.mapas_por_sede.find((x) => x.sede === 'olon')!
    expect(olon.ficha!.titulo).toBe('Naufrago')
    expect(olon.ficha!.prueba).toMatch(/nombre exacto/)
    expect(olon.aporta).toMatchObject({ direccion: '663R+25G', codigo_plus: true, puntaje: 4.8, resenas: 24, fotos: 18, telefono: null })
    expect(olon.aporta.horario).toMatch(/08:00–16:00/)
    expect(olon.falta).toEqual(['teléfono']) // lo que no trae se declara
    const gye = r.mapas_por_sede.find((x) => x.sede === 'guayaquil')!
    expect(gye.ficha).toBeNull()
    expect(gye.falta[0]).toMatch(/ninguna ficha de Mapas probada/)
    // los 4 homónimos reales (Picantería · Marisquería · 2 Hostales) quedan fuera y declarados
    expect(r.descartes).toHaveLength(4)
    expect(r.choques).toEqual([])
    // y las observaciones de Olón quedaron guardadas con su procedencia: el horario de Mapas COINCIDE con el de Instagram
    expect(m.tablas.client_sede_datos.filter((d) => d.fuente === 'mapas').every((d) => d.sede_id === m.tablas.client_sedes.find((s) => s.clave === 'olon')!.id)).toBe(true)
    expect(r.sedes.find((s) => s.clave === 'olon')!.horario.estado).toBe('coincide')
    expect(JSON.stringify(m.tablas.client_sede_datos)).not.toMatch(/Los Ríos|Picanter|Gualaceo|Manta/)
  })
  it('los horarios medidos NO cambian: Guayaquil 07–15 (sitio) · Olón 08–16', async () => {
    const m = mundo([rawMapas('cap', REALES.items, REALES.created_at)])
    const r = await recolectarSedes(m.cliente, CID)
    expect(r.sedes.find((s) => s.clave === 'guayaquil')!.horario.valor).toMatch(/07:00–15:00/)
    expect(r.sedes.find((s) => s.clave === 'olon')!.horario.valor).toMatch(/08:00–16:00/)
  })
  it('la misma ficha raspada 5 veces NO es un choque (se cuenta una vez)', async () => {
    const m = mundo([1, 2, 3, 4, 5].map((i) => rawMapas('c' + i, REALES.items, '2026-09-29T01:36:0' + i + '+00:00')))
    const r = await recolectarSedes(m.cliente, CID)
    expect(r.choques).toEqual([])
    expect(m.tablas.client_sede_datos.filter((d) => d.fuente === 'mapas' && d.campo === 'horario')).toHaveLength(1)
  })
  it('🔴 dos fichas DISTINTAS que pasan para la misma sede y chocan se DECLARAN y el dato que difiere queda en conflicto (no se elige en silencio)', async () => {
    const otra = { ...real('Naufrago'), placeId: 'OTRA', url: 'https://maps/otra', openingHours: [{ day: 'jueves', hours: '9 AM to 5 PM' }, { day: 'viernes', hours: '9 AM to 5 PM' }], phone: '+593 99 774 4288' }
    const m = mundo([rawMapas('a', [real('Naufrago')], '2026-10-01T00:00:00+00:00'), rawMapas('b', [otra], '2026-10-02T00:00:00+00:00')])
    const r = await recolectarSedes(m.cliente, CID)
    expect(r.choques).toHaveLength(1)
    expect(r.choques[0].sede).toBe('olon')
    expect(r.choques[0].fichas).toHaveLength(2)
    expect(r.choques[0].chocan).toContain('horario')
    expect(r.sedes.find((s) => s.clave === 'olon')!.horario.estado).toBe('conflicto')
    expect(r.sedes.find((s) => s.clave === 'olon')!.horario.valor).toBeNull()
  })
  it('dos fichas que pasan y NO difieren en ningún dato se declaran sin chocar', async () => {
    const gemela = { ...real('Naufrago'), placeId: 'GEMELA', url: 'https://maps/gemela' }
    const m = mundo([rawMapas('a', [real('Naufrago'), gemela], '2026-10-01T00:00:00+00:00')])
    const r = await recolectarSedes(m.cliente, CID)
    expect(r.choques).toHaveLength(1)
    expect(r.choques[0].chocan).toEqual([])
    expect(r.sedes.find((s) => s.clave === 'olon')!.horario.estado).not.toBe('conflicto')
  })
  it('el recolector aprende las cuentas sociales del sitio propio y prueba con ellas', async () => {
    const conFb = { ...SITIO, content_text: SITIO.content_text + '\nSíguenos https://www.facebook.com/naufragoec' }
    const m = mundo([rawMapas('x', [{ title: 'Marisquería La Ola', city: 'Olon', street: 'Calle Principal 1', website: 'https://www.facebook.com/naufragoec', url: 'https://maps/ola', placeId: 'OLA' }], '2026-10-02T00:00:00+00:00')])
    ;(m.tablas.client_web_pages[0] as Fila).content_text = conFb.content_text
    const r = await recolectarSedes(m.cliente, CID)
    expect(r.descartes).toEqual([])
    expect(r.mapas_por_sede.find((x) => x.sede === 'olon')!.ficha!.prueba).toMatch(/Facebook @naufragoec/)
  })
})
