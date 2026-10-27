/**
 * FOTOS DE COMPETENCIA Y REFERENCIAS (27-oct · CC-CEREBRO · permiso de Emilio «dale») · US$ 0, sin red.
 * Mapas, sitios de competidores y biblioteca de anuncios dejan sus fotos en el Servicio de Apify, cada una con su ORIGEN (competidor / referencia);
 * el mismo archivo es una sola foto en todo el cliente; y el lector del portero NUNCA toma una referencia por foto propia.
 * Corre el CÓDIGO REAL de los nodos «Fotos · lista» y «Fotos · revisar».
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { leerFotos } from '../src/lib/cerebro/lectores'
import { PLAZOS_EN_DIAS } from '../src/lib/cerebro/plazos'

const require = createRequire(import.meta.url)
const W = join(process.cwd(), 'scripts', 'worker-staging', '3lyknrP3PoS2KzUf')
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const F: any = require(join(process.cwd(), 'src', 'lib', 'fotos', 'fotos-contexto-logica.js'))
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const servicio: any = await import(pathToFileURL(join(W, 'construir-contexto-fotos.mjs')).href)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const competencia: any = await import(pathToFileURL(join(W, 'construir-fotos-competencia.mjs')).href)
const ANTES = JSON.parse(readFileSync(join(W, 'servicio-apify-ANTES-fotos-competencia-2026-10-27.json'), 'utf8'))
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor
const CID = 'df7e47cc-bec4-4fa2-bc24-ff97ba5213a5'

const lugar = (n: number, extra: Record<string, unknown> = {}) => ({ title: `Cevichería ${n}`, placeId: `ChIJabc${n}_X`, imageUrl: `https://lh3.googleusercontent.com/p/${n}`, categoryName: 'Restaurante', address: 'Av. Uno', url: `https://maps.google.com/?cid=${n}`, ...extra })
const sitio = (url: string, og: string | null, title = 'Inicio') => ({ url, metadata: { title, openGraph: og === null ? [{ property: 'og:title', content: title }] : [{ property: 'og:title', content: title }, { property: 'og:image', content: og }] } })
const anuncio = (id: string, pagina: string, url: string | null) => ({ ad_archive_id: id, snapshot: { page_name: pagina, body: { text: 'Oferta de hoy' }, link_url: 'https://tienda.example/x', images: url ? [{ original_image_url: url }] : [], cards: [] } })

describe('fotosDeOtrasFuentes (lógica pura)', () => {
  it('Mapas: la portada de cada ficha es de un COMPETIDOR, con nombre, categoría y enlace', () => {
    const r = F.fotosDeOtrasFuentes('google_maps_scraper', [lugar(1), lugar(2)])
    expect(r).toHaveLength(2)
    expect(r[0]).toMatchObject({ owner_role: 'competidor', handle: 'cevicheria-1', post_id: 'maps-chijabc1_x', tipo: 'maps_portada', src: 'https://lh3.googleusercontent.com/p/1', medio: 'foto' })
    expect(r[0].caption).toContain('Restaurante')
  })
  it('Mapas: sin imagen, sin nombre ni id, o con una imagen que no es una dirección → no inventa nada', () => {
    expect(F.fotosDeOtrasFuentes('google_maps_scraper', [lugar(1, { imageUrl: null }), lugar(2, { imageUrl: 'javascript:alert(1)' }), { imageUrl: 'https://x/y.jpg' }, null, 'texto'])).toEqual([])
  })
  it('sitios de competidores: la imagen de portada (og:image), UNA por sitio, con la relativa resuelta a mano', () => {
    const r = F.fotosDeOtrasFuentes('competitor_website_scraper', [sitio('https://www.veseind.com/', '/wp/portada.jpg'), sitio('https://veseind.com/nuestra-historia/', '/wp/otra.jpg'), sitio('https://improseg.com/', 'https://cdn.improseg.com/p.png'), sitio('https://sin-imagen.com/', null), sitio('https://rel.com/a', 'foto.jpg')])
    expect(r.map((x: { handle: string }) => x.handle)).toEqual(['veseind.com', 'improseg.com'])
    expect(r[0]).toMatchObject({ owner_role: 'competidor', tipo: 'web_portada', src: 'https://www.veseind.com/wp/portada.jpg' })
    expect(r[1].src).toBe('https://cdn.improseg.com/p.png')
  })
  it('biblioteca de anuncios: la imagen de cada anuncio es una REFERENCIA (se halló por búsqueda, no es un competidor nombrado)', () => {
    const r = F.fotosDeOtrasFuentes('facebook_ads_library_scraper', [anuncio('155', 'Dreame-Love', 'https://scontent.fbcdn.net/a.jpg'), anuncio('156', 'Artel Glass', null), anuncio('157', 'Otra', 'https://scontent.fbcdn.net/c.jpg')])
    expect(r).toHaveLength(2)
    expect(r[0]).toMatchObject({ owner_role: 'referencia', handle: 'dreame-love', post_id: 'ad-155', tipo: 'anuncio', caption: 'Oferta de hoy', post_url: 'https://tienda.example/x' })
  })
  it('tope por llamada (12) y una función que no es de estas no devuelve nada', () => {
    expect(F.fotosDeOtrasFuentes('google_maps_scraper', Array.from({ length: 30 }, (_, i) => lugar(i + 1)))).toHaveLength(12)
    expect(F.fotosDeOtrasFuentes('instagram_scraper', [lugar(1)])).toEqual([])
    expect(F.esFuenteAjena('google_maps_scraper')).toBe(true)
    expect(F.esFuenteAjena('instagram_scraper')).toBe(false)
  })
})

/** corre el código real de «Fotos · lista» con una llamada y lo que devolvió Apify */
async function lista(fn: string, crudos: unknown[], o: { dry_run?: boolean; codigo?: string } = {}) {
  const items = crudos.map((json) => ({ json }))
  const refs: Record<string, unknown> = { 'Validar el cuerpo contra el esquema': { apify_function: fn, dry_run: o.dry_run ?? false, client_id: CID, metadata: {}, cuerpo: {}, params: {} } }
  const $ = (n: string) => {
    if (n === 'Merge · apify data ready') return { all: () => items, first: () => items[0] }
    if (!(n in refs)) throw new Error('nodo no ejecutado: ' + n)
    return { first: () => ({ json: refs[n] }), all: () => [{ json: refs[n] }] }
  }
  const out = await new AsyncFunction('$input', '$', '$env', '$json', '$workflow', '$execution', o.codigo ?? servicio.codigoDeNodo('lista'))
    .call({ helpers: { httpRequest: async () => [{ config: {} }] } }, { first: () => items[0], all: () => items }, $, { SUPABASE_SERVICE_ROLE_KEY: 'k' }, {}, { id: 'WF' }, { id: '1' })
  return (out as Array<{ json: Record<string, unknown> }>).map((x) => x.json)
}

describe('«Fotos · lista» con el código real', () => {
  it('Mapas → competidor; anuncios → referencia; sitios → competidor; todas con client_id', async () => {
    const m = await lista('google_maps_scraper', [lugar(1)])
    expect(m).toHaveLength(1); expect(m[0]).toMatchObject({ client_id: CID, owner_role: 'competidor', post_id: 'maps-chijabc1_x' })
    const a = await lista('facebook_ads_library_scraper', [anuncio('9', 'Pagina', 'https://scontent.fbcdn.net/z.jpg')])
    expect(a[0]).toMatchObject({ client_id: CID, owner_role: 'referencia', post_id: 'ad-9' })
    const s = await lista('competitor_website_scraper', [sitio('https://rival.com/', '/og.jpg')])
    expect(s[0]).toMatchObject({ owner_role: 'competidor', handle: 'rival.com', src: 'https://rival.com/og.jpg' })
  })
  it('un ensayo (dry_run) y las funciones que no dejan fotos no copian nada', async () => {
    expect(await lista('google_maps_scraper', [lugar(1)], { dry_run: true })).toEqual([])
    expect(await lista('website_content_scraper', [sitio('https://x.com/', '/og.jpg')])).toEqual([])
    expect(await lista('google_serp_scraper', [{ organicResults: [] }])).toEqual([])
  })
  it('el nodo de ANTES (el vivo) no copiaba nada de Mapas: la prueba está roja sin el arreglo', async () => {
    const vivo = ANTES.nodes.find((n: { name: string }) => n.name === 'Fotos · lista').parameters.jsCode as string
    expect(await lista('google_maps_scraper', [lugar(1)], { codigo: vivo })).toEqual([])
  })
})

/** corre el código real de «Fotos · revisar»: `metas` son las salidas de «lista», `previos` lo que ya hay guardado del cliente, `bytes` lo que bajó cada foto */
async function revisar(metas: Array<Record<string, unknown>>, bytes: Buffer[], previos: Array<Record<string, unknown>>) {
  const entradas = bytes.map((b) => ({ json: {}, binary: { data: { mimeType: 'image/png', _b: b } } }))
  const $ = (n: string) => {
    if (n === 'Fotos · lista') return { all: () => metas.map((json) => ({ json })) }
    throw new Error('nodo no ejecutado: ' + n)
  }
  const escrituras: unknown[] = []
  const ctx = {
    helpers: {
      httpRequest: async (o: { method: string; url: string; body?: unknown }) => { if (o.method === 'GET') return previos; escrituras.push(o.body); return {} },
      getBinaryDataBuffer: async (i: number) => bytes[i],
    },
  }
  const out = await new AsyncFunction('$input', '$', '$env', '$json', '$workflow', '$execution', servicio.codigoDeNodo('revisar'))
    .call(ctx, { all: () => entradas }, $, { SUPABASE_SERVICE_ROLE_KEY: 'k' }, {}, { id: 'WF' }, { id: '1' })
  return out as Array<{ json: Record<string, unknown> }>
}
const png = (n: number) => Buffer.concat([Buffer.from('89504e47', 'hex'), Buffer.from(String(n).padEnd(40, 'x'))])
const meta = (rol: string, handle: string, post: string) => ({ client_id: CID, owner_role: rol, handle, post_id: post, tipo: 't', src: 'https://x/' + post })

describe('«Fotos · revisar»: el mismo archivo es UNA foto en todo el cliente', () => {
  it('🔴 una foto de competidor que ya está guardada como propia (df7e47cc) no se vuelve a subir; la propia siempre entra', async () => {
    const hashPropia = F.sha256Hex(png(1))
    const previos = [{ hash_archivo: hashPropia, owner_role: 'propio', handle: 'zeroriskgye', post_id: 'P1' }]
    const buenas = await revisar([meta('competidor', 'rival', 'maps-1'), meta('referencia', 'ads', 'ad-1'), meta('competidor', 'otro', 'maps-2')], [png(1), png(1), png(2)], previos)
    expect(buenas.map((b) => b.json.post_id)).toEqual(['maps-2'])
    const propia = await revisar([meta('propio', 'zeroriskgye', 'P9')], [png(1)], [{ hash_archivo: hashPropia, owner_role: 'competidor', handle: 'rival', post_id: 'maps-1' }])
    expect(propia.map((b) => b.json.post_id)).toEqual(['P9'])
  })
  it('re-raspar la MISMA foto (misma clave) la actualiza; y dos fotos iguales dentro de la misma llamada quedan en una', async () => {
    const h = F.sha256Hex(png(5))
    const mismaClave = await revisar([meta('competidor', 'rival', 'maps-1')], [png(5)], [{ hash_archivo: h, owner_role: 'competidor', handle: 'rival', post_id: 'maps-1' }])
    expect(mismaClave).toHaveLength(1)
    const dosIguales = await revisar([meta('competidor', 'a', 'maps-1'), meta('referencia', 'b', 'ad-2')], [png(6), png(6)], [])
    expect(dosIguales.map((b) => b.json.post_id)).toEqual(['maps-1'])
  })
  it('si la lectura de lo guardado falla, se sigue sin esa guarda (no se pierde la copia)', async () => {
    const $ = () => ({ all: () => [{ json: meta('competidor', 'a', 'maps-1') }] })
    const ctx = { helpers: { httpRequest: async () => { throw new Error('caída') }, getBinaryDataBuffer: async () => png(7) } }
    const out = await new AsyncFunction('$input', '$', '$env', '$json', '$workflow', '$execution', servicio.codigoDeNodo('revisar'))
      .call(ctx, { all: () => [{ json: {}, binary: { data: { mimeType: 'image/png' } } }] }, $, { SUPABASE_SERVICE_ROLE_KEY: 'k' }, {}, { id: 'WF' }, { id: '1' })
    expect(out).toHaveLength(1)
  })
})

describe('el constructor del flujo', () => {
  it('cambia SOLO «Fotos · lista» y «Fotos · revisar»; mismas conexiones y mismos nodos', () => {
    const nuevo = competencia.aplicarFotosDeCompetencia(ANTES)
    const cambiados = ANTES.nodes.filter((n: object, i: number) => JSON.stringify(n) !== JSON.stringify(nuevo.nodes[i])).map((n: { name: string }) => n.name)
    expect(cambiados).toEqual(['Fotos · lista', 'Fotos · revisar'])
    expect(nuevo.nodes.length).toBe(ANTES.nodes.length)
    expect(JSON.stringify(nuevo.connections)).toBe(JSON.stringify(ANTES.connections))
    expect(nuevo.nodes.find((n: { name: string }) => n.name === 'Fotos · lista').parameters.jsCode).toContain('fotosDeOtrasFuentes(')
  })
  it('se niega a aplicarse dos veces', () => {
    expect(() => competencia.aplicarFotosDeCompetencia(competencia.aplicarFotosDeCompetencia(ANTES))).toThrow(/ya tienen/)
  })
})

describe('el lector del portero: una REFERENCIA nunca es una foto propia', () => {
  const fila = (id: string, rol: string) => ({ id, client_id: CID, owner_role: rol, handle: 'h', post_id: id, tipo: 'anuncio', medio: 'foto', estado: 'ok', url: `https://b/${id}.jpg`, caption: 'oferta', posted_at: null, post_url: null, producto: null, producto_fuente: null, created_at: '2026-10-27T14:00:00Z' })
  it('propio = su fuente ; competidor y referencia = de un tercero (estante de la competencia)', async () => {
    const filas = [fila('a', 'propio'), fila('b', 'competidor'), fila('c', 'referencia')]
    const consulta = async () => ({ filas, error: null })
    const r = await leerFotos({ consulta, cliente: CID, ahora: new Date('2026-10-27T15:00:00Z'), plazos: PLAZOS_EN_DIAS } as never)
    const por = (id: string) => r.lineas.find((l) => l.ref === `client_social_images:${id}`)!
    expect(por('a')).toMatchObject({ origen: 'su_fuente', estante: 'E3' })
    expect(por('b')).toMatchObject({ origen: 'tercero', estante: 'E5' })
    expect(por('c')).toMatchObject({ origen: 'tercero', estante: 'E5' })
    expect(por('c').titulo).toContain('Foto de referencia')
  })
})
