/** Bordes que las mutaciones dejaron vivos (comportamiento real, no relleno). */
import { describe, expect, it } from 'vitest'
import { DbFalsa } from '../../../oficina/__tests__/dbfalsa'
import { correrDiario } from '../correr'
import { contenidoDeInstagram, contenidoDeMapas, huellaDeInstagram, huellaDeMapas } from '../huella'
import { observar } from '../observar'
import { planDeLimpieza } from '../ordenar'
import { planDeAmpliacion } from '../plan'
import { senalesDeComentarios, senalesDeResenas } from '../resenas'
import { rutaPlan, validar } from '../rutas'

const C = '11111111-1111-4111-8111-111111111111'
const AHORA = new Date('2026-10-10T12:00:00Z')
const SITIO = 'https://www.clinicaejemplo.test'
const cliente = () => new DbFalsa().semilla('clients', [{ id: C, name: 'Clínica Ejemplo', website_url: SITIO, config: { apify: { own_handles: { instagram: 'clinicaejemplo' } } } }])
const web = (id: string, dia: string, paginas: Array<[string, string]>) => ({ id, client_id: C, ensayo: false, apify_function: 'website_content_scraper', params: { url: SITIO }, respuesta: paginas.map(([url, text]) => ({ url, text })), created_at: `${dia}T08:00:00Z` })
const corre = (db: DbFalsa, o: Partial<Parameters<typeof correrDiario>[0]> = {}) => correrDiario({ db, client_id: C, dry_run: false, ahora: AHORA, forzar: true, ...o })

describe('limpieza · los bordes de «vencida»', () => {
  const f = (o: Record<string, unknown>) => ({ id: 'f', creado_en: '2026-10-01T00:00:00Z', origen: 'tercero', ...o }) as never
  it('justo en su fecha NO está vencida; reconfirmada exactamente en su fecha ya no vence; reconfirmada ANTES de su fecha sí vence; sin reconfirmar vence', () => {
    const ahora = new Date('2026-10-10T12:00:00Z')
    const p = (o: Record<string, unknown>) => planDeLimpieza([f(o)], ahora).vencidas.length
    expect(p({ vigente_hasta: '2026-10-10T12:00:00Z' })).toBe(0)
    expect(p({ vigente_hasta: '2026-10-10T11:59:59Z' })).toBe(1)
    expect(p({ vigente_hasta: '2026-10-09T00:00:00Z', reconfirmado_en: '2026-10-09T00:00:00Z' })).toBe(0)
    expect(p({ vigente_hasta: '2026-10-09T00:00:00Z', reconfirmado_en: '2026-10-08T23:59:59Z' })).toBe(1)
    expect(p({ vigente_hasta: '2026-10-09T00:00:00Z', reconfirmado_en: null })).toBe(1)
  })
  it('entre duplicados, la primaria gana a una más antigua que no lo es', () => {
    const p = planDeLimpieza([f({ id: 'vieja', huella: 'h', creado_en: '2026-09-01T00:00:00Z' }), f({ id: 'dueno', huella: 'h', origen: 'su_fuente', creado_en: '2026-10-05T00:00:00Z' })], AHORA)
    expect(p.duplicados).toEqual([{ id: 'vieja', conservar_id: 'dueno' }])
  })
})

describe('observar · bordes', () => {
  const ctx = { propios: { sitio: SITIO, handles: ['clinicaejemplo'] }, publicacionesPropias: ['AAA'] }
  const fila = (o: Record<string, unknown>) => ({ id: 'x', ensayo: false, created_at: '2026-10-10T08:00:00Z', ...o }) as never
  it('comentarios: si UNA de las publicaciones pedidas es ajena, se ignoran todos (no se sabe de quién son)', () => {
    const k = (urls: string[]) => fila({ apify_function: 'instagram_post_comments_scraper', params: { directUrls: urls }, respuesta: [{ text: 'a' }, { text: 'b' }] })
    expect(observar([k(['https://www.instagram.com/p/AAA/', 'https://www.instagram.com/p/AJENA/'])], ctx)).toEqual([])
    expect(observar([k(['https://www.instagram.com/p/AAA/'])], ctx).map((o) => o.fuente)).toEqual(['comentarios'])
    expect(observar([k([])], ctx)).toEqual([])
  })
  it('una ficha de Mapas sin reseñas no deja señal de reseñas; con reseñas sí', () => {
    const m = (reviews: unknown) => fila({ apify_function: 'own_google_maps_profile', params: {}, respuesta: [{ title: 'X', reviews }] })
    expect(observar([m([])], ctx).map((o) => o.fuente)).toEqual(['mapas'])
    expect(observar([m([{ stars: 5 }])], ctx).map((o) => o.fuente).sort()).toEqual(['mapas', 'resenas'])
  })
  it('lo más nuevo manda; filas de ensayo y de otro sitio no entran', () => {
    const w = (id: string, t: string, text: string) => fila({ id, apify_function: 'website_content_scraper', params: { url: SITIO }, created_at: t, respuesta: [{ url: SITIO + '/', text }] })
    const o = observar([w('vieja', '2026-10-01T00:00:00Z', 'Texto viejo de la pagina'), w('nueva', '2026-10-09T00:00:00Z', 'Texto nuevo de la pagina'), fila({ id: 'e', ensayo: true, apify_function: 'website_content_scraper', params: {}, respuesta: [{ url: SITIO + '/', text: 'ENSAYO' }] })], ctx)
    expect(o).toHaveLength(1); expect(o[0].raw_id).toBe('nueva')
  })
})

describe('huella · bordes', () => {
  it('Instagram: una publicación sin texto o sin código no cuenta; Mapas: un horario en objeto sí cuenta', () => {
    const base = { username: 'x', biography: 'bio', latestPosts: [{ shortCode: 'A', caption: 'Hola' }] }
    expect(huellaDeInstagram(contenidoDeInstagram({ ...base, latestPosts: [...base.latestPosts, { shortCode: 'B', caption: '' }, { shortCode: '', id: '', caption: 'Sin codigo' }] }))).toBe(huellaDeInstagram(contenidoDeInstagram(base)))
    const a = huellaDeMapas(contenidoDeMapas({ title: 'X', openingHours: [{ day: 'lunes', hours: '9am' }] }))
    expect(a).not.toBe(huellaDeMapas(contenidoDeMapas({ title: 'X', openingHours: [{ day: 'lunes', hours: '10am' }] })))
    expect(a).not.toBe(huellaDeMapas(contenidoDeMapas({ title: 'X' })))
  })
})

describe('reseñas · bordes', () => {
  it('las estrellas pueden venir como texto o como `rating`; empates entre términos se ordenan por orden alfabético', () => {
    const s = senalesDeResenas([{ stars: '4' }, { rating: 5 }, { stars: 1, text: 'zeta alfa' }, { stars: 1, text: 'zeta alfa' }, { stars: 2, text: 'zeta alfa' }])
    expect(s.por_estrellas).toMatchObject({ '4': 1, '5': 1, '1': 2, '2': 1 }); expect(s.total).toBe(5)
    expect(s.quejas_repetidas.map((q) => q.termino)).toEqual(['alfa', 'zeta'])
    expect(senalesDeComentarios(['uno dos', 'uno dos', 'uno dos']).temas_repetidos.map((t) => t.termino)).toEqual(['dos', 'uno'])
  })
})

describe('plan · bordes', () => {
  const base = { cliente: { id: 'c', name: 'Clínica Ejemplo', config: {} as unknown }, ultima: {} as Record<string, string | null>, publicaciones_propias: ['A'], gastado_hoy_usd: 0, corridas_de_resenas_hoy: 0, ahora: AHORA }
  it('«vencida» a partir de 1 día: 23 horas no, 1 día exacto sí', () => {
    expect(planDeAmpliacion({ ...base, ultima: { mapas: '2026-10-09T13:00:00Z' } }).hacer.some((a) => a.fuente === 'mapas')).toBe(false)
    expect(planDeAmpliacion({ ...base, ultima: { mapas: '2026-10-09T12:00:00Z' } }).hacer.some((a) => a.fuente === 'mapas')).toBe(true)
  })
  it('una configuración que no es un objeto (texto, nulo) se trata como vacía sin romper; direcciones que no son texto se descartan', () => {
    expect(() => planDeAmpliacion({ ...base, cliente: { ...base.cliente, config: 'texto' } })).not.toThrow()
    expect(planDeAmpliacion({ ...base, cliente: { ...base.cliente, config: null } }).no_cubiertas.some((n) => n.fuente === 'reparto')).toBe(true)
    expect(planDeAmpliacion({ ...base, cliente: { ...base.cliente, config: { apify: { url_reparto: [5, null, 'https://r.test/x'] } } } }).hacer.filter((a) => a.fuente === 'reparto')).toHaveLength(1)
    expect(planDeAmpliacion({ ...base, cliente: { ...base.cliente, config: { apify: { url_reparto: 'https://r.test/x' } } } }).no_cubiertas.some((n) => n.fuente === 'reparto')).toBe(true)
  })
})

describe('rutas · bordes', () => {
  it('un cuerpo nulo o de texto es 400', () => {
    for (const mal of [null, 'x', 5]) expect((validar(mal, { clienteObligatorio: false }) as { status: number }).status).toBe(400)
  })
  it('lo ya vigilado hoy (Mapas, comentarios) y lo que el diario ya gastó hoy recortan el plan', async () => {
    const act = (db: DbFalsa) => db.semilla('client_brand_books', [{ id: 'b', client_id: C }]).semilla('client_historical_outputs', [{ id: 'p', client_id: C, output_type: 'campaign_plan_90d', provenance_tag: {} }])
    const vig = (fuente: string) => ({ id: `v-${fuente}`, client_id: C, fuente, ref: fuente, contenido: {}, observado_en: '2026-10-10T08:00:00Z', reconfirmado_en: null, retirada_en: null })
    const db = act(cliente()).semilla('cerebro_vigilancia', [vig('mapas'), vig('comentarios')])
    const hacer = ((await rutaPlan(db, { dry_run: true }, AHORA)).body as { clientes: Array<{ plan: { hacer: Array<{ fuente: string }> } }> }).clientes[0].plan.hacer
    expect(hacer.map((a) => a.fuente)).toEqual([])
    const db2 = act(cliente()).semilla('cerebro_diario_corridas', [{ id: 'k', client_id: C, dia: '2026-10-10', gasto_usd: 0.97 }])
    const c2 = ((await rutaPlan(db2, { dry_run: true }, AHORA)).body as { clientes: Array<{ gastado_hoy_usd: number; plan: { hacer: unknown[] } }> }).clientes[0]
    expect(c2.gastado_hoy_usd).toBe(0.97); expect(c2.plan.hacer).toEqual([])
  })
})

describe('correr · bordes', () => {
  it('cada página del sitio se compara con SU propia versión: cambiar una no mueve a las otras', async () => {
    const db = cliente().semilla('apify_raw', [web('r1', '2026-10-09', [[SITIO + '/a', 'Pagina A con su texto estable'], [SITIO + '/b', 'Pagina B con su texto original']])])
    await corre(db, { ahora: new Date('2026-10-09T12:00:00Z') })
    db.semilla('apify_raw', [web('r2', '2026-10-10', [[SITIO + '/a', 'Pagina A con su texto estable'], [SITIO + '/b', 'Pagina B con su texto cambiado']])])
    const r = await corre(db)
    expect(Object.fromEntries(r.fuentes.map((f) => [f.ref.slice(-2), f.accion]))).toEqual({ '/a': 'renovada', '/b': 'version_nueva' })
  })
  it('Mapas y Instagram: un cambio de dirección o de leyenda se ve como una línea nueva y una quitada', async () => {
    const mapas = (id: string, dia: string, dir: string) => ({ id, client_id: C, ensayo: false, apify_function: 'own_google_maps_profile', params: {}, respuesta: [{ title: 'X', address: dir }], created_at: `${dia}T08:00:00Z` })
    const ig = (id: string, dia: string, cap: string) => ({ id, client_id: C, ensayo: false, apify_function: 'instagram_scraper', params: { usernames: ['clinicaejemplo'] }, respuesta: [{ username: 'clinicaejemplo', biography: 'bio', latestPosts: [{ shortCode: 'A', caption: cap, ownerUsername: 'clinicaejemplo' }] }], created_at: `${dia}T08:00:00Z` })
    const db = cliente().semilla('apify_raw', [mapas('m1', '2026-10-09', 'Calle 1'), ig('i1', '2026-10-09', 'Primera leyenda')])
    await corre(db, { ahora: new Date('2026-10-09T12:00:00Z') })
    db.semilla('apify_raw', [mapas('m2', '2026-10-10', 'Calle 2'), ig('i2', '2026-10-10', 'Leyenda editada')])
    const r = await corre(db)
    for (const f of r.fuentes) { expect(f.accion).toBe('version_nueva'); expect(f.resumen!.cambio_real).toEqual({ nuevas: 1, quitadas: 1 }) }
  })
  it('las reseñas que cambian dejan una señal NUEVA (no se repite la vieja); los comentarios, igual', async () => {
    const mapas = (id: string, dia: string, stars: number[]) => ({ id, client_id: C, ensayo: false, apify_function: 'own_google_maps_profile', params: {}, respuesta: [{ title: 'X', reviews: stars.map((s) => ({ stars: s })) }], created_at: `${dia}T08:00:00Z` })
    const db = cliente().semilla('apify_raw', [mapas('m1', '2026-10-09', [5, 5, 4])])
    await corre(db, { ahora: new Date('2026-10-09T12:00:00Z') })
    db.semilla('apify_raw', [mapas('m2', '2026-10-10', [5, 5, 4, 5, 1])])
    await corre(db)
    const datos = db.tablas['cerebro_oportunidades'].map((o) => o.dato)
    expect(datos).toEqual(['2 de 3 reseñas de 5 estrellas', '3 de 5 reseñas de 5 estrellas'])
  })
  it('un contenido guardado ilegible o vacío no rompe la comparación (se compara contra «sin líneas»)', async () => {
    const db = cliente().semilla('apify_raw', [web('r1', '2026-10-10', [[SITIO + '/', 'Linea del sitio numero uno']])]).semilla('cerebro_vigilancia', [{ id: 'v', client_id: C, fuente: 'sitio', ref: SITIO + '/', huella: 'otra', contenido: null, observado_en: '2026-10-01T00:00:00Z', retirada_en: null }])
    const r = await corre(db)
    expect(r.fuentes[0].accion).toBe('version_nueva')
  })
})
