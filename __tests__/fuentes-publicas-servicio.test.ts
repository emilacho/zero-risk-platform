/**
 * Fuentes públicas · el Servicio de Apify con las 9 funciones nuevas. Sin Apify de verdad: los nodos de código se corren con un mundo falso y respuestas con la FORMA que declara cada actor
 * (no son corridas grabadas: ver el papel de entrega). El plan sale del planificador agnóstico para 3 rubros distintos.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { NUEVAS, servicioFuentesPublicas, cambiar } from '../scripts/worker-staging/construir-fuentes-publicas.mjs'
import { planDeFuentesPublicas } from '@/lib/fuentes-publicas'
import { ACTORES_NUEVOS } from '@/lib/fuentes-publicas/catalogo'

type Nodo = { name: string; parameters: Record<string, any> }
type Flujo = { nodes: Nodo[]; connections: Record<string, any>; active?: boolean }
const WS = join(process.cwd(), 'scripts/worker-staging/3lyknrP3PoS2KzUf')
const leer = (p: string) => JSON.parse(readFileSync(join(WS, p), 'utf8')) as Flujo
const ANTES = leer('servicio-apify-ANTES-fuentes-2026-10-12.json')
const HOY = leer('servicio-apify-ARREGLADO-fuentes-2026-10-12.json')
const nodo = (f: Flujo, n: string) => f.nodes.find((x) => x.name === n)!
const lf = (s: string) => s.split('\r\n').join('\n')
const AsyncFunction = Object.getPrototypeOf(async function () { /* */ }).constructor as new (...a: string[]) => (...b: unknown[]) => Promise<any>
const FUNCIONES = Object.keys(NUEVAS)

/** corre un nodo de código del Servicio con un mundo falso */
async function correr(f: Flujo, nombre: string, entrada: Record<string, any>, extra: Record<string, (n: string) => any> = {}) {
  const fn = new AsyncFunction('$', '$input', '$env', 'Date', lf(String(nodo(f, nombre).parameters.jsCode)))
  const $ = (n: string) => { if (extra[n]) return extra[n](n); throw new Error('nodo ' + n) }
  const $input = { first: () => ({ json: entrada }), all: () => (Array.isArray(entrada) ? entrada : [entrada]).map((json: any) => ({ json })) }
  return (await (fn as any)(($ as unknown), $input, { APIFY_API_TOKEN: 'x' }, Date)) as Array<{ json: any }>
}

// ── 3 clientes de rubros distintos (inventados) → llamadas reales del planificador
const CASOS = {
  restaurante: planDeFuentesPublicas({ rubro: 'restaurante', pais: 'EC', mapas: { url: 'https://www.google.com/maps/place/x' }, enlaces: ['https://www.tripadvisor.com/R-1.html', 'https://www.facebook.com/negocio-a'], redes: { instagram: '@negocio_a', facebook: 'https://www.facebook.com/negocio-a', tiktok: '@negocio_a' } }),
  software: planDeFuentesPublicas({ rubro: 'plataforma SaaS', nombre: 'Producto B', pais: 'US', redes: { youtube: 'https://www.youtube.com/@producto_b' } }),
  hotel: planDeFuentesPublicas({ rubro: 'hotel', pais: 'CO', mapas: { placeId: 'ChIJ1' }, enlaces: ['https://www.booking.com/hotel/co/c.html', 'https://www.tripadvisor.com.co/H-2.html'], redes: { instagram: 'hotel_c' } }),
}
const TODAS = Object.entries(CASOS).flatMap(([c, p]) => p.llamadas.filter((l) => FUNCIONES.includes(l.funcion)).map((l) => ({ cliente: c, ...l })))

describe('el flujo se reconstruye igual desde su respaldo y SOLO cambian los nodos previstos', () => {
  it('reproducible', () => { expect(JSON.stringify(servicioFuentesPublicas(ANTES))).toBe(JSON.stringify(HOY)) })
  it('cambian 5 nodos + 1 nuevo + 1 salida del Switch; estado activo y conexiones previas intactas', () => {
    const dif = ANTES.nodes.filter((n) => JSON.stringify(n) !== JSON.stringify(nodo(HOY, n.name))).map((n) => n.name).sort()
    expect(dif).toEqual(['Armar el cuerpo del raspador', 'Switch · apify_function', 'Validar el cuerpo contra el esquema', 'Validar params · contrato', 'Validate Body', 'transform-sections'].sort())
    expect(HOY.nodes.length).toBe(ANTES.nodes.length + 1)
    expect(HOY.active).toBe(ANTES.active)
    const reglas = (f: Flujo) => nodo(f, 'Switch · apify_function').parameters.rules.values
    expect(reglas(HOY).length).toBe(reglas(ANTES).length + 1)
    expect(reglas(HOY).slice(0, reglas(ANTES).length)).toEqual(reglas(ANTES))
    expect(HOY.connections['Switch · apify_function'].main.length).toBe(reglas(HOY).length)
    expect(HOY.connections['Switch · apify_function'].main.slice(0, -1)).toEqual(ANTES.connections['Switch · apify_function'].main)
    expect(HOY.connections['Switch · apify_function'].main.at(-1)).toEqual([{ node: 'apify-fuentes-publicas', type: 'main', index: 0 }])
    expect(HOY.connections['apify-fuentes-publicas']).toEqual(HOY.connections['apify-fb-ads'])
    for (const [k, v] of Object.entries(ANTES.connections)) if (k !== 'Switch · apify_function') expect(HOY.connections[k]).toEqual(v)
  })
  it('el nodo nuevo llama al actor del cuerpo, con la llave por cabecera y sin ella en la dirección', () => {
    const n = nodo(HOY, 'apify-fuentes-publicas').parameters
    expect(n.url).toBe('=https://api.apify.com/v2/acts/{{ $json.actor_id }}/run-sync-get-dataset-items?timeout=280')
    expect(JSON.stringify(n.headerParameters)).toContain('Authorization')
    expect(n.url).not.toMatch(/token/)
  })
  it('la tabla de actores del flujo es la del catálogo de la biblioteca', () => {
    for (const f of FUNCIONES) expect(NUEVAS[f as keyof typeof NUEVAS].actor).toBe(ACTORES_NUEVOS[f].actor)
  })
  it('ninguna parte de lo nuevo nombra a un cliente, un lugar ni un rubro', () => {
    const nuevo = FUNCIONES.map((f) => JSON.stringify(NUEVAS[f as keyof typeof NUEVAS])).join('') + readFileSync(join(process.cwd(), 'scripts/worker-staging/construir-fuentes-publicas.mjs'), 'utf8')
    expect(nuevo).not.toMatch(/n[aá]ufrago|ol[oó]n\b|guayaquil|santa elena|ecuador|quito|ceviche|encebollado|peniche|goeurope/i)
  })
})

describe('Validate Body · acepta las 9 funciones y sigue rechazando lo desconocido', () => {
  const ok = async (fn: string) => (await correr(HOY, 'Validate Body', { body: { client_id: 'c1', apify_function: fn, destination: 'respuesta', params: { x: 1 } } }))[0].json
  for (const f of FUNCIONES) it(f, async () => { const j = await ok(f); expect(JSON.stringify(j)).not.toMatch(/apify_function invalid/) })
  it('una función inventada se rechaza', async () => { expect(JSON.stringify(await ok('funcion_que_no_existe'))).toMatch(/apify_function invalid/) })
})

describe('contrato mínimo + constructor + esquema, con las llamadas REALES del planificador de 3 rubros', () => {
  it(`hay llamadas nuevas en los 3 clientes (${TODAS.length})`, () => { expect(new Set(TODAS.map((t) => t.cliente)).size).toBe(3); expect(TODAS.length).toBeGreaterThanOrEqual(9) })
  for (const t of TODAS) {
    it(`${t.cliente} · ${t.funcion}`, async () => {
      const ctx = { client_id: 'c1', apify_function: t.funcion, destination: 'respuesta', dry_run: false, params: t.params }
      const c1 = (await correr(HOY, 'Validar params · contrato', ctx))[0].json
      expect(c1.params_ok, JSON.stringify(c1.errors)).toBe(true)
      const c2 = (await correr(HOY, 'Armar el cuerpo del raspador', c1))[0].json
      expect(c2.cuerpo_ok, JSON.stringify(c2.errors)).not.toBe(false)
      expect(c2.actor_id).toBe(NUEVAS[t.funcion as keyof typeof NUEVAS].actor)
      const c3 = (await correr(HOY, 'Validar el cuerpo contra el esquema', c2))[0].json
      expect(c3.cuerpo_ok, JSON.stringify(c3.errors)).toBe(true)
      expect(c3.avisos ?? []).toEqual([]) // 0 campos que el actor no declare
    })
  }
  it('sin la dirección/usuario del negocio el contrato RECHAZA antes de pagar', async () => {
    for (const f of FUNCIONES) { const r = (await correr(HOY, 'Validar params · contrato', { client_id: 'c1', apify_function: f, params: {} }))[0].json; expect(r.params_ok, f).toBe(false) }
  })
  it('una función existente no se mueve: sin actor_id y mismo cuerpo que antes', async () => {
    const ctx = { client_id: 'c1', apify_function: 'google_serp_scraper', params: { queries: ['x'] } }
    const antes = (await correr(ANTES, 'Armar el cuerpo del raspador', ctx))[0].json, hoy = (await correr(HOY, 'Armar el cuerpo del raspador', ctx))[0].json
    expect(hoy).toEqual(antes); expect(hoy.actor_id).toBeUndefined()
  })
  it('calidad: las transcripciones se piden SIEMPRE donde el actor las da (Instagram, TikTok con respaldo de audio, YouTube con respaldo, Facebook)', async () => {
    const cuerpo = async (f: string, params: any) => (await correr(HOY, 'Armar el cuerpo del raspador', { client_id: 'c', apify_function: f, params }))[0].json.cuerpo
    expect((await cuerpo('videos_instagram', { username: ['a'] })).includeTranscript).toBe(true)
    expect((await cuerpo('videos_tiktok', { profiles: ['a'] })).downloadSubtitlesOptions).toBe('DOWNLOAD_AND_TRANSCRIBE_VIDEOS_WITHOUT_SUBTITLES')
    expect((await cuerpo('videos_youtube', { startUrls: ['https://youtube.com/@a'] })).transcriptionAndSubtitle).toBe('TRANSCRIPTION_AS_FALLBACK')
    expect((await cuerpo('publicaciones_facebook', { startUrls: ['https://facebook.com/a'] })).captionText).toBe(true)
    expect((await cuerpo('resenas_google_maps', { startUrls: ['https://g.co/x'] })).personalData).toBe(false) // sin datos personales de quien opinó
    expect((await cuerpo('resenas_tripadvisor', { startUrls: ['https://t.co/x'] })).scrapeReviewerInfo).toBe(false)
  })
})

describe('transform-sections · lo que se escribe', () => {
  const corre = async (fn: string, items: any[], dry = false) => {
    const j = (await correr(HOY, 'transform-sections', items, {
      'Validate Body': () => ({ first: () => ({ json: { body: { apify_function: fn, client_id: 'c1', destination: 'respuesta', metadata: { target_kind: 'own' } }, dry_run: dry } }) }),
    }))[0].json
    return j
  }
  it('reseñas de mapas: una línea por reseña con estrellas, fecha y texto, y SIN el nombre de quien opinó', async () => {
    const j = await corre('resenas_google_maps', [
      { name: 'Persona Privada', stars: 5, publishedAtDate: '2026-09-30T10:00:00Z', text: 'Muy buena atención, volvería.', responseFromOwnerText: 'Gracias por venir' },
      { name: 'Otra Persona', stars: 2, publishedAtDate: '2026-08-01T10:00:00Z', text: 'Tardaron demasiado.' },
    ])
    expect(j.sections.length).toBe(1)
    expect(j.sections[0].section_label).toBe('resenas_google_maps_propias')
    expect(j.sections[0].text).toContain('★5 · 2026-09-30 · «Muy buena atención, volvería.» [respuesta del negocio: «Gracias por venir»]')
    expect(j.sections[0].text).toContain('★2 · 2026-08-01 · «Tardaron demasiado.»')
    expect(JSON.stringify(j)).not.toMatch(/Persona Privada|Otra Persona/)
    expect(j.source_table).toBe('client_voc_library'); expect(j.sin_resultados).toBe(false)
  })
  it('hoteles (liked/disliked), tiendas de apps (reseñas anidadas), Facebook (recomienda)', async () => {
    expect((await corre('resenas_booking', [{ liked: 'La vista', disliked: 'El ruido', rating: 8, reviewDate: '2026-07-01' }])).sections[0].text).toContain('★8 · 2026-07-01 · «lo que gustó: La vista · lo que no: El ruido»')
    expect((await corre('resenas_app_store', [{ appName: 'app', reviews: [{ title: 'Útil', reviewText: 'Me sirve', rating: 5, date: '2026-01-02' }] }])).sections[0].text).toContain('★5 · 2026-01-02 · Útil · «Me sirve»')
    expect((await corre('resenas_facebook', [{ text: 'Lo recomiendo', isRecommended: true, date: '2026-03-04' }])).sections[0].text).toContain('recomienda · 2026-03-04 · «Lo recomiendo»')
  })
  it('SALIDAS REALES grabadas (ronda 75): cada función deja texto útil en el flujo; YouTube trae los subtítulos como lista de {srt}', async () => {
    const real = (fn: string) => (JSON.parse(readFileSync(join(process.cwd(), '__tests__/fixtures/fuentes-reales-r75', fn + '.json'), 'utf8')) as { respuesta: any[] }).respuesta
    for (const fn of ['resenas_google_maps', 'resenas_tripadvisor', 'publicaciones_facebook', 'videos_instagram', 'videos_tiktok', 'videos_youtube']) {
      const j = await corre(fn, real(fn))
      expect(j.sections.length, fn).toBeGreaterThan(0)
      expect(j.sections[0].text.length, fn).toBeGreaterThan(40)
    }
    const yt = await corre('videos_youtube', real('videos_youtube'))
    expect(yt.sections[0].text).toContain('lo que se dice: «Lo primero que ves hacer a un niño')
    expect(yt.sections[0].text).not.toContain('-->')
    // una página que no existe: el actor devuelve un error, no una reseña → sin texto, y se declara
    const fb = await corre('resenas_facebook', real('resenas_facebook'))
    expect(fb.sections.length).toBe(0)
  })
  it('videos: pie + transcripción; sin transcripción se DICE', async () => {
    const t = (await corre('videos_instagram', [{ url: 'https://instagram.com/reel/A', caption: 'Pie del video', transcript: 'Hola, hoy les mostramos', timestamp: '2026-09-01T00:00:00Z' }, { url: 'https://instagram.com/reel/B', caption: 'Solo pie' }])).sections[0].text
    expect(t).toContain('video https://instagram.com/reel/A · 2026-09-01 · pie: «Pie del video» · lo que se dice: «Hola, hoy les mostramos»')
    expect(t).toContain('SIN transcripción')
    expect((await corre('videos_tiktok', [{ webVideoUrl: 'https://tiktok.com/v/1', text: 'pie', transcript: 'texto hablado', createTimeISO: '2026-05-05T00:00:00Z' }])).sections[0].section_label).toBe('tiktok_videos_propios')
    expect((await corre('videos_youtube', [{ url: 'https://youtube.com/watch?v=1', title: 'Título', subtitles: 'estas son palabras de una persona hablando', date: '2026-02-02' }])).sections[0].text).toContain('lo que se dice: «estas son palabras de una persona hablando»')
  })
  it('publicaciones de Facebook: texto + lo que se dice en el video', async () => {
    expect((await corre('publicaciones_facebook', [{ text: 'Promo de hoy', time: '2026-10-01T00:00:00Z', videoTranscript: 'bienvenidos' }])).sections[0].text).toContain('2026-10-01 · «Promo de hoy» · lo que se dice en el video: «bienvenidos»')
  })
  it('muchas reseñas se parten en secciones de ≤ 7.000 caracteres y, si no caben, el recorte SE DECLARA', async () => {
    const items = Array.from({ length: 400 }, (_, i) => ({ stars: 4, publishedAtDate: '2026-01-01', text: 'Reseña número ' + i + ' ' + 'x'.repeat(200) }))
    const j = await corre('resenas_tripadvisor', items)
    expect(j.sections.length).toBeLessThanOrEqual(8)
    for (const s of j.sections) expect(s.text.length).toBeLessThanOrEqual(7100)
    expect(j.sections.at(-1).text).toMatch(/⟨recortado · se guardaron 8 secciones de \d+⟩/)
  })
  it('sin datos: cero secciones y el cero clasificado (no se fabrica un cartel)', async () => {
    const j = await corre('resenas_google_maps', [])
    expect(j.sections).toEqual([]); expect(j.sin_resultados).toBe(true); expect(j.cero.clase).toBe('no_existe')
  })
  it('una función existente produce exactamente lo mismo que antes', async () => {
    const items = [{ title: 'Negocio', address: 'Calle 1' }]
    const mundo = { 'Validate Body': () => ({ first: () => ({ json: { body: { apify_function: 'google_maps_scraper', client_id: 'c1', destination: 'respuesta' }, dry_run: false } }) }) }
    expect((await correr(HOY, 'transform-sections', items, mundo))[0].json).toEqual((await correr(ANTES, 'transform-sections', items, mundo))[0].json)
  })
})

describe('la ruta del Switch: las 9 funciones nuevas van al nodo nuevo y las de siempre NO', () => {
  const regla = (nodo(HOY, 'Switch · apify_function').parameters.rules.values as any[]).at(-1)
  const evalua = (fn: string) => regla.conditions.conditions.some((c: any) => fn.startsWith(c.rightValue))
  it('rutas', () => {
    for (const f of FUNCIONES) expect(evalua(f), f).toBe(true)
    for (const f of ['facebook_ads_library_scraper', 'instagram_scraper', 'trustpilot_scraper', 'software_review_scraper', 'google_maps_scraper', 'own_google_maps_profile', 'website_content_scraper']) expect(evalua(f), f).toBe(false)
    expect(regla.conditions.combinator).toBe('or')
    expect(() => cambiar('a', 'b', 'c', 'x')).toThrow()
  })
})
