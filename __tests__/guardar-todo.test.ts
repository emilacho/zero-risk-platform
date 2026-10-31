/**
 * «GUARDAR TODO» (31-oct · CC-CEREBRO · firma de Emilio «todo es todo») · US$ 0, sin red.
 * De cada página de un sitio salen TODAS sus imágenes y una captura por página principal; el rol sale de la PÁGINA (regla única) y lo ajeno nunca queda como propio.
 * Corre el CÓDIGO REAL de los nodos «Fotos · lista», «Guardar lo crudo» y «Armar el cuerpo del raspador».
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const require = createRequire(import.meta.url)
const W = join(process.cwd(), 'scripts', 'worker-staging', '3lyknrP3PoS2KzUf')
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const F: any = require(join(process.cwd(), 'src', 'lib', 'fotos', 'fotos-contexto-logica.js'))
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const gt: any = await import(pathToFileURL(join(W, 'construir-guardar-todo.mjs')).href)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const servicio: any = await import(pathToFileURL(join(W, 'construir-contexto-fotos.mjs')).href)
const ANTES = JSON.parse(readFileSync(join(W, 'servicio-apify-ANTES-guardar-todo-2026-10-31.json'), 'utf8'))
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor
const CID = '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312'

const pagina = (url: string, html: string, extra: Record<string, unknown> = {}) => ({ url, html, markdown: '', metadata: { title: 'Inicio', openGraph: [] }, ...extra })

describe('fotosDeSitio (lógica pura)', () => {
  it('saca <img>, srcset (la más grande), lazy, <source>, og:image y las del markdown; resuelve relativas y deduplica', () => {
    const html = '<img src="/a.jpg" alt="Ceviche"><img data-src="b.png"><img srcset="/c-480.jpg 480w, /c-1200.jpg 1200w"><picture><source srcset="/d.webp"></picture><img src="/a.jpg">'
    const r = F.fotosDeSitio([pagina('https://naufrago.ec/menu/', html, { markdown: '![x](/m.jpg)', metadata: { title: 'Menú', openGraph: [{ property: 'og:image', content: '/og.png' }] } })], { rol: 'propio' })
    expect(r.map((f: { src: string }) => f.src)).toEqual(['https://naufrago.ec/og.png', 'https://naufrago.ec/a.jpg', 'https://naufrago.ec/menu/b.png', 'https://naufrago.ec/c-1200.jpg', 'https://naufrago.ec/d.webp', 'https://naufrago.ec/m.jpg'])
    expect(r[1]).toMatchObject({ owner_role: 'propio', handle: 'naufrago.ec', tipo: 'web_imagen', caption: 'Ceviche', post_url: 'https://naufrago.ec/menu/', medio: 'imagen', posicion: 'unica' })
  })
  it('🔴 en una página PROPIA lo servido desde otro dominio es referencia, nunca propio; el mismo dominio (y sus subdominios) sí es propio', () => {
    const r = F.fotosDeSitio([pagina('https://www.naufrago.ec/', '<img src="https://cdn.naufrago.ec/i.jpg"><img src="https://tercero.com/anuncio.jpg"><img src="https://naufrago.ec/z.jpg">')], { rol: 'propio' })
    const por = Object.fromEntries(r.map((f: { src: string; owner_role: string }) => [f.src, f.owner_role]))
    expect(por).toEqual({ 'https://cdn.naufrago.ec/i.jpg': 'propio', 'https://tercero.com/anuncio.jpg': 'referencia', 'https://naufrago.ec/z.jpg': 'propio' })
  })
  it('🔴 una página que NO es del cliente (referencia/tercero) o sin rol no deja ninguna imagen', () => {
    const p = [pagina('https://ubereats.com/x', '<img src="/a.jpg">')]
    expect(F.fotosDeSitio(p, { rol: 'referencia' })).toHaveLength(0)
    expect(F.fotosDeSitio(p, { rol: null })).toHaveLength(0)
    expect(F.fotosDeSitio(p, {})).toHaveLength(0)
  })
  it('un sitio de competidor deja imágenes con rol competidor', () => {
    const r = F.fotosDeSitio([pagina('https://rival.com/', '<img src="/r.jpg">')], { rol: 'competidor' })
    expect(r).toHaveLength(1); expect(r[0]).toMatchObject({ owner_role: 'competidor', handle: 'rival.com' })
  })
  it('captura de pantalla de las páginas principales (tope), con su enlace y tipo propio', () => {
    const ps = Array.from({ length: 12 }, (_, i) => pagina(`https://naufrago.ec/p${i}`, '', { screenshotUrl: `https://api.apify.com/v2/key-value-stores/k/records/s${i}.jpg?signature=x` }))
    const r = F.fotosDeSitio(ps, { rol: 'propio' })
    expect(r).toHaveLength(8)
    expect(r[0]).toMatchObject({ tipo: 'web_captura', owner_role: 'propio', posicion: 'portada', post_url: 'https://naufrago.ec/p0' })
    expect(new Set(r.map((f: { post_id: string }) => f.post_id)).size).toBe(8)
  })
  it('descarta lo que «Fotos · revisar» no aceptaría (svg, avif, pdf, data:) y el ruido (favicon, píxeles); lo cuenta', () => {
    const html = '<img src="/a.svg"><img src="/b.gif"><img src="/c.avif"><img src="data:image/png;base64,AAA"><img src="/favicon.ico"><img src="https://www.facebook.com/tr?id=1"><img src="/ok.jpg?v=2">'
    const r = F.fotosDeSitio([pagina('https://naufrago.ec/', html)], { rol: 'propio' })
    expect(r.map((f: { src: string }) => f.src)).toEqual(['https://naufrago.ec/b.gif', 'https://naufrago.ec/ok.jpg?v=2'])
    expect(r.descartadas.formato).toBeGreaterThanOrEqual(2)
  })
  it('tope por llamada y entradas basura no rompen', () => {
    const html = Array.from({ length: 200 }, (_, i) => `<img src="/i${i}.jpg">`).join('')
    expect(F.fotosDeSitio([pagina('https://naufrago.ec/', html)], { rol: 'propio', tope: 30 })).toHaveLength(30)
    expect(F.fotosDeSitio([null, 'x', {}, { url: 'no-es-url', html: '<img src=/a.jpg>' }], { rol: 'propio' })).toHaveLength(0)
    expect(F.fotosDeSitio(undefined, { rol: 'propio' })).toHaveLength(0)
  })
  it('lo que sale cumple las reglas de la tabla (medio y posición) y la clave única no se repite', () => {
    const r = F.fotosDeSitio([pagina('https://naufrago.ec/', '<img src="/a.jpg"><img src="/b.jpg">', { screenshotUrl: 'https://api.apify.com/s.jpg' }), pagina('https://naufrago.ec/x', '<img src="/a.jpg"><img src="/c.jpg">')], { rol: 'propio' })
    for (const f of r) { expect(['imagen', 'video', 'reel', 'logo']).toContain(f.medio); expect(f.posicion === 'unica' || f.posicion === 'portada').toBe(true) }
    expect(new Set(r.map((f: { owner_role: string; handle: string; post_id: string }) => `${f.owner_role}|${f.handle}|${f.post_id}`)).size).toBe(r.length)
  })
  it('baseDeHost: com.ec y co.uk conservan tres etiquetas', () => {
    expect(F.baseDeHost('cdn.tienda.com.ec')).toBe('tienda.com.ec'); expect(F.baseDeHost('www.a.co.uk')).toBe('a.co.uk'); expect(F.baseDeHost('x.naufrago.ec')).toBe('naufrago.ec')
  })
})

/** corre el código real de «Fotos · lista» */
async function lista(fn: string, crudos: unknown[], o: { filaPagina?: unknown; inicio?: string | null } = {}) {
  const items = crudos.map((json) => ({ json }))
  const pedidos: string[] = []
  const refs: Record<string, unknown> = {
    'Validar el cuerpo contra el esquema': { apify_function: fn, dry_run: false, client_id: CID, metadata: {}, cuerpo: {}, params: {} },
    'Armar el cuerpo del raspador': { cuerpo: { startUrls: o.inicio === null ? [] : [{ url: o.inicio ?? 'https://www.naufrago.ec' }] } },
  }
  const $ = (n: string) => {
    if (n === 'Merge · apify data ready') return { all: () => items, first: () => items[0] }
    if (!(n in refs)) throw new Error('nodo no ejecutado: ' + n)
    return { first: () => ({ json: refs[n] }), all: () => [{ json: refs[n] }] }
  }
  const out = await new AsyncFunction('$input', '$', '$env', '$json', '$workflow', '$execution', servicio.codigoDeNodo('lista'))
    .call({ helpers: { httpRequest: async (r: { url: string }) => { pedidos.push(r.url); return o.filaPagina ?? [] } } }, { first: () => items[0], all: () => items }, $, { SUPABASE_SERVICE_ROLE_KEY: 'k' }, {}, { id: 'WF' }, { id: '1' })
  return { filas: (out as Array<{ json: Record<string, unknown> }>).map((x) => x.json), pedidos }
}

describe('«Fotos · lista» con el código real · sitios', () => {
  const sitio = pagina('https://www.naufrago.ec/', '<img src="/ilustracion-1.jpg"><img src="https://otro.com/x.jpg">', { screenshotUrl: 'https://api.apify.com/s.jpg' })
  it('sitio propio cuya página la base rotuló «propio» → imágenes propias + captura; lo ajeno, referencia; con client_id', async () => {
    const r = await lista('website_content_scraper', [sitio], { filaPagina: [{ owner_role: 'propio' }] })
    expect(r.pedidos[0]).toContain('client_web_pages?client_id=eq.' + CID + '&url=eq.' + encodeURIComponent('https://www.naufrago.ec'))
    const por = Object.fromEntries(r.filas.map((f) => [String(f.src), f.owner_role]))
    expect(por).toEqual({ 'https://api.apify.com/s.jpg': 'propio', 'https://www.naufrago.ec/ilustracion-1.jpg': 'propio', 'https://otro.com/x.jpg': 'referencia' })
    expect(r.filas.every((f) => f.client_id === CID)).toBe(true)
  })
  it('🔴 «ninguna página ajena entra como propia»: página rotulada referencia/competidor, fila ausente o lectura caída → 0 imágenes', async () => {
    expect((await lista('website_content_scraper', [sitio], { filaPagina: [{ owner_role: 'referencia' }] })).filas).toEqual([])
    expect((await lista('website_content_scraper', [sitio], { filaPagina: [{ owner_role: 'competidor' }] })).filas).toEqual([])
    expect((await lista('website_content_scraper', [sitio], { filaPagina: [] })).filas).toEqual([])
    expect((await lista('website_content_scraper', [sitio], { filaPagina: { message: 'caída' } })).filas).toEqual([])
    expect((await lista('website_content_scraper', [sitio], { inicio: null })).filas).toEqual([])
  })
  it('sitio de competidor → competidor, sin consultar la base', async () => {
    const r = await lista('competitor_website_scraper', [pagina('https://rival.com/', '<img src="/a.jpg"><img src="/b.jpg">')])
    expect(r.filas.map((f) => f.owner_role)).toEqual(['competidor', 'competidor']); expect(r.pedidos).toEqual([])
  })
})

describe('«Guardar lo crudo» con el código real · enlaces a documentos y videos', () => {
  const nuevo = gt.aplicarGuardarTodo(ANTES)
  const expr = (nuevo.nodes.find((n: { name: string }) => n.name === 'Guardar lo crudo').parameters.jsonBody as string).replace(/^=\{\{/, '').replace(/\}\}\s*$/, '')
  const correr = (fn: string, items: unknown[]) => {
    const ctx = { apify_function: fn, client_id: CID, params: {}, dry_run: false, metadata: {} }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const f: any = new Function('$', '$items', `return ${expr}`)
    return JSON.parse(f(() => ({ first: () => ({ json: ctx }) }), () => items.map((json) => ({ json }))))
  }
  it('una web deja `_enlaces` (PDF y videos, relativos resueltos) y NO deja el HTML', () => {
    const j = correr('website_content_scraper', [{ url: 'https://s.ec/a/b', markdown: 'x [Menú](/carta.pdf) [v](https://youtu.be/abc)', html: '<a href="menu2.pdf">Carta <b>2</b></a><iframe src="https://www.youtube.com/embed/zz"></iframe><a href="/x">no</a>', text: 't', debug: {} }])
    expect(j.respuesta[0].html).toBeUndefined(); expect(j.respuesta[0].debug).toBeUndefined(); expect(j.respuesta[0].text).toBe('t')
    expect(j.respuesta[0]._enlaces.documentos.map((d: { url: string }) => d.url).sort()).toEqual(['https://s.ec/a/menu2.pdf', 'https://s.ec/carta.pdf'])
    expect(j.respuesta[0]._enlaces.videos.map((d: { url: string }) => d.url).sort()).toEqual(['https://www.youtube.com/embed/zz', 'https://youtu.be/abc'])
  })
  it('las otras funciones quedan IGUAL y con el límite de siempre; una web grande ya no se trunca a 200 KB', () => {
    expect(correr('instagram_scraper', [{ a: 1 }]).respuesta).toEqual([{ a: 1 }])
    const grande = Array.from({ length: 60 }, (_, i) => ({ url: `https://s.ec/${i}`, text: 'x'.repeat(10000), markdown: '' }))
    expect(correr('website_content_scraper', grande).truncado).toBe(false)
    expect(correr('instagram_scraper', Array.from({ length: 30 }, () => ({ t: 'x'.repeat(10000) }))).truncado).toBe(true)
  })
})

describe('el constructor del flujo', () => {
  const nuevo = gt.aplicarGuardarTodo(ANTES)
  const cuerpo = (w: { nodes: Array<{ name: string; parameters: { jsCode: string } }> }) => w.nodes.find((n) => n.name === 'Armar el cuerpo del raspador')!.parameters.jsCode
  it('cambia SOLO los 7 nodos previstos; mismas conexiones y mismos nodos', () => {
    const cambiados = nuevo.nodes.filter((n: { name: string }, i: number) => JSON.stringify(n) !== JSON.stringify(ANTES.nodes[i])).map((n: { name: string }) => n.name).sort()
    expect(cambiados).toEqual(['Armar el cuerpo del raspador', 'Fotos · anotar', 'Fotos · lista', 'Fotos · revisar', 'Guardar la página', 'Guardar lo crudo', 'apify-web'].sort())
    expect(nuevo.connections).toEqual(ANTES.connections); expect(nuevo.nodes.length).toBe(ANTES.nodes.length)
  })
  it('sitio propio hasta 200 páginas y competidor hasta 50, cada uno en SU función; con mapa del sitio, HTML y captura', () => {
    const c = cuerpo(nuevo); const iComp = c.indexOf('competitor_website_scraper: ($json)')
    expect(c.slice(c.indexOf('website_content_scraper: ($json)'), iComp)).toContain('|| 10, 200)')
    expect(c.slice(iComp, iComp + 1500)).toContain('|| 10, 50)')
    expect((c.match(/saveScreenshots: true/g) || []).length).toBe(2); expect((c.match(/saveHtml: true/g) || []).length).toBe(2); expect((c.match(/useSitemaps: true/g) || []).length).toBe(2)
  })
  it('🔴 el cuerpo nuevo lo acepta el esquema congelado del Servicio (ninguna perilla desconocida)', () => {
    const val = nuevo.nodes.find((n: { name: string }) => n.name === 'Validar el cuerpo contra el esquema').parameters.jsCode as string
    const ini = val.indexOf('const ESQUEMAS = ') + 'const ESQUEMAS = '.length
    const linea = val.slice(ini, val.indexOf('\n', ini))
    const esquemas = JSON.parse(linea.slice(0, linea.lastIndexOf('}') + 1))
    for (const fn of ['website_content_scraper', 'competitor_website_scraper']) for (const k of ['maxCrawlPages', 'maxCrawlDepth', 'useSitemaps', 'saveHtml', 'saveScreenshots', 'htmlTransformer', 'saveMarkdown']) expect(esquemas[fn].acepta).toContain(k)
  })
  it('la espera sube a 290 s y el texto de la página a 1.000.000; se niega a aplicarse dos veces', () => {
    expect(nuevo.nodes.find((n: { name: string }) => n.name === 'apify-web').parameters.url).toContain('?timeout=290')
    expect(nuevo.nodes.find((n: { name: string }) => n.name === 'Guardar la página').parameters.jsonBody).toContain('.slice(0, 1000000)')
    expect(() => gt.aplicarGuardarTodo(nuevo)).toThrow()
  })
})

describe('«Fotos · anotar» con el código real · una imagen caída no tumba la corrida', () => {
  async function anotar(metas: Array<Record<string, unknown>>, subidas: unknown[]) {
    const filasEscritas: Array<Record<string, unknown>> = []
    const $ = (n: string) => { if (n === 'Fotos · revisar') return { all: () => metas.map((json) => ({ json })) }; throw new Error(n) }
    const f = new AsyncFunction('$input', '$', '$env', '$json', '$workflow', '$execution', servicio.codigoDeNodo('anotar'))
    return f.call({ helpers: { httpRequest: async (r: { method: string; body?: Array<Record<string, unknown>> }) => { if (r.method === 'POST') { filasEscritas.push(...(r.body ?? [])); return { statusCode: 201, body: '' } } return { statusCode: 200, body: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2]) } } } },
      { all: () => subidas.map((json) => ({ json })) }, $, { SUPABASE_SERVICE_ROLE_KEY: 'k' }, {}, { id: 'WF' }, { id: '1' }).then((out: unknown) => ({ out, filasEscritas }))
  }
  const buena = { client_id: CID, owner_role: 'propio', handle: 'x.ec', post_id: 'captura-1', tipo: 'web_captura', path: 'p.jpg', bytes: 6, magic: 'ffd8ffe0' }
  it('un 404 de una imagen de sitio o de Mapas se declara (fila no_bajo) y la corrida sigue', async () => {
    const caida = { client_id: CID, owner_role: 'propio', handle: 'x.ec', post_id: 'web-1', tipo: 'web_imagen', estado: 'no_bajo', causa: 'HTTP 404 · x.ec' }
    const r = await anotar([{ ...buena, _fallas: [caida], _total: 2 }], [{ statusCode: 200 }])
    expect(r.filasEscritas).toHaveLength(1)
    expect(JSON.stringify(r.out)).toContain('"copia_fotos":"ok"')
  })
  it('🔴 lo demás sigue siendo falla: un 500, un error de red o un 404 de Instagram siguen tumbando la corrida', async () => {
    for (const c of [{ tipo: 'web_imagen', causa: 'HTTP 500 · x.ec' }, { tipo: 'web_imagen', causa: 'red · timeout' }, { tipo: 'post', causa: 'HTTP 404 · cdn' }]) {
      await expect(anotar([{ ...buena, _fallas: [{ ...c, handle: 'h', post_id: 'p' }], _total: 2 }], [{ statusCode: 200 }])).rejects.toThrow(/FOTOS_NO_BAJARON/)
    }
  })
})
