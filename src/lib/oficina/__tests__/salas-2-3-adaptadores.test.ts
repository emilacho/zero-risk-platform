import { describe, expect, it } from 'vitest'
import { crearPuertos, marcaDelCliente, MEDIDAS_DE_PLATAFORMA, PREFIJO_DRY, type Entorno } from '../adaptadores'
import { leerMedidas } from '../entrega'
import { abrirEncargo } from '../orquestador'
import { CARRUSEL_IG_V1 } from '../plantillas/carrusel-ig-v1'
import { KIT_HISTORIAS } from '../plantillas/kit-historias'
import { TARGET_STEP_PRODUCIR } from '../sobre'
import { DbFalsa } from './dbfalsa'
import { CLIENTE, FICHAS_VACIAS, FOTOS, PARTE, correr, png, type Guion, type Memoria } from './memoria'

const ENV: Entorno = { baseUrl: 'https://app.test', internalKey: 'k-interna', openaiKey: 'sk-test', revisorModelo: 'modelo-revisor', slackToken: 'xoxb-test', bucket: 'oficina-test' }
const j = (x: unknown) => JSON.stringify(x)

const BRIEF = `### BRF-0100 · Instagram · carrusel
- QUÉ ES: Carrusel de 5 láminas
- PROTAGONISTA: El plato del día.
- LÍMITES: 4:5
- APRUEBA Y PARA CUÁNDO: Antes del 14 de octubre de 2026.
`
const PARTE_TXT = `# PARTE\n\n## Entregables\n\n${BRIEF}\n### BRF-9999 · Instagram · imagen\n- QUÉ ES: otro\n`

function sembrar(o: { colores?: unknown; slug?: string | null } = {}): DbFalsa {
  const db = new DbFalsa()
  db.semilla('clients', [{ id: CLIENTE, name: 'Cliente de práctica', country: 'Ecuador', slug: o.slug === undefined ? 'cliente-de-practica' : o.slug, logo_url: 'https://logo.test/l.png', website_url: 'https://www.cliente.test', config: { apify: { own_handles: { instagram: 'mi.marca' } }, zona_horaria: 'America/Guayaquil' } }])
  db.semilla('client_brand_books', [{ client_id: CLIENTE, version: 1, voice_description: 'Tutea siempre, nunca vos.', forbidden_words: ['premium'], typography: ['Caveat', 'Inter'], primary_colors: o.colores ?? ['#112233', '#445566', '#778899'] }])
  db.semilla('client_social_images', FOTOS.map((f) => ({ ...f, client_id: CLIENTE })))
  db.semilla('client_sede_datos', [])
  db.semilla('client_web_pages', [])
  db.semilla('client_historical_outputs', [{ id: PARTE, client_id: CLIENTE, output_type: 'campaign_brief_pack', content: PARTE_TXT }])
  db.semilla('oficina_config', [{ id: 1, estado: 'encendida', familias_activas: ['carrusel_ig_v1', 'kit_historias'], clientes_ensayo: [] }])
  db.semilla('oficina_tipos_de_grupo', [CARRUSEL_IG_V1, KIT_HISTORIAS].map((p) => ({ tipo: p.tipo, familia: p.familia, pasos: p.pasos, indicaciones: p.indicaciones, limites: p.limites, activo: true })))
  db.semilla('oficina_entrega_formatos', [{ red: 'instagram', formato: 'carrusel', ancho: 1080, alto: 1350, ratio: '4:5', tipos_archivo: ['png', 'jpeg'], peso_max_mb: 8, n_min: 2, n_max: 10, texto_max: 2200, hashtags_max: 30, pasos_publicacion: ['Descargar', 'Pegar', 'Programar'], verificado: false }])
  return db
}

interface Llamada { url: string; init?: RequestInit }
function fetchFalso(o: { render?: 'ok' | 'error' | 'sin_urls' } = {}): { f: typeof fetch; llamadas: Llamada[] } {
  const llamadas: Llamada[] = []
  const f = (async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url)
    llamadas.push({ url: u, init })
    const json = (x: unknown, status = 200) => new Response(JSON.stringify(x), { status, headers: { 'content-type': 'application/json' } })
    if (u.endsWith('/api/carousel/generate')) {
      if (o.render === 'error') return json({ error: 'render_failed', detail: 'se cayó' }, 500)
      if (o.render === 'sin_urls') return json({ carousel_id: 'x' })
      const body = JSON.parse(String(init!.body)) as { slides: unknown[]; subcarpeta?: string; platform: string }
      const m = MEDIDAS_DE_PLATAFORMA[body.platform]
      return json({ carousel_id: 'cars-1', platform: body.platform, width: m.ancho, height: m.alto, slide_urls: body.slides.map((_, i) => `https://bucket.test/${body.subcarpeta}/slide-${i + 1}-${m.ancho}x${m.alto}.png`), fonts_usadas: ['Caveat', 'Inter'], fonts_faltantes: ['Homemade Apple'], timings_ms: body.slides.map(() => 90) })
    }
    if (u.startsWith('https://api.openai.com')) return json({ output_text: '', usage: { input_tokens: 1000, output_tokens: 200 } })
    if (u.startsWith('https://slack.com')) return json({ ok: true, ts: `171.${llamadas.length}` })
    if (u.startsWith('https://bucket.test/') || u.startsWith('https://fotos.test/')) { const q = /-(\d+)x(\d+)\.png$/.exec(u); return new Response(new Uint8Array(png(q ? Number(q[1]) : 1024, q ? Number(q[2]) : 1024)), { status: 200 }) }
    return json({}, 404)
  }) as typeof fetch
  return { f, llamadas }
}

describe('la identidad visual del cliente para dibujar láminas', () => {
  const cliente = { logo_url: 'https://logo.test/l.png', brand_colors: [{ hex: '#abcdef' }], brand_fonts: ['Bebas Neue'] }
  it('del manual: colores (hasta 3), tipografías (hasta 2), logo y usuario', () => {
    const m = marcaDelCliente({ primary_colors: ['#112233', '#445566', '#778899', '#000000'], typography: ['Caveat', 'Inter', 'Otra'] }, cliente, ['@mi.marca'])
    expect(m).toEqual({ colors: { primary: '#112233', secondary: '#445566', accent: '#778899' }, fonts: { family: 'Caveat', headline_family: 'Inter' }, logo_url: 'https://logo.test/l.png', brand_handle: '@mi.marca' })
  })
  it('si el manual no trae colores, usa los de la ficha del cliente (objetos con hex)', () => {
    const m = marcaDelCliente({}, cliente, [])
    expect(m?.colors.primary).toBe('#abcdef'); expect(m?.fonts.family).toBe('Bebas Neue')
  })
  it('un color que no es hexadecimal NO se acepta, y sin ningún color válido no se inventa una paleta (null)', () => {
    expect(marcaDelCliente({ primary_colors: ['rojo', 'url(x)', '#12'] }, {}, [])).toBeNull()
    expect(marcaDelCliente({ primary_colors: ['rojo', '#00ff00'] }, {}, [])?.colors.primary).toBe('#00ff00')
  })
  it('sin tipografía declarada, Inter (declarada, no silenciosa: el brazo devuelve cuáles usó)', () => {
    expect(marcaDelCliente({ primary_colors: ['#112233'] }, {}, [])?.fonts.family).toBe('Inter')
  })
  it('las fuentes del cliente traen su carpeta (slug) y su marca; la ficha previa sin slug deja slug null', async () => {
    const P = crearPuertos(sembrar(), ENV, fetchFalso().f)
    const fu = await P.fuentes(CLIENTE)
    expect('error' in fu).toBe(false)
    if (!('error' in fu)) { expect(fu.slug).toBe('cliente-de-practica'); expect(fu.marca?.colors.primary).toBe('#112233'); expect(fu.propios.urls).toEqual(['https://www.cliente.test']) }
    const P2 = crearPuertos(sembrar({ slug: null }), ENV, fetchFalso().f)
    const fu2 = await P2.fuentes(CLIENTE)
    if (!('error' in fu2)) expect(fu2.slug).toBeNull()
  })
})

describe('el brazo que dibuja láminas (puerto renderLaminas)', () => {
  const pedido = (o: Record<string, unknown> = {}) => ({ client_id: CLIENTE, encargo_id: 'enc-1', plataforma: 'instagram-feed', marca: { colors: { primary: '#112233' }, fonts: { family: 'Inter' } }, slug: 'cliente-de-practica', slides: [{ headline: 'A' }, { headline: 'B' }], subcarpeta: 'oficina/enc-1', dry_run: false, ...o })
  it('dry_run: NO llama al brazo ni al bucket; devuelve direcciones de simulacro con la medida de la plataforma', async () => {
    const { f, llamadas } = fetchFalso()
    const r = await crearPuertos(sembrar(), ENV, f).renderLaminas(pedido({ dry_run: true }) as never)
    expect(llamadas.filter((x) => !x.url.startsWith('https://slack.com'))).toEqual([])
    expect(r).toMatchObject({ ok: true, ancho: 1080, alto: 1350 })
    if (r.ok) { expect(r.urls).toHaveLength(2); expect(r.urls.every((u) => u.startsWith(PREFIJO_DRY))).toBe(true) }
  })
  it('real: POST a /api/carousel/generate con la llave interna, la plataforma, la marca, las láminas y la subcarpeta de la oficina', async () => {
    const { f, llamadas } = fetchFalso()
    const r = await crearPuertos(sembrar(), ENV, f).renderLaminas(pedido() as never)
    expect(llamadas).toHaveLength(1)
    expect(llamadas[0].url).toBe('https://app.test/api/carousel/generate')
    expect((llamadas[0].init!.headers as Record<string, string>)['x-api-key']).toBe('k-interna')
    expect(JSON.parse(String(llamadas[0].init!.body))).toEqual({ client_slug: 'cliente-de-practica', platform: 'instagram-feed', brand: { colors: { primary: '#112233' }, fonts: { family: 'Inter' } }, slides: [{ headline: 'A' }, { headline: 'B' }], subcarpeta: 'oficina/enc-1' })
    expect(r).toMatchObject({ ok: true, ancho: 1080, alto: 1350, fonts_usadas: ['Caveat', 'Inter'], fonts_faltantes: ['Homemade Apple'] })
  })
  it('un error del brazo, una respuesta sin direcciones o una plataforma desconocida no revientan: dicen qué pasó', async () => {
    expect(await crearPuertos(sembrar(), ENV, fetchFalso({ render: 'error' }).f).renderLaminas(pedido() as never)).toEqual({ ok: false, error: 'se cayó' })
    expect(await crearPuertos(sembrar(), ENV, fetchFalso({ render: 'sin_urls' }).f).renderLaminas(pedido() as never)).toMatchObject({ ok: false })
    expect(await crearPuertos(sembrar(), ENV, fetchFalso().f).renderLaminas(pedido({ plataforma: 'myspace' }) as never)).toMatchObject({ ok: false, error: expect.stringMatching(/desconocida/) })
  })
  it('una lámina de simulacro se descarga con SU medida (la entrega mide el archivo, no lo que dice el nombre)', async () => {
    const P = crearPuertos(sembrar(), ENV, fetchFalso().f)
    const r = await P.renderLaminas(pedido({ dry_run: true }) as never)
    if (!r.ok) throw new Error('no debía fallar')
    const b = await P.descargar(r.urls[0])
    expect(leerMedidas(b!)).toMatchObject({ ancho: 1080, alto: 1350 })
  })
})

describe('frontera: la oficina NO escribe en el bucket de la web del cliente', () => {
  const sinBucket: Entorno = { ...ENV, bucket: undefined }
  it('sin OFICINA_BUCKET la entrega no se guarda (falla visible) y nunca cae en «client-websites»', async () => {
    const db = sembrar()
    const r = await crearPuertos(db, sinBucket, fetchFalso().f).guardarArchivos('oficina/c/e', [{ nombre: 'a.png', bytes: png(10, 10), tipo: 'image/png' }])
    expect(r).toMatchObject({ ok: false, error: expect.stringMatching(/OFICINA_BUCKET/) })
    expect(Object.keys(db.archivos)).toEqual([])
  })
  it('con OFICINA_BUCKET, guarda en ESE bucket', async () => {
    const db = sembrar()
    const r = await crearPuertos(db, { ...ENV, bucket: 'oficina-creativos' }, fetchFalso().f).guardarArchivos('oficina/c/e', [{ nombre: 'a.png', bytes: png(10, 10), tipo: 'image/png' }])
    expect(r.ok).toBe(true); expect([...db.bucketsUsados]).toEqual(['oficina-creativos'])
  })
  it('el brazo de láminas tampoco: sin bucket no se llama (antes de gastar), y en dry_run no hace falta', async () => {
    const { f, llamadas } = fetchFalso()
    const p = { client_id: CLIENTE, encargo_id: 'e', plataforma: 'instagram-feed', marca: { colors: { primary: '#112233' }, fonts: { family: 'Inter' } }, slug: 's', slides: [{ headline: 'A' }], subcarpeta: 'oficina/e' }
    expect(await crearPuertos(sembrar(), sinBucket, f).renderLaminas({ ...p, dry_run: false } as never)).toMatchObject({ ok: false, error: expect.stringMatching(/OFICINA_BUCKET/) })
    expect(llamadas).toEqual([])
    expect((await crearPuertos(sembrar(), sinBucket, f).renderLaminas({ ...p, dry_run: true } as never)).ok).toBe(true)
  })
  it('la ruta lee OFICINA_BUCKET del entorno y no tiene ningún «client-websites» escrito', () => {
    const fs = require('node:fs') as typeof import('node:fs'), path = require('node:path') as typeof import('node:path')
    const dir = path.join(process.cwd(), 'src/lib/oficina')
    expect(fs.readFileSync(path.join(dir, 'ruta.ts'), 'utf8')).toMatch(/process\.env\.OFICINA_BUCKET/)
    for (const a of ['adaptadores.ts', 'ruta.ts', 'orquestador-laminas.ts', 'orquestador.ts']) expect(fs.readFileSync(path.join(dir, a), 'utf8').replace(/\/\/.*$/gm, '')).not.toMatch(/['"`]client-websites['"`]/)
  })
})

describe('el revisor ciego con varias imágenes', () => {
  it('manda TODAS las imágenes como entrada de imagen, en el mismo mensaje', async () => {
    const { f, llamadas } = fetchFalso()
    const r = await crearPuertos(sembrar(), ENV, f).revisor({ texto: 'x', dry_run: false, imagenes_urls: ['https://a.test/1.png', 'https://a.test/2.png', 'https://a.test/3.png'] })
    expect(r).toMatchObject({ ok: true })
    const cuerpo = JSON.parse(String(llamadas[0].init!.body))
    expect(cuerpo.input[0].content.filter((c: { type: string }) => c.type === 'input_image').map((c: { image_url: string }) => c.image_url)).toEqual(['https://a.test/1.png', 'https://a.test/2.png', 'https://a.test/3.png'])
  })
  it('con la imagen sola de siempre (sala 1) sigue mandando una', async () => {
    const { f, llamadas } = fetchFalso()
    await crearPuertos(sembrar(), ENV, f).revisor({ texto: 'x', dry_run: false, imagenes_urls: ['https://a.test/1.png'] })
    expect(JSON.parse(String(llamadas[0].init!.body)).input[0].content.filter((c: { type: string }) => c.type === 'input_image')).toHaveLength(1)
  })
})

const LAMINAS = [{ rol: 'hook', headline: 'Cada mañana' }, { rol: 'problem', headline: 'Hoy cambia' }, { rol: 'reframe', headline: 'Un plato nuevo' }, { rol: 'benefit', headline: 'Hecho al momento' }, { rol: 'cta', headline: 'Escríbenos', cta: 'Escríbenos' }]
const guion: Guion = {
  paquete: () => ({ texto: 'material del portero' }),
  direccion_visual: () => ({ texto: j({ resumen: 'Fondo de la marca', imagenes: [], reglas_de_imagen: { obligatorio: [], prohibido: [] } }) }),
  texto: () => ({ texto: j({ texto_base: 'Cada mañana\nHoy cambia\nUn plato nuevo\nHecho al momento\nEscríbenos', pie_de_foto: 'Te esperamos.', hashtags: ['#plato'] }) }),
  laminas: () => ({ texto: j({ laminas: LAMINAS }) }),
  revision_jefe: () => ({ texto: FICHAS_VACIAS }),
}
const abrir = (P: ReturnType<typeof crearPuertos>, dry_run: boolean) => abrirEncargo(P, { cuerpo: { parte_id: PARTE, brief_id: 'BRF-0100', dry_run, familia: 'carrusel_ig_v1' }, client_id: CLIENTE, target_step_id: TARGET_STEP_PRODUCIR })

describe('INTEGRACIÓN · carrusel con almacén real (base falsa) + adaptadores, modelo simulado', () => {
  it('dry_run: recorre todo SIN llamar al brazo, al revisor ni a Slack, y sin escribir pieza, bandeja ni archivos', async () => {
    const db = sembrar(); const { f, llamadas } = fetchFalso()
    const P = crearPuertos(db, ENV, f, () => new Date('2026-10-10T12:00:00Z'))
    const a = await abrir(P, true)
    expect(a.status).toBe(200)
    const { ultima } = await correr({ P } as unknown as Memoria, String(a.cuerpo.encargo_id), guion)
    expect(ultima.cuerpo).toMatchObject({ accion: 'cerrado', estado: 'cerrado', simulado: true, con_desacuerdo: false })
    expect(llamadas.filter((x) => !x.url.startsWith(PREFIJO_DRY))).toEqual([])
    expect(db.tablas['client_historical_outputs']).toHaveLength(1)
    expect(db.tablas['hitl_queue'] ?? []).toHaveLength(0)
    expect(Object.keys(db.archivos)).toHaveLength(0)
  })
  it('REAL (simulado): el brazo dibuja en la subcarpeta del encargo, la entrega queda en el bucket y la bandeja trae el vencimiento', async () => {
    const db = sembrar(); const { f, llamadas } = fetchFalso()
    const P = crearPuertos(db, ENV, f, () => new Date('2026-10-10T12:00:00Z'))
    const a = await abrir(P, false)
    const id = String(a.cuerpo.encargo_id)
    const { ultima } = await correr({ P } as unknown as Memoria, id, guion)
    expect(ultima.cuerpo).toMatchObject({ estado: 'cerrado', con_desacuerdo: false, simulado: false })
    const render = llamadas.find((x) => x.url.endsWith('/api/carousel/generate'))!
    expect(JSON.parse(String(render.init!.body))).toMatchObject({ client_slug: 'cliente-de-practica', platform: 'instagram-feed', subcarpeta: `oficina/${id}` })
    // la Caveat no estaba disponible para una tipografía del manual ⇒ ficha que avisa, no silencio
    const q = db.tablas['hitl_queue'][0]
    expect(q).toMatchObject({ client_id: CLIENTE, type: 'content_piece_review', status: 'pending', expires_at: '2026-10-14T05:00:00.000Z' })
    expect(String(q.title)).toMatch(/Carrusel BRF-0100.*5 láminas/)
    const pieza = db.tablas['client_historical_outputs'].find((x) => x.output_type === 'campaign_piece')!
    expect(pieza).toMatchObject({ status: 'draft' }); expect(String(pieza.content)).toMatch(/Cada mañana/)
    const nombres = Object.keys(db.archivos).map((p) => p.split('/').pop())
    expect(nombres.filter((n) => n!.endsWith('.png'))).toEqual(['sin-fecha_sin-hora_instagram_carrusel_BRF-0100_01-de-05.png', 'sin-fecha_sin-hora_instagram_carrusel_BRF-0100_02-de-05.png', 'sin-fecha_sin-hora_instagram_carrusel_BRF-0100_03-de-05.png', 'sin-fecha_sin-hora_instagram_carrusel_BRF-0100_04-de-05.png', 'sin-fecha_sin-hora_instagram_carrusel_BRF-0100_05-de-05.png'])
    expect([...db.bucketsUsados]).toEqual(['oficina-test']) // jamás el bucket de la web del cliente
    const turnos = db.tablas['oficina_turnos']
    expect(turnos.every((t) => t.estado === 'hecho')).toBe(true)
    expect(JSON.stringify(db.tablas['oficina_artefactos'].map((x) => x.tipo))).toMatch(/render/)
  })
  it('el cliente sin slug no abre: falla visible en el primer paso, antes de gastar', async () => {
    const db = sembrar({ slug: null }); const { f, llamadas } = fetchFalso()
    const P = crearPuertos(db, ENV, f)
    const a = await abrir(P, false)
    expect(a.cuerpo).toMatchObject({ estado: 'fallido' }); expect(String(a.cuerpo.motivo)).toMatch(/slug/)
    expect(llamadas.filter((x) => !x.url.startsWith('https://slack.com'))).toEqual([])
  })
})
