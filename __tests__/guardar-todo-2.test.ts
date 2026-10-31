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
import { pdfsDeLasFilas, leerDocumentosDeLosSitios } from '../src/lib/portero-alimenta/documentos-enlazados'

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

describe('2 · PDF que el sitio enlaza · lectura del portero', () => {
  const ahora = new Date('2026-10-31T15:00:00Z')
  const pag = (url: string, docs: Array<{ url: string; texto?: string }>) => ({ url, text: 'x', _enlaces: { documentos: docs, videos: [] } })
  const fila = (id: string, fn: string, respuesta: unknown[], extra: Record<string, unknown> = {}) => ({ id, apify_function: fn, respuesta, ensayo: false, created_at: '2026-10-31T10:00:00Z', ...extra }) as never
  const PDF = Buffer.from('%PDF-1.4 falso')
  const traerPdf = (log: string[] = [], estado = 200) => async (u: string) => { log.push(u); return new Response(new Uint8Array(PDF), { status: estado }) }
  const lectorOk = (texto = 'Ceviche mixto US$ 12,50') => async () => ({ estado: 'ok', texto, paginas: 2, motivo: undefined }) as never

  it('elige solo PDF del MISMO dominio base, sin repetidos y con tope; el competidor sin competitor_id no cuenta', () => {
    const filas = [
      fila('f1', 'website_content_scraper', [pag('https://www.x.ec/carta', [{ url: 'https://x.ec/menu.pdf', texto: 'Menú' }, { url: 'https://cdn.x.ec/lista.PDF?v=2' }, { url: 'https://tercero.com/ajeno.pdf' }, { url: 'https://x.ec/menu.pdf#p2' }, { url: 'https://x.ec/foto.jpg' }])]),
      fila('f2', 'competitor_website_scraper', [pag('https://rival.ec/', [{ url: 'https://rival.ec/cat.pdf' }])], { params: { competitor_id: 'c-1' } }),
      fila('f3', 'competitor_website_scraper', [pag('https://otro.ec/', [{ url: 'https://otro.ec/z.pdf' }])], { params: {} }),
    ]
    const r = pdfsDeLasFilas(filas, 10)
    expect(r.map((d) => [d.url, d.rol, d.competitor_id])).toEqual([['https://x.ec/menu.pdf', 'propio', null], ['https://cdn.x.ec/lista.PDF?v=2', 'propio', null], ['https://rival.ec/cat.pdf', 'competidor', 'c-1']])
    expect(r[0]).toMatchObject({ nombre: 'Menú', pagina: 'https://www.x.ec/carta', fila_id: 'f1' })
    expect(pdfsDeLasFilas(filas, 1)).toHaveLength(1)
  })
  it('🔴 un ensayo y la tanda de artículos no aportan PDF', () => {
    const p = [pag('https://x.ec/', [{ url: 'https://x.ec/a.pdf' }])]
    expect(pdfsDeLasFilas([fila('e', 'website_content_scraper', p, { ensayo: true })])).toHaveLength(0)
    expect(pdfsDeLasFilas([fila('a', 'website_content_scraper', p, { metadata: { llamado_por: 'wf#articulo' } })])).toHaveLength(0)
  })
  it('sitio propio: el texto del PDF vuelve como una página más del sitio (con el id de la fila que lo enlazó); nada se guarda en tablas', async () => {
    const log: string[] = []
    const r = await leerDocumentosDeLosSitios({ filas: [fila('f1', 'website_content_scraper', [pag('https://x.ec/carta', [{ url: 'https://x.ec/menu.pdf', texto: 'Menú' }])])], ahora, fetchImpl: traerPdf(log) as never, leer: lectorOk() })
    expect(r).toMatchObject({ candidatos: 1, leidos: 1, del_sitio: 1, de_competidores: 0, fallidos: [] })
    expect(log).toEqual(['https://x.ec/menu.pdf'])
    expect(r.filas[0]).toMatchObject({ id: 'f1', apify_function: 'website_content_scraper', ensayo: false })
    expect((r.filas[0].respuesta as Array<Record<string, unknown>>)[0]).toMatchObject({ url: 'https://x.ec/menu.pdf', text: 'Ceviche mixto US$ 12,50' })
  })
  it('🔴 competidor: se guarda COMO COMPETIDOR con su competitor_id y NO vuelve a las fichas del cliente', async () => {
    const guardadas: Array<Record<string, unknown>> = []
    const r = await leerDocumentosDeLosSitios({ filas: [fila('f2', 'competitor_website_scraper', [pag('https://rival.ec/', [{ url: 'https://rival.ec/cat.pdf' }])], { params: { competitor_id: 'c-1' } })], ahora, fetchImpl: traerPdf() as never, leer: lectorOk('Catálogo rival'), guardarDePagina: async (p) => { guardadas.push(p); return true } })
    expect(r).toMatchObject({ leidos: 1, del_sitio: 0, de_competidores: 1 })
    expect(r.filas).toHaveLength(0)
    expect(guardadas).toEqual([{ url: 'https://rival.ec/cat.pdf', titulo: 'cat.pdf', texto: 'Catálogo rival', paginas: 2, competitor_id: 'c-1' }])
  })
  it('lo que no se puede leer se DECLARA y no tumba nada: HTTP 404, PDF escaneado, tabla que rechaza', async () => {
    const filas = [fila('f1', 'website_content_scraper', [pag('https://x.ec/', [{ url: 'https://x.ec/a.pdf' }, { url: 'https://x.ec/b.pdf' }])])]
    const r404 = await leerDocumentosDeLosSitios({ filas, ahora, fetchImpl: traerPdf([], 404) as never, leer: lectorOk() })
    expect(r404.fallidos.map((f) => f.causa)).toEqual(['HTTP 404', 'HTTP 404'])
    const esc = await leerDocumentosDeLosSitios({ filas, ahora, fetchImpl: traerPdf() as never, leer: (async () => ({ estado: 'escaneado', texto: '', motivo: 'sin texto' })) as never })
    expect(esc.leidos).toBe(0)
    expect(esc.fallidos[0].causa).toMatch(/^escaneado/)
    const comp = [fila('f2', 'competitor_website_scraper', [pag('https://rival.ec/', [{ url: 'https://rival.ec/cat.pdf' }])], { params: { competitor_id: 'c-1' } })]
    const rech = await leerDocumentosDeLosSitios({ filas: comp, ahora, fetchImpl: traerPdf() as never, leer: lectorOk(), guardarDePagina: async () => false })
    expect(rech).toMatchObject({ leidos: 0, de_competidores: 0 })
    expect(rech.fallidos[0].causa).toMatch(/rechaz/)
  })
  it('🔴 el texto de un PDF del sitio propio produce unidades de la fuente «sitio» con el PDF como origen; si el sitio es otro, ninguna', async () => {
    const { unidadesDeRaspados } = await import('../src/lib/portero-alimenta/unidades')
    const r = await leerDocumentosDeLosSitios({ filas: [fila('f1', 'website_content_scraper', [pag('https://x.ec/carta', [{ url: 'https://x.ec/menu.pdf' }])])], ahora, fetchImpl: traerPdf() as never, leer: lectorOk('Ceviche mixto US$ 12,50\nHorario: lunes a viernes 10:00 a 18:00') })
    const us = unidadesDeRaspados(r.filas, { propios: { sitio: 'https://x.ec', handles: [] } })
    expect(us.length).toBeGreaterThan(0)
    expect(us.every((u) => u.fuente === 'sitio' && u.url === 'https://x.ec/menu.pdf')).toBe(true)
    expect(unidadesDeRaspados(r.filas, { propios: { sitio: 'https://otro.com', handles: [] } })).toHaveLength(0)
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
  it('la misma ficha en varias corridas junta las fotos de todas; la de otra ficha nunca se mezcla', async () => {
    const vieja = { ...propia, imageUrl: 'https://lh3.example.com/v1', imageUrls: [] }
    const r = red()
    await llamar([vieja, homonimo, propia], r)
    const bajadas = r.log.filter((l) => l.url.startsWith('https://lh3.example.com')).map((l) => l.url)
    expect(bajadas).toEqual(['https://lh3.example.com/v1', 'https://lh3.example.com/a=w1', 'https://lh3.example.com/b', 'https://lh3.example.com/c'])
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
    expect(cod(dos, 'Fotos · lista')).toContain('fotosDeSitio(')
    expect(cod(dos, 'Fotos · revisar')).toContain("'47494638'")
    expect(cod(dos, 'Armar el cuerpo del raspador')).toMatch(/own_google_maps_profile[^]*maxImages: Math\.min\(Number\(\$json\.params\.maxImages\), 20\)[^]*competitor_website_scraper/)
    expect(dos.nodes).toHaveLength(uno.nodes.length)
    expect(JSON.stringify(dos.connections)).toBe(JSON.stringify(uno.connections))
    expect(() => m.aplicarGuardarTodo2(dos)).toThrow(/ya está aplicada/)
  })
})
