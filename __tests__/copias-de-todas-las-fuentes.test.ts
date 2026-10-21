/**
 * ENCARGO manual visual con todas las fuentes · T2 · el escritor único de copias (la cadena `Fotos ·` del Servicio de Apify) copia también las demás fuentes PROPIAS:
 * Mapas, sitio, Facebook y YouTube. Fixtures = filas REALES de `apify_raw` (21-oct), recortadas. Instagram no cambia (se prueba byte a byte contra el nodo vivo de ANTES). A costo cero.
 */
import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const require = createRequire(import.meta.url)
const W = join(process.cwd(), 'scripts', 'worker-staging', '3lyknrP3PoS2KzUf')
const FX = join(process.cwd(), '__tests__', 'fixtures', 'copias-fuentes')
const FXIG = join(process.cwd(), '__tests__', 'fixtures', 'fotos-contexto')
const cargar = (f: string) => JSON.parse(readFileSync(join(FX, f), 'utf8'))
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const L: any = require(join(process.cwd(), 'src', 'lib', 'fotos', 'copias-de-las-fuentes-logica.js'))
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const servicio: any = await import(pathToFileURL(join(W, 'construir-contexto-fotos.mjs')).href)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const nuevas: any = await import(pathToFileURL(join(W, 'construir-fuentes-nuevas.mjs')).href)
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor
const CID = 'df7e47cc-bec4-4fa2-bc24-ff97ba5213a5'
const OTRO = '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312'
const ANTES = JSON.parse(readFileSync(join(W, 'servicio-apify-ANTES-fuentes-nuevas-2026-10-21.json'), 'utf8'))
const MAPAS = cargar('mapas-propio.json'), SITIO = cargar('sitio-propio.json'), FB = cargar('facebook-posts.json'), YT = cargar('youtube.json')
const OWN = { target_kind: 'own' }

describe('Mapas · la ficha del lugar propio (own_google_maps_profile)', () => {
  it('una foto por sede con handle maps:<placeId>, tipo lugar_image, medio imagen (nunca foto de producto) y el título como texto', () => {
    const f = L.copiasDeLaLlamada({ apify_function: 'own_google_maps_profile', items: MAPAS, metadata: {} })
    expect(f).toHaveLength(MAPAS.filter((m: { imageUrl: string }) => m.imageUrl).length)
    expect(f[0]).toMatchObject({ owner_role: 'propio', tipo: 'lugar_image', medio: 'imagen', posicion: 'unica', src: MAPAS[0].imageUrl, caption: MAPAS[0].title })
    expect(f[0].handle).toBe('maps:' + L.segmento(MAPAS[0].placeId, 60)); expect(f[0].post_id).toBe('maps-' + L.segmento(MAPAS[0].placeId, 60))
  })
  it('sin imageUrl, sin identificador o repetida: no sale; tope de 5 sedes', () => {
    expect(L.deMapas([{ placeId: 'a' }, { imageUrl: 'https://x/y.jpg' }, { imageUrl: 'data:image/png;base64,AAA', placeId: 'b' }])).toEqual([])
    const muchas = Array.from({ length: 9 }, (_, i) => ({ placeId: 'p' + i, imageUrl: 'https://x/' + i + '.jpg' }))
    expect(L.deMapas(muchas)).toHaveLength(5)
    expect(L.deMapas([{ placeId: 'p', imageUrl: 'https://x/1.jpg' }, { placeId: 'p', imageUrl: 'https://x/2.jpg' }])).toHaveLength(1)
  })
})

describe('Sitio propio (website_content_scraper)', () => {
  it('el logo declarado (jsonLd.logo) es logo_hd; las imágenes que el sitio declara de sí mismo (og:image, jsonLd.image) son sitio_image; handle sitio:<host>', () => {
    const f = L.copiasDeLaLlamada({ apify_function: 'website_content_scraper', items: SITIO, metadata: {} })
    const og = f.find((x: { tipo: string }) => x.tipo === 'sitio_image')
    expect(og).toMatchObject({ owner_role: 'propio', handle: 'sitio:naufrago.ec', post_id: 'sitio-img-1', medio: 'imagen', src: 'https://naufrago.ec/og-image.png' })
    expect(f.every((x: { handle: string }) => x.handle === 'sitio:naufrago.ec')).toBe(true)
  })
  it('lee la forma real: openGraph como lista {property, content}, jsonLd anidado; el logo en string, en {url} o en lista; sin repetir', () => {
    const items = [{ url: 'https://www.mi-sitio.test/a', metadata: { openGraph: [{ property: 'og:title', content: 'x' }, { property: 'og:image', content: 'https://mi-sitio.test/og.png' }], jsonLd: [[{ '@type': 'Organization', logo: { url: 'https://mi-sitio.test/logo.png' }, image: ['https://mi-sitio.test/og.png', 'https://mi-sitio.test/b.jpg'] }]] } }]
    const f = L.deSitio(items)
    expect(f.map((x: { post_id: string; src: string }) => [x.post_id, x.src])).toEqual([['sitio-logo', 'https://mi-sitio.test/logo.png'], ['sitio-img-1', 'https://mi-sitio.test/og.png'], ['sitio-img-2', 'https://mi-sitio.test/b.jpg']])
    expect(f[0]).toMatchObject({ tipo: 'logo_hd', medio: 'logo' })
  })
  it('sin host no hay handle ⇒ nada; tope de 6 imágenes; el logo no se repite como imagen', () => {
    expect(L.deSitio([{ metadata: { openGraph: [{ property: 'og:image', content: 'https://x/y.png' }] } }])).toEqual([])
    const imgs = Array.from({ length: 10 }, (_, i) => 'https://s.test/' + i + '.jpg')
    expect(L.deSitio([{ url: 'https://s.test/', metadata: { jsonLd: [{ image: imgs }] } }]).filter((x: { tipo: string }) => x.tipo === 'sitio_image')).toHaveLength(6)
    expect(L.deSitio([{ url: 'https://s.test/', metadata: { jsonLd: [{ logo: 'https://s.test/l.png', image: ['https://s.test/l.png'] }] } }]).map((x: { tipo: string }) => x.tipo)).toEqual(['logo_hd'])
  })
})

describe('Facebook (publicaciones_facebook) · SIN EJERCER con una sola fila real', () => {
  it('la foto de perfil de la página es logo_hd y las imágenes de cada publicación son post_image con su texto, fecha y enlace; el elemento sin imagen del media se ignora', () => {
    const f = L.copiasDeLaLlamada({ apify_function: 'publicaciones_facebook', items: FB, metadata: OWN })
    const logo = f.find((x: { tipo: string }) => x.tipo === 'logo_hd')
    expect(logo).toMatchObject({ post_id: 'fb-logo', medio: 'logo', owner_role: 'propio' }); expect(logo.handle).toMatch(/^facebook:/)
    const posts = f.filter((x: { tipo: string }) => x.tipo === 'post_image')
    expect(posts.length).toBeGreaterThan(0)
    expect(posts.every((x: { src: string }) => /^https:\/\//.test(x.src))).toBe(true)
    expect(posts[0].post_id).toMatch(/^fb-/); expect(posts[0].medio).toBe('imagen')
  })
  it('varias imágenes en un post: portada + hijos; la misma url dos veces cuenta una; tope de 4 por post', () => {
    const post = { postId: 'P1', pageName: 'Mi Marca', text: 'hola', time: '2026-10-01T10:00:00.000Z', url: 'https://www.facebook.com/p/1', media: [{ url: 'https://fb/x' }, ...Array.from({ length: 6 }, (_, i) => ({ image: { uri: 'https://cdn/' + (i % 5) + '.jpg' } }))] }
    const f = L.deFacebook([post])
    expect(f.map((x: { post_id: string; posicion: string }) => [x.post_id, x.posicion])).toEqual([['fb-p1-1', 'portada'], ['fb-p1-2', 'hijo-1'], ['fb-p1-3', 'hijo-2'], ['fb-p1-4', 'hijo-3']])
    expect(f[0]).toMatchObject({ caption: 'hola', posted_at: '2026-10-01T10:00:00.000Z', post_url: 'https://www.facebook.com/p/1', handle: 'facebook:mi_marca' })
  })
  it('sin nombre de página ni id no hay handle ⇒ nada; fecha en epoch (segundos) se lee', () => {
    expect(L.deFacebook([{ postId: 'x', media: [{ image: { uri: 'https://c/1.jpg' } }] }])).toEqual([])
    expect(L.deFacebook([{ postId: 'x', pageName: 'p', timestamp: 1790000000, media: [{ image: { uri: 'https://c/1.jpg' } }] }])[0].posted_at).toBe(new Date(1790000000 * 1000).toISOString())
  })
})

describe('detalles de Facebook y de las url', () => {
  it('🔴 la MISMA imagen repetida al principio de un post se cuenta una sola vez (no gasta el cupo de 4)', () => {
    const post = { postId: 'P1', pageName: 'm', media: [{ image: { uri: 'https://cdn/a.jpg' } }, { image: { uri: 'https://cdn/a.jpg' } }, { image: { uri: 'https://cdn/b.jpg' } }, { image: { uri: 'https://cdn/c.jpg' } }] }
    expect(L.deFacebook([post]).filter((x: { tipo: string }) => x.tipo === 'post_image').map((x: { src: string }) => x.src)).toEqual(['https://cdn/a.jpg', 'https://cdn/b.jpg', 'https://cdn/c.jpg'])
  })
  it('🔴 dos publicaciones con el mismo id no producen la misma fila dos veces (llave única handle + post_id)', () => {
    const p = { postId: 'P1', pageName: 'm', media: [{ image: { uri: 'https://cdn/a.jpg' } }] }
    expect(L.copiasDeLaLlamada({ apify_function: 'publicaciones_facebook', items: [p, { ...p }], metadata: OWN }).filter((x: { tipo: string }) => x.tipo === 'post_image')).toHaveLength(1)
  })
  it('solo url http(s) bien formadas: nada de data:, ftp:, javascript:, con espacios o vacías', () => {
    for (const mala of ['data:image/png;base64,AAA', 'ftp://x/y.jpg', 'javascript:alert(1)', 'https://x/y z.jpg', '', 'no es url', null, undefined, 5]) expect(L.urlDeImagen(mala)).toBeNull()
    expect(L.urlDeImagen(' https://x/y.jpg ')).toBe('https://x/y.jpg'); expect(L.urlDeImagen({ url: 'http://x/y.png' })).toBe('http://x/y.png'); expect(L.urlDeImagen({ uri: 'https://x/z.png' })).toBe('https://x/z.png')
  })
})

describe('YouTube (videos_youtube) · SIN EJERCER con una sola fila real', () => {
  it('el cuadro de portada de cada video del canal propio: medio video (nunca foto de producto), handle youtube:<canal>', () => {
    const f = L.copiasDeLaLlamada({ apify_function: 'videos_youtube', items: YT, metadata: OWN })
    expect(f).toHaveLength(YT.length)
    expect(f[0]).toMatchObject({ owner_role: 'propio', tipo: 'video_portada', medio: 'video', src: YT[0].thumbnailUrl, post_id: 'yt-' + L.segmento(YT[0].id, 40) })
    expect(f[0].handle).toBe('youtube:' + L.segmento(YT[0].channelId || YT[0].channelName, 60))
  })
})

describe('R6 y candados: solo lo propio, y solo donde se puede', () => {
  it('🔴 Facebook y YouTube de un tercero (sin marca «own») NO se copian; Mapas y sitio propios sí por su propia función', () => {
    expect(L.copiasDeLaLlamada({ apify_function: 'publicaciones_facebook', items: FB, metadata: { target_kind: 'third_party' } })).toEqual([])
    expect(L.copiasDeLaLlamada({ apify_function: 'publicaciones_facebook', items: FB, metadata: {} })).toEqual([])
    expect(L.copiasDeLaLlamada({ apify_function: 'videos_youtube', items: YT, metadata: undefined })).toEqual([])
    expect(L.copiasDeLaLlamada({ apify_function: 'own_google_maps_profile', items: MAPAS, metadata: {} }).length).toBeGreaterThan(0)
    expect(L.copiasDeLaLlamada({ apify_function: 'website_content_scraper', items: SITIO, metadata: {} }).length).toBeGreaterThan(0)
  })
  it('🔴 los competidores de esas fuentes (google_maps_scraper, competitor_website_scraper, facebook_ads_library_scraper) y Instagram NO pasan por aquí', () => {
    for (const fn of ['google_maps_scraper', 'competitor_website_scraper', 'facebook_ads_library_scraper', 'instagram_scraper', 'instagram_post_comments_scraper', 'inventada']) {
      expect(L.copiasDeLaLlamada({ apify_function: fn, items: MAPAS, metadata: OWN })).toEqual([]); expect(L.fuenteSoportada(fn)).toBe(false)
    }
  })
  it('un cliente excluido no se copia; sin llamada o sin items tampoco hay error', () => {
    expect(L.copiasDeLaLlamada({ apify_function: 'own_google_maps_profile', items: MAPAS, metadata: {}, excluido: true })).toEqual([])
    expect(L.copiasDeLaLlamada(undefined)).toEqual([]); expect(L.copiasDeLaLlamada({ apify_function: 'own_google_maps_profile' })).toEqual([])
  })
  it('las filas nuevas no chocan con las de Instagram: el handle lleva prefijo de fuente y el post_id es único', () => {
    const todas = [...L.deMapas(MAPAS), ...L.deSitio(SITIO), ...L.deFacebook(FB), ...L.deYoutube(YT)]
    expect(new Set(todas.map((x: { handle: string; post_id: string }) => x.handle + '|' + x.post_id)).size).toBe(todas.length)
    expect(todas.every((x: { handle: string }) => /^(maps|sitio|facebook|youtube):/.test(x.handle))).toBe(true)
  })
})

// ── el nodo REAL «Fotos · lista» ────────────────────────────────────────────────────────────────
async function lista(o: { fn: string; items: unknown[]; metadata?: Record<string, unknown>; excluidos?: unknown[]; codigo?: string; own?: string | null; cuerpo?: Record<string, unknown> }) {
  const refs: Record<string, unknown> = { 'Validar el cuerpo contra el esquema': { apify_function: o.fn, dry_run: false, client_id: CID, metadata: o.metadata ?? {}, cuerpo: o.cuerpo ?? {} } }
  const items = o.items.map((json) => ({ json }))
  const $ = (n: string) => {
    if (n === 'Merge · apify data ready') return { all: () => items, first: () => items[0] }
    if (!(n in refs)) throw new Error('nodo no ejecutado: ' + n)
    return { first: () => ({ json: refs[n] }), all: () => [{ json: refs[n] }] }
  }
  const pedidos: string[] = []
  const helpers = { httpRequest: async (p: { url: string }) => { pedidos.push(p.url); return p.url.includes('cadena_config') ? [{ valor: o.excluidos ?? [] }] : [{ config: o.own ? { apify: { own_handles: { instagram: o.own } } } : {} }] } }
  const out = await new AsyncFunction('$input', '$', '$env', '$json', '$workflow', '$execution', o.codigo ?? servicio.codigoDeNodo('lista')).call({ helpers }, { first: () => items[0], all: () => items }, $, { SUPABASE_SERVICE_ROLE_KEY: 'k' }, {}, { id: 'WF' }, { id: '1' })
  return { filas: (out as Array<{ json: Record<string, unknown> }>).map((x) => x.json), pedidos }
}

describe('«Fotos · lista» con el código real', () => {
  it('🔴 cada fuente propia sale por el escritor único, con client_id y las columnas que ya conoce la cadena', async () => {
    for (const [fn, items, meta] of [['own_google_maps_profile', MAPAS, {}], ['website_content_scraper', SITIO, {}], ['publicaciones_facebook', FB, OWN], ['videos_youtube', YT, OWN]] as const) {
      const { filas } = await lista({ fn, items: items as unknown[], metadata: meta })
      expect(filas.length, fn).toBeGreaterThan(0)
      for (const f of filas) { expect(f.client_id).toBe(CID); expect(f.owner_role).toBe('propio'); expect(typeof f.src).toBe('string'); expect(typeof f.post_id).toBe('string'); expect(typeof f.handle).toBe('string'); expect(typeof f.tipo).toBe('string') }
    }
  })
  it('🔴 Náufrago-forma: un cliente en `copias_fuentes_excluidos` no recibe copias de las fuentes nuevas', async () => {
    const r = await lista({ fn: 'own_google_maps_profile', items: MAPAS, excluidos: [CID.toUpperCase()] })
    expect(r.filas).toEqual([]); expect(r.pedidos.some((p) => p.includes('copias_fuentes_excluidos'))).toBe(true)
    expect((await lista({ fn: 'own_google_maps_profile', items: MAPAS, excluidos: [OTRO] })).filas.length).toBeGreaterThan(0)
  })
  it('una función que no es de estas fuentes (competencia, comentarios…) devuelve [] sin tocar la base', async () => {
    const r = await lista({ fn: 'google_maps_scraper', items: MAPAS })
    expect(r.filas).toEqual([]); expect(r.pedidos).toEqual([])
  })
  it('un ensayo (dry_run) o una llamada sin cliente no copia nada', async () => {
    const codigo = servicio.codigoDeNodo('lista')
    for (const ctx of [{ dry_run: true, client_id: CID }, { dry_run: false, client_id: null }]) {
      const items = MAPAS.map((json: unknown) => ({ json }))
      const $ = (n: string) => n === 'Merge · apify data ready' ? { all: () => items } : { first: () => ({ json: { apify_function: 'own_google_maps_profile', metadata: {}, ...ctx } }) }
      const out = await new AsyncFunction('$input', '$', '$env', '$json', '$workflow', '$execution', codigo).call({ helpers: { httpRequest: async () => [] } }, {}, $, { SUPABASE_SERVICE_ROLE_KEY: 'k' }, {}, {}, {})
      expect(out).toEqual([])
    }
  })
  it('🔴 NO-REGRESIÓN de Instagram: el nodo nuevo entrega EXACTAMENTE las mismas filas que el nodo vivo de ANTES (perfil + posts reales)', async () => {
    const perfil = { username: 'naufrago.ec', profilePicUrlHD: 'https://example.invalid/logo-hd.jpg', latestPosts: JSON.parse(readFileSync(join(FXIG, 'raspado-instagram-propio.json'), 'utf8')).latestPosts }
    const vivo = ANTES.nodes.find((n: { name: string }) => n.name === 'Fotos · lista').parameters.jsCode as string
    const a = await lista({ fn: 'instagram_scraper', items: [perfil], own: 'naufrago.ec', codigo: vivo })
    const b = await lista({ fn: 'instagram_scraper', items: [perfil], own: 'naufrago.ec' })
    expect(b.filas.length).toBeGreaterThan(10); expect(b.filas).toEqual(a.filas)
    const c = await lista({ fn: 'instagram_scraper', items: [perfil, { ...perfil, username: 'rival' }], own: 'naufrago.ec', codigo: vivo })
    const d = await lista({ fn: 'instagram_scraper', items: [perfil, { ...perfil, username: 'rival' }], own: 'naufrago.ec' })
    expect(d.filas).toEqual(c.filas)
  })
})

describe('«Fotos · revisar»: la ruta del archivo es segura y la de Instagram no cambia', () => {
  const jpg = readFileSync(join(FXIG, 'DPti3m8jQJt.jpg'))
  async function revisar(metas: Array<Record<string, unknown>>, codigo?: string) {
    const items = metas.map((json) => ({ json }))
    const $ = (n: string) => { if (n === 'Fotos · lista') return { all: () => items }; throw new Error('nodo no ejecutado ' + n) }
    const entradas = metas.map(() => ({ json: {}, binary: { data: { mimeType: 'image/jpeg' } } }))
    return (await new AsyncFunction('$input', '$', '$env', '$json', '$workflow', '$execution', codigo ?? servicio.codigoDeNodo('revisar')).call(
      { helpers: { getBinaryDataBuffer: async () => jpg, httpRequest: async () => ({ statusCode: 200 }) } }, { all: () => entradas, first: () => entradas[0] }, $, { SUPABASE_SERVICE_ROLE_KEY: 'k' }, {}, {}, {})) as Array<{ json: { path: string } }>
  }
  const meta = (handle: string, post_id: string) => ({ client_id: CID, owner_role: 'propio', handle, post_id, tipo: 'post_image', src: 'https://example.invalid/x.jpg' })
  it('🔴 un handle de fuente nueva («maps:ChIJ…») se vuelve un tramo de ruta limpio; un post_id raro también', async () => {
    const [m, f] = await revisar([meta('maps:chij_abc', 'maps-chij_abc'), meta('facebook:mi_marca', 'fb-p 1/2?')])
    expect(m.json.path).toBe(CID + '/propio/maps_chij_abc/maps-chij_abc.jpg'); expect(f.json.path).toBe(CID + '/propio/facebook_mi_marca/fb-p_1_2_.jpg')
  })
  it('🔴 la ruta de Instagram es IDÉNTICA a la del nodo vivo de ANTES', async () => {
    const vivo = ANTES.nodes.find((n: { name: string }) => n.name === 'Fotos · revisar').parameters.jsCode as string
    const metas = [meta('naufrago.ec', 'DPti3m8jQJt'), meta('naufrago.ec', 'DPti3m8jQJt-c2'), meta('naufrago.ec', 'logo-hd'), meta('mi_marca.ec', 'CCEn66lnmOK')]
    const a = await revisar(metas, vivo); const b = await revisar(metas)
    expect(b.map((x) => x.json.path)).toEqual(a.map((x) => x.json.path))
  })
})

describe('el constructor del flujo', () => {
  it('cambia SOLO «Fotos · lista» y «Fotos · revisar» y los deja iguales al código del repositorio', () => {
    const nuevo = nuevas.aplicarFuentesNuevas(ANTES)
    const cambiados = ANTES.nodes.filter((n: { name: string }, i: number) => JSON.stringify(n) !== JSON.stringify(nuevo.nodes[i])).map((n: { name: string }) => n.name)
    expect(cambiados.sort()).toEqual(['Fotos · lista', 'Fotos · revisar'])
    expect(JSON.stringify(nuevo.connections)).toBe(JSON.stringify(ANTES.connections)); expect(nuevo.nodes.length).toBe(ANTES.nodes.length)
    for (const [clave, nombre] of [['lista', 'Fotos · lista'], ['revisar', 'Fotos · revisar']]) {
      expect((nuevo.nodes.find((n: { name: string }) => n.name === nombre).parameters.jsCode as string).replace(/\r\n/g, '\n')).toBe(servicio.codigoDeNodo(clave).replace(/\r\n/g, '\n'))
    }
  })
  it('se niega a aplicarse dos veces; el nodo no usa module.exports ni require', () => {
    expect(() => nuevas.aplicarFuentesNuevas(nuevas.aplicarFuentesNuevas(ANTES))).toThrow(/ya tienen este código/)
    const c = servicio.codigoDeNodo('lista'); expect(c).not.toMatch(/module\.exports|require\(/)
  })
})
