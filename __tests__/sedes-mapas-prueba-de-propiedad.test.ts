/**
 * UNA FICHA DE MAPAS SOLO ES DEL CLIENTE SI SE PRUEBA · pruebas a costo cero con datos REALES de Náufrago · CC#1 · 2026-10-02
 * (encargo Lenovo «cerrar D1 · el homónimo de la misma ciudad» · certificación CC#3 D1 y D2).
 *
 * 🔴 EL ROJO (D1): el nombre y la ciudad no alcanzan. «Picantería El Náufrago» (Guayaquil, otro negocio) compartía una palabra del nombre y la ciudad de una sede ⇒ entraba como dato del cliente.
 * Regla nueva: la ficha de Mapas es del cliente SOLO si coincide, con lo ya visto en SUS fuentes propias (sitio · Instagram · la ficha del cliente), al menos UNO de: teléfono · sitio web · cuenta de Instagram · dirección.
 * Lo que no se prueba se DESCARTA y se declara. Una ficha de Mapas NO puede probarse a sí misma. Agnóstico.
 * D2: dos raspados de la MISMA ficha no duplican observaciones.
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
const MAPAS = JSON.parse(readFileSync(join(FX, 'mapas-homonimo-gualaceo.json'), 'utf8'))
const CID = '41dd3d62-d6de-4c9a-9996-6df78c1da118'

const propias = () => [...S.observacionesDelSitio(SITIO.content_text, { url: SITIO.url, crawled_at: SITIO.crawled_at }), ...S.observacionesDeInstagram(IG, { observado_en: '2026-10-01T23:45:36Z' })]
const sedes = () => S.descubrirSedes(propias())
const FICHA = { website_url: 'https://www.naufrago.ec', instagram: 'naufrago.ec' }
const pruebas = () => S.pruebasDePropiedad(propias(), FICHA)
const HORARIO = [{ day: 'jueves', hours: '7 AM to 3 PM' }, { day: 'viernes', hours: '7 AM to 3 PM' }]
// el homónimo de la MISMA ciudad: comparte palabra del nombre y ciudad con una sede; nada más
const homonimo = (extra: Record<string, unknown> = {}) => ({ title: 'Picantería El Náufrago', city: 'Guayaquil', street: 'Av. Los Ríos 123', address: 'Av. Los Ríos 123, Guayaquil', phone: '+593 98 111 2233', website: 'https://picanteria-el-naufrago.example/', openingHours: HORARIO, url: 'https://maps/hom', ...extra })
const mapas = (item: unknown, p: unknown = pruebas()) => S.observacionesDeMaps(item, sedes(), 'Náufrago', { observado_en: '2026-10-02T01:00:00Z', pruebas: p })

describe('D1 · lo que se PRUEBA y lo que no', () => {
  it('🔴 «Picantería El Náufrago» (Guayaquil · teléfono, sitio y dirección DISTINTOS) se DESCARTA y se declara que no se pudo probar', () => {
    const r = mapas(homonimo())
    expect(r.observaciones).toEqual([])
    expect(r.descartado.motivo).toMatch(/no se pudo probar que sea del cliente/)
    expect(r.descartado.motivo).toMatch(/Picantería El Náufrago/)
    expect(r.descartado.motivo).toMatch(/teléfono|sitio web|dirección/)
  })
  it('lo que sí lo prueba (cada uno solo): TELÉFONO · SITIO WEB · INSTAGRAM · DIRECCIÓN', () => {
    const casos: [string, Record<string, unknown>][] = [
      ['teléfono (0997744288 ≡ +593 99 774 4288)', { phone: '+593 99 774 4288' }],
      ['sitio web (con www, ruta y mayúsculas)', { website: 'https://WWW.naufrago.ec/menu?x=1' }],
      ['cuenta de Instagram enlazada', { website: 'https://www.instagram.com/naufrago.ec/' }],
      ['dirección (Av. 8 NO ≡ Avenida 8 NO)', { street: 'Av. 8 NO', address: 'Av. 8 NO, Guayaquil' }],
    ]
    for (const [que, extra] of casos) {
      const r = mapas(homonimo(extra))
      expect(r.descartado, que).toBeNull()
      expect(r.observaciones.length, que).toBeGreaterThan(0)
      expect(r.prueba, que).toBeTruthy()
    }
    expect(mapas(homonimo({ phone: '0997744288' })).prueba).toMatch(/teléfono/)
    expect(mapas(homonimo({ website: 'naufrago.ec' })).prueba).toMatch(/sitio web/)
    expect(mapas(homonimo({ website: 'instagram.com/naufrago.ec' })).prueba).toMatch(/instagram/i)
    expect(mapas(homonimo({ street: 'Avenida 8 NO', address: 'Avenida 8 NO, Guayaquil' })).prueba).toMatch(/dirección/)
  })
  it('un dato que COINCIDE alcanza aunque los otros difieran (el teléfono de la ficha puede estar viejo)', () => {
    expect(mapas(homonimo({ phone: '0997744288' })).descartado).toBeNull()
  })
  it('🔴 un nombre PARECIDO + ciudad NUNCA alcanza (sólo el nombre EXACTO del alta · ver sedes-mapas-nombre-exacto-y-cuentas)', () => {
    const r = mapas({ title: 'Náufrago Express', city: 'Guayaquil' })
    expect(r.observaciones).toEqual([])
    expect(r.descartado.motivo).toMatch(/no se pudo probar/)
  })
  it('sin nada ya visto contra qué probar (cliente sin teléfono, sitio ni dirección conocidos) NADA se acepta · se declara por qué', () => {
    const r = mapas(homonimo({ phone: '0997744288' }), S.pruebasDePropiedad([], {}))
    expect(r.observaciones).toEqual([])
    expect(r.descartado.motivo).toMatch(/no hay nada ya visto/)
  })
  it('una ficha de Mapas NO puede probarse a sí misma: lo que vino de Mapas no cuenta como prueba', () => {
    const deMapas = [{ sede: 'guayaquil', campo: 'canal_pedido', valor_norm: '981112233', fuente: 'mapas' }, { sede: 'guayaquil', campo: 'direccion', valor_norm: 'av-los-rios-123', fuente: 'mapas' }]
    const p = S.pruebasDePropiedad(deMapas, {})
    expect(p.telefonos).toEqual([])
    expect(p.direcciones).toEqual([])
    expect(mapas(homonimo(), p).descartado).not.toBeNull()
  })
  it('el homónimo de OTRA ciudad sigue descartándose primero por la ciudad (Gualaceo), con su motivo de siempre', () => {
    const r = mapas(MAPAS.item)
    expect(r.descartado.motivo).toMatch(/no es una sede de este cliente/)
  })
  it('una dirección demasiado corta/genérica («Guayaquil») NO prueba nada', () => {
    const p = S.pruebasDePropiedad([{ sede: 'guayaquil', campo: 'direccion', valor_norm: 'guayaquil', fuente: 'sitio' }], {})
    expect(p.direcciones).toEqual([])
  })
  it('AGNÓSTICO: la misma regla con otro cliente (otra ciudad, otro teléfono)', () => {
    const o = [{ sede: 'cuenca', ciudad: 'Cuenca', campo: 'canal_pedido', valor_norm: '987654321', fuente: 'sitio', alcance: 'sede' }, { sede: 'cuenca', ciudad: 'Cuenca', campo: 'ciudad', valor_norm: 'cuenca', fuente: 'sitio', alcance: 'sede' }]
    const s = S.descubrirSedes(o)
    const p = S.pruebasDePropiedad(o, { website_url: 'https://tienda.ec' })
    const item = { title: 'Tienda Luna', city: 'Cuenca', phone: '0987654321' }
    expect(S.observacionesDeMaps(item, s, 'Luna', { pruebas: p, observado_en: 'x' }).descartado).toBeNull()
    expect(S.observacionesDeMaps({ ...item, phone: '0911111111' }, s, 'Luna', { pruebas: p, observado_en: 'x' }).descartado).not.toBeNull()
  })
})

// ── el recolector con una base en memoria ──
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
const rawMaps = (id: string, item: unknown, cuando: string): Fila => ({ id, client_id: CID, apify_function: 'google_maps_scraper', params: {}, respuesta: [item], ensayo: false, created_at: cuando })
const mundo = (maps: Fila[]) => base({
  clients: [{ id: CID, name: 'Náufrago', website_url: 'https://www.naufrago.ec', config: { apify: { own_handles: { instagram: 'naufrago.ec' } } } }],
  client_web_pages: [{ client_id: CID, owner_role: 'propio', url: SITIO.url, content_text: SITIO.content_text, crawled_at: SITIO.crawled_at }],
  apify_raw: [rawIg(), ...maps], client_sedes: [], client_sede_datos: [],
})
const propia = (extra: Record<string, unknown> = {}) => ({ title: 'Náufrago', city: 'Guayaquil', street: 'Av. 8 NO', address: 'Av. 8 NO, Guayaquil', phone: '+593 99 774 4288', url: 'https://maps/propia', openingHours: [{ day: 'jueves', hours: '7 AM to 3 PM' }, { day: 'viernes', hours: '7 AM to 3 PM' }, { day: 'sábado', hours: '7 AM to 3 PM' }, { day: 'domingo', hours: '7 AM to 3 PM' }, { day: 'lunes', hours: '7 AM to 3 PM' }], ...extra })

describe('D1 · el recolector', () => {
  it('🔴 el homónimo de la misma ciudad NO deja ninguna fila de Mapas y queda DECLARADO', async () => {
    const m = mundo([rawMaps('h', homonimo(), '2026-10-02T01:00:00+00:00')])
    const r = await recolectarSedes(m.cliente, CID)
    expect(m.tablas.client_sede_datos.some((d) => d.fuente === 'mapas')).toBe(false)
    expect(JSON.stringify(m.tablas.client_sede_datos)).not.toMatch(/Los Ríos|Picanter/)
    expect(r.descartes[0].motivo).toMatch(/no se pudo probar/)
    expect(r.fuentes_leidas.mapas).toBe(0)
  })
  it('la ficha PROPIA (su teléfono y su dirección coinciden con lo del sitio y la bio) SÍ se guarda', async () => {
    const m = mundo([rawMaps('p', propia(), '2026-10-02T01:00:00+00:00')])
    const r = await recolectarSedes(m.cliente, CID)
    expect(r.descartes).toEqual([])
    expect(m.tablas.client_sede_datos.filter((d) => d.fuente === 'mapas').map((d) => d.campo).sort()).toEqual(['canal_pedido', 'direccion', 'horario'])
    expect(r.sedes.find((s) => s.clave === 'guayaquil')!.horario.estado).toBe('coincide') // sitio + Mapas dicen lo mismo
  })
  it('con la propia y el homónimo juntos: entra una, se descarta la otra', async () => {
    const m = mundo([rawMaps('p', propia(), '2026-10-02T01:00:00+00:00'), rawMaps('h', homonimo(), '2026-10-02T01:00:05+00:00')])
    const r = await recolectarSedes(m.cliente, CID)
    expect(r.descartes).toHaveLength(1)
    expect(JSON.stringify(m.tablas.client_sede_datos)).not.toMatch(/Los Ríos/)
  })
  it('el sitio del cliente sale de la ficha: un cliente sin sitio registrado prueba por teléfono o dirección', async () => {
    const m = mundo([rawMaps('p', propia({ phone: '', street: 'Av. 8 NO' }), '2026-10-02T01:00:00+00:00')])
    ;(m.tablas.clients[0] as Fila).website_url = null
    expect((await recolectarSedes(m.cliente, CID)).descartes).toEqual([])
  })
})

describe('D2 · raspados duplicados de la misma ficha no duplican observaciones', () => {
  it('🔴 la misma ficha raspada 3 veces en 3 días ⇒ UNA observación por campo (antes: 3)', async () => {
    const m = mundo([rawMaps('a', propia(), '2026-10-02T01:00:00+00:00'), rawMaps('b', propia(), '2026-10-03T01:00:00+00:00'), rawMaps('c', propia(), '2026-10-04T01:00:00+00:00')])
    await recolectarSedes(m.cliente, CID)
    const mp = m.tablas.client_sede_datos.filter((d) => d.fuente === 'mapas')
    expect(mp.filter((d) => d.campo === 'horario')).toHaveLength(1)
    expect(mp.filter((d) => d.campo === 'direccion')).toHaveLength(1)
    expect(mp.filter((d) => d.campo === 'canal_pedido')).toHaveLength(1)
  })
  it('y vuelve a correr sin agregar nada (idempotente)', async () => {
    const m = mundo([rawMaps('a', propia(), '2026-10-02T01:00:00+00:00'), rawMaps('b', propia(), '2026-10-03T01:00:00+00:00')])
    await recolectarSedes(m.cliente, CID)
    const n = m.tablas.client_sede_datos.length
    expect((await recolectarSedes(m.cliente, CID)).nuevas).toBe(0)
    expect(m.tablas.client_sede_datos.length).toBe(n)
  })
  it('un cambio REAL sí queda (7→3 y luego 9→5) y lo vigente es lo último', async () => {
    const nuevo = propia({ openingHours: [{ day: 'jueves', hours: '9 AM to 5 PM' }, { day: 'viernes', hours: '9 AM to 5 PM' }] })
    const m = mundo([rawMaps('a', propia(), '2026-10-02T01:00:00+00:00'), rawMaps('b', nuevo, '2026-10-05T01:00:00+00:00')])
    const r = await recolectarSedes(m.cliente, CID)
    expect(m.tablas.client_sede_datos.filter((d) => d.fuente === 'mapas' && d.campo === 'horario')).toHaveLength(2)
    expect((r.sedes.find((s) => s.clave === 'guayaquil')!.horario.fuentes as { fuente: string; valor: string }[]).some((f) => f.fuente === 'mapas' && /09:00–17:00/.test(f.valor))).toBe(true)
  })
  it('A → B → A: la vuelta a A SÍ se guarda (no se pierde por «ya existía» de hace tiempo) y lo vigente es A', async () => {
    const A = propia(), B = propia({ openingHours: [{ day: 'jueves', hours: '9 AM to 5 PM' }] })
    const m = mundo([rawMaps('1', A, '2026-10-02T01:00:00+00:00'), rawMaps('2', B, '2026-10-03T01:00:00+00:00'), rawMaps('3', A, '2026-10-04T01:00:00+00:00')])
    const r = await recolectarSedes(m.cliente, CID)
    expect(m.tablas.client_sede_datos.filter((d) => d.fuente === 'mapas' && d.campo === 'horario')).toHaveLength(3)
    expect((r.sedes.find((s) => s.clave === 'guayaquil')!.horario.fuentes as { fuente: string; valor: string }[]).some((f) => f.fuente === 'mapas' && /07:00–15:00/.test(f.valor))).toBe(true)
  })
})
