/**
 * «GUARDAR TODO · PARTE 2» (31-oct · CC-CEREBRO) · US$ 0, sin red.
 * (1) ilustraciones pintadas por CSS y GIF · (2) PDF enlazados del sitio · (3) fotos de la ficha PROPIA de Mapas (nunca de un homónimo).
 * Corre el CÓDIGO REAL de los nodos «Fotos · lista» y «Fotos · revisar» y el módulo de copia de la ficha propia.
 */
import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { copiarFotosDeMapasPropia, urlsDeFotosDeLaFicha, tipoPorFirma } from '../src/lib/portero-alimenta/fotos-de-mapas-propia'

const require = createRequire(import.meta.url)
const W = join(process.cwd(), 'scripts', 'worker-staging', '3lyknrP3PoS2KzUf')
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const F: any = require(join(process.cwd(), 'src', 'lib', 'fotos', 'fotos-contexto-logica.js'))
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const servicio: any = await import(pathToFileURL(join(W, 'construir-contexto-fotos.mjs')).href)
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor
const CID = '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312'
const pagina = (url: string, html: string, extra: Record<string, unknown> = {}) => ({ url, html, markdown: '', metadata: { title: 'Inicio', openGraph: [] }, ...extra })
const srcs = (r: Array<{ src: string }>) => r.map((f) => f.src)

describe('1 · ilustraciones que dibuja el CSS', () => {
  it('saca los fondos de style="" y de bloques <style> que son imagen; las fuentes y los svg no', () => {
    const html = '<div style="background-image:url(/img/h.jpg)"></div><section style=\'background:url("/b.png") no-repeat\'></section><style>.a{background:url(\'/c.webp\')} .b{background:url(/d.gif)} .c{background:url(/e.svg)} @font-face{src:url(/f.woff2)}</style>'
    const r = F.fotosDeSitio([pagina('https://x.ec/', html)], { rol: 'propio' })
    expect(srcs(r)).toEqual(['https://x.ec/img/h.jpg', 'https://x.ec/b.png', 'https://x.ec/c.webp', 'https://x.ec/d.gif'])
  })
  it('🔴 un fondo CSS de otro dominio en página propia es referencia; en página de competidor es competidor', () => {
    const html = '<div style="background:url(https://cdn.tercero.com/a.jpg)"></div>'
    expect(F.fotosDeSitio([pagina('https://x.ec/', html)], { rol: 'propio' })[0].owner_role).toBe('referencia')
    expect(F.fotosDeSitio([pagina('https://rival.ec/', html)], { rol: 'competidor' })[0].owner_role).toBe('competidor')
  })
  it('el GIF ya no se descarta por la extensión; svg/avif/ico siguen fuera (la captura de pantalla es su fuente)', () => {
    const r = F.fotosDeSitio([pagina('https://x.ec/', '<img src="/a.gif"><img src="/b.svg"><img src="/c.avif"><img src="/d.ico">')], { rol: 'propio' })
    expect(srcs(r)).toEqual(['https://x.ec/a.gif'])
  })
  it('«Fotos · revisar» reconoce un GIF por su firma (47494638) y lo sube como .gif', () => {
    const codigo: string = servicio.codigoDeNodo('revisar')
    expect(codigo).toContain("'47494638'")
    expect(codigo).toContain("'image/gif'")
    expect(codigo).toContain("'gif'")
  })
})

describe('2 · PDF enlazados (puro)', () => {
  it('solo PDF del MISMO dominio base, sin repetidos, con tope; lee <a href> y enlaces del markdown', () => {
    const r = F.pdfsEnlazados([
      pagina('https://www.x.ec/carta', '<a href="/menu.pdf">Menú</a><a href="https://cdn.x.ec/lista.PDF?v=2">Lista</a><a href="https://tercero.com/ajeno.pdf">Ajeno</a><a href="/menu.pdf#p2">repetido</a><a href="/foto.jpg">no</a>', { markdown: '[Catálogo](/cat.pdf) y ![img](/i.pdf)' }),
    ], { max: 10 })
    expect(r.map((d: { url: string }) => d.url)).toEqual(['https://www.x.ec/menu.pdf', 'https://cdn.x.ec/lista.PDF?v=2', 'https://www.x.ec/cat.pdf'])
    expect(r[0]).toMatchObject({ texto: 'Menú', pagina: 'https://www.x.ec/carta' })
    expect(F.pdfsEnlazados([pagina('https://x.ec/', '<a href="/1.pdf"></a><a href="/2.pdf"></a><a href="/3.pdf"></a>')], { max: 2 })).toHaveLength(2)
  })
})

describe('2 · PDF enlazados con el código real de «Fotos · lista»', () => {
  async function lista(fn: string, crudos: unknown[], o: { rol?: string | null; metadata?: Record<string, unknown>; params?: Record<string, unknown> } = {}) {
    const items = crudos.map((json) => ({ json }))
    const llamadas: Array<{ url: string; body?: Record<string, unknown> }> = []
    const refs: Record<string, unknown> = {
      'Validar el cuerpo contra el esquema': { apify_function: fn, dry_run: false, client_id: CID, metadata: o.metadata ?? {}, cuerpo: {}, params: o.params ?? {} },
      'Armar el cuerpo del raspador': { cuerpo: { startUrls: [{ url: 'https://x.ec' }] } },
    }
    const $ = (n: string) => {
      if (n === 'Merge · apify data ready') return { all: () => items, first: () => items[0] }
      return { first: () => ({ json: refs[n] }), all: () => [{ json: refs[n] }] }
    }
    await new AsyncFunction('$input', '$', '$env', '$json', '$workflow', '$execution', servicio.codigoDeNodo('lista'))
      .call({ helpers: { httpRequest: async (r: { url: string; body?: Record<string, unknown> }) => { llamadas.push({ url: r.url, body: r.body }); return r.url.includes('client_web_pages') ? [{ owner_role: o.rol ?? 'propio' }] : {} } } }, { first: () => items[0], all: () => items }, $, { SUPABASE_SERVICE_ROLE_KEY: 'k' }, {}, { id: 'WF' }, { id: '1' })
    return llamadas.filter((l) => l.url.includes('/webhook/apify-service-workflow'))
  }
  const sitio = pagina('https://x.ec/', '<a href="/menu.pdf">Menú</a><a href="/carta.pdf">Carta</a><a href="https://ajeno.com/z.pdf">z</a>')

  it('sitio propio → una llamada al Servicio por PDF (1 página, profundidad 0), marcada #documento; sin client_web_pages = no se llama', async () => {
    const w = await lista('website_content_scraper', [sitio])
    expect(w).toHaveLength(2)
    expect(w[0].body).toMatchObject({ client_id: CID, apify_function: 'website_content_scraper', dry_run: false, params: { startUrls: [{ url: 'https://x.ec/menu.pdf' }], maxCrawlPages: 1, maxCrawlDepth: 0 } })
    expect(String((w[0].body?.metadata as Record<string, unknown>).llamado_por)).toMatch(/#documento$/)
    expect((w[0].body?.metadata as Record<string, unknown>).pdf_de).toBe('https://x.ec/')
  })
  it('🔴 un sitio de página ajena (referencia/tercero) no manda a leer sus PDF', async () => {
    expect(await lista('website_content_scraper', [sitio], { rol: 'referencia' })).toHaveLength(0)
    expect(await lista('website_content_scraper', [sitio], { rol: 'competidor' })).toHaveLength(0)
  })
  it('🔴 sin bucle: una llamada que ya viene de un PDF (#documento) no pide más PDF', async () => {
    expect(await lista('website_content_scraper', [sitio], { metadata: { llamado_por: 'portero-alimentar#documento' } })).toHaveLength(0)
  })
  it('competidor: lleva su competitor_id; sin él no se llama (el Servicio lo exige)', async () => {
    const w = await lista('competitor_website_scraper', [sitio], { params: { competitor_id: 'c-1' } })
    expect(w).toHaveLength(2)
    expect(w[0].body?.params).toMatchObject({ competitor_id: 'c-1', maxCrawlPages: 1 })
    expect(await lista('competitor_website_scraper', [sitio], { params: {} })).toHaveLength(0)
  })
})

describe('3 · fotos de la ficha PROPIA de Mapas', () => {
  const ctx = { nombre: 'Náufrago', ubicacion: ['Olón', 'Ecuador'], handles: [], dominios: ['naufrago.ec'], telefonos: [], rubro: ['restaurante'] }
  const propia = { title: 'Náufrago', address: 'Olón, Santa Elena', website: 'https://naufrago.ec', placeId: 'P1', url: 'https://maps.google.com/?cid=1', imageUrl: 'https://lh3.example.com/a=w1', imageUrls: ['https://lh3.example.com/a=w1', 'https://lh3.example.com/b', { imageUrl: 'https://lh3.example.com/c' }, 'javascript:alert(1)', 5] }
  const homonimo = { title: 'Naufrago', address: 'Gualaceo, Azuay', placeId: 'P2', imageUrl: 'https://lh3.example.com/ajena', imageUrls: ['https://lh3.example.com/ajena2'] }
  const JPG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4])
  const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4])
  function red(opciones: { bajan?: Record<string, Buffer | number>; previas?: Array<{ post_id: string; estado: string }>; tablaFalla?: boolean } = {}) {
    const log: Array<{ metodo: string; url: string; body?: unknown }> = []
    const fetchImpl = async (url: string, init?: RequestInit) => {
      log.push({ metodo: init?.method ?? 'GET', url, body: init?.body })
      if (url.includes('/rest/v1/client_social_images?client_id')) return new Response(JSON.stringify(opciones.previas ?? []), { status: 200 })
      if (url.includes('/storage/v1/object/')) return new Response('{}', { status: 200 })
      if (url.includes('/rest/v1/client_social_images?on_conflict')) return new Response('', { status: opciones.tablaFalla ? 500 : 201 })
      const b = opciones.bajan?.[url]
      if (typeof b === 'number') return new Response('', { status: b })
      return new Response(new Uint8Array(b ?? JPG), { status: 200 })
    }
    return { log, fetchImpl }
  }
  const llamar = (fichasCrudas: unknown[], r: ReturnType<typeof red>, extra = {}) => copiarFotosDeMapasPropia({ clientId: CID, fichasCrudas: fichasCrudas as never, ctx, urlDeLaBase: 'https://base.example.co', llave: 'k', fetchImpl: r.fetchImpl as never, ...extra })

  it('las direcciones salen de la portada y la lista, sin repetidos, solo http(s), con tope', () => {
    expect(urlsDeFotosDeLaFicha(propia)).toEqual(['https://lh3.example.com/a=w1', 'https://lh3.example.com/b', 'https://lh3.example.com/c'])
    expect(urlsDeFotosDeLaFicha(propia, 2)).toHaveLength(2)
  })
  it('la firma decide el tipo; lo que no es imagen no se acepta', () => {
    expect(tipoPorFirma(JPG)?.ext).toBe('jpg')
    expect(tipoPorFirma(PNG)?.ext).toBe('png')
    expect(tipoPorFirma(Buffer.from('<html>'))).toBeNull()
  })
  it('🔴 ficha propia confirmada → copia sus fotos como propio / maps_foto con portada; la del homónimo NO entra aunque venga en la misma búsqueda', async () => {
    const r = red()
    const res = await llamar([homonimo, propia], r)
    expect(res).toMatchObject({ estado: 'copiadas', copiadas: 3, fallidas: [] })
    const bajadas = r.log.filter((l) => l.url.startsWith('https://lh3.example.com')).map((l) => l.url)
    expect(bajadas).toEqual(['https://lh3.example.com/a=w1', 'https://lh3.example.com/b', 'https://lh3.example.com/c'])
    expect(bajadas.some((u) => u.includes('ajena'))).toBe(false)
    const fila = JSON.parse(String(r.log.find((l) => l.url.includes('on_conflict'))?.body)) as Array<Record<string, unknown>>
    expect(fila).toHaveLength(3)
    expect(fila.every((f) => f.owner_role === 'propio' && f.tipo === 'maps_foto' && f.client_id === CID && f.estado === 'ok' && f.medio === 'imagen')).toBe(true)
    expect(fila[0].posicion).toBe('portada')
    expect(String(fila[0].url)).toContain(`/storage/v1/object/public/client-social-images/${CID}/propio/`)
    expect(fila.every((f) => Object.keys(f).every((k) => !/etiqueta|muestra|producto|toma/.test(k)))).toBe(true)
  })
  it('🔴 solo hay homónimo, o hay DOS candidatas, o ninguna → no se baja ni se guarda NADA', async () => {
    for (const [fichas, estado] of [[[homonimo], 'sin_ficha'], [[propia, { ...propia, placeId: 'P9', url: 'https://maps.google.com/?cid=9' }], 'ambigua'], [[], 'sin_ficha']] as const) {
      const r = red()
      const res = await llamar([...fichas], r)
      expect(res.estado).toBe(estado)
      expect(res.copiadas).toBe(0)
      expect(r.log).toHaveLength(0)
    }
  })
  it('lo que ya se copió no se vuelve a bajar; una foto caída o que no es imagen se declara sin tumbar las demás', async () => {
    const primera = red()
    await llamar([propia], primera)
    const hechos = (JSON.parse(String(primera.log.find((l) => l.url.includes('on_conflict'))?.body)) as Array<{ post_id: string }>).map((f) => ({ post_id: f.post_id, estado: 'ok' }))
    const segunda = red({ previas: hechos })
    const res2 = await llamar([propia], segunda)
    expect(res2).toMatchObject({ estado: 'ya_estaban', copiadas: 0, ya_estaban: 3 })
    expect(segunda.log.some((l) => l.url.startsWith('https://lh3.example.com'))).toBe(false)
    const tercera = red({ bajan: { 'https://lh3.example.com/b': 404, 'https://lh3.example.com/c': Buffer.from('<html>no') } })
    const res3 = await llamar([propia], tercera)
    expect(res3.copiadas).toBe(1)
    expect(res3.fallidas.map((f) => f.causa)).toEqual(['HTTP 404', 'no es una imagen'])
  })
  it('sin llave o sin base no escribe; si la tabla rechaza lo dice', async () => {
    expect((await llamar([propia], red(), { llave: '' })).estado).toBe('sin_base')
    expect((await llamar([propia], red({ tablaFalla: true }))).estado).toBe('sin_base')
  })
})

describe('el constructor de la parte 2', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  it('se aplica sobre el flujo que ya tiene «guardar todo»: PDF y fondos CSS en «lista», GIF en «revisar», maxImages en la ficha propia; no se aplica dos veces', async () => {
    const m = await import(pathToFileURL(join(W, 'construir-guardar-todo.mjs')).href)
    const { readFileSync } = await import('node:fs')
    const antes = JSON.parse(readFileSync(join(W, 'servicio-apify-ANTES-guardar-todo-2026-10-31.json'), 'utf8'))
    const uno = m.aplicarGuardarTodo(antes)
    const dos = m.aplicarGuardarTodo2(uno)
    const cod = (w: { nodes: Array<{ name: string; parameters: { jsCode: string } }> }, n: string) => w.nodes.find((x) => x.name === n)!.parameters.jsCode
    expect(cod(dos, 'Fotos · lista')).toContain('pdfsEnlazados(')
    expect(cod(dos, 'Fotos · lista')).toContain('#documento')
    expect(cod(dos, 'Fotos · revisar')).toContain("'47494638'")
    expect(cod(dos, 'Armar el cuerpo del raspador')).toMatch(/own_google_maps_profile[^]*maxImages: Math\.min\(Number\(\$json\.params\.maxImages\), 20\)[^]*competitor_website_scraper/)
    expect(dos.nodes).toHaveLength(uno.nodes.length)
    expect(JSON.stringify(dos.connections)).toBe(JSON.stringify(uno.connections))
    expect(() => m.aplicarGuardarTodo2(dos)).toThrow(/ya está aplicada/)
  })
})
