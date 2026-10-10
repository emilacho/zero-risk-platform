/**
 * BRAZO DEL CARRUSEL · foto de fondo, tipografías de la marca, pie y indicador (pruebas permanentes).
 * Diseño: docs/DISENO-2026-10-09-oficina-salas-2-3-4.md §2.2. Todo ADITIVO: sin las propiedades nuevas el render es el de siempre.
 *  · HUELLA de lo anterior: sha256 del árbol JSX de cada molde (sin red) y del PNG (con Inter 5.3.0 fijado; se omite SOLO si el CDN no responde).
 *    Los valores se tomaron ANTES de tocar los moldes, con el código de `main` (18d77ac).
 *  · cero llamadas a modelo, bucket o base de datos.
 */
import crypto from 'node:crypto'
import zlib from 'node:zlib'
import { Resvg } from '@resvg/resvg-js'
import { beforeEach, describe, expect, it, type TestContext } from 'vitest'
import {
  PLATFORM_SPECS,
  TEMPLATES,
  clearFontCache,
  informeDeFuentes,
  renderSlide,
  resolverFamilia,
  slugDeFuente,
  type CarouselPlatform,
  type FontEntry,
  type SlideContent,
} from '../packages/carousel-engine/src'
import { naufragoBrandV1, naufragoSlidesV1 } from '../packages/carousel-engine/src/fixtures'

const sha = (b: crypto.BinaryLike) => crypto.createHash('sha256').update(b).digest('hex')
const PLATAFORMAS = Object.keys(PLATFORM_SPECS) as CarouselPlatform[]

// ── huella de lo anterior (tomada antes de tocar nada)
const ANTES: Record<CarouselPlatform, { tree: string; tree2: string; png: string; png2: string }> = {
  'instagram-feed': { tree: '493fe66447bf8d472058240040ba791149af5dd0ee0e58e3ecfb33a03146c735', tree2: 'f1ff6dc3179bca2a41db2b2b83a8ee3b202bc64e714399127bcf1b6d32bbb185', png: '5f7d330c76a272c0a7dd5ef4750a4c186a62d5bd17ab36952d3f22610efaf4b5', png2: '2296a269ed4abf705b9a615b454c3cf4f46d67a3b122d1dcde1dd9664d7c1be8' },
  'instagram-reel': { tree: 'ccde3173e29c57632a05705152cc2211a8dbdfb5a6edfd24eb796c0b374269c0', tree2: '865eedc7b00323c9921892b97742c14582c3d4e22428bdc73c7771679039cca4', png: '026481c91084091de7a10189216c4420d614ce8f80b9cdcd4d26bcc4a650fb0d', png2: '2b6e774e667f54528f8eebef1f702e0d06b39e5dffa68e59896f4aa3d7d662cf' },
  tiktok: { tree: 'c433b5448facf5bf31afca6f1b4e850618e1ba64555ac22d0836bfcc7d6adaa4', tree2: '88f2113ed793707d53c000b5e5a64b966d6b2a03053667a420e765ee2ab9e97b', png: '51ae672d8129376746a7caea1dfbc018bbe2e3e79c68cef97913debe5de23195', png2: 'dad2a04b9ac29bf77ad6ef0112d17bd784db071ba94b3170881557b3d7d2b3f1' },
  'facebook-feed': { tree: '59389af9ac479d19eff2b8690d5245ade91106fabb01cb1e76684d334393d7e8', tree2: 'f9e1937c1432070ac97a0dec1763714f197bf3f7ba4ed80e2050dc5ffb65573c', png: 'e886ea42c2eb6fdb25b9a221a40e4f77bc21af433f7c18c18491474533c0e57f', png2: '2f2abc0d3906e6bd862b40867eee4786708a0b0836e1ce46b112718e880eef4e' },
  'twitter-card': { tree: '4b7bb565c8915fb9ab4a79038c97577b5221b66b6773d0b3e9c8a59241841e48', tree2: '40ce249a9206b86237670a93be8371d27d4f7695bd9c8052e47eb930ebcdd456', png: '8a7372956ae9d3cc1cb0861c4941c419e3b8af7269e9197c8eb2a1564422c678', png2: 'cda79ebbc1e0ef621a02758f1e7afd60daa08bdf242e302fbfa659fbef2bb0e3' },
}
const INTER = {
  400: { url: 'https://cdn.jsdelivr.net/fontsource/fonts/inter@5.3.0/latin-400-normal.ttf', sha: '7c7c718a62e315a83fb5b5b0b086028bae10fc153701cf0f0b168e5f5a0c28f9' },
  700: { url: 'https://cdn.jsdelivr.net/fontsource/fonts/inter@5.3.0/latin-700-normal.ttf', sha: 'e0b3cad6de618fb83ef2dec26499beb6011a90971090a63dcf904670e13c53ec' },
} as const

let interCache: FontEntry[] | null | undefined
/** Inter fijado por versión; null = el CDN no responde (la prueba se omite, dicho en voz alta). Una huella distinta FALLA. */
async function inter(): Promise<FontEntry[] | null> {
  if (interCache !== undefined) return interCache
  try {
    const out: FontEntry[] = []
    for (const w of [400, 700] as const) {
      const r = await fetch(INTER[w].url)
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const data = await r.arrayBuffer()
      expect(sha(Buffer.from(data)), `Inter ${w} cambió en el CDN: la huella de los PNG ya no es comparable`).toBe(INTER[w].sha)
      out.push({ name: 'Inter', data, weight: w, style: 'normal' })
    }
    interCache = out
  } catch (e) {
    if (e instanceof Error && /Inter \d+ cambió/.test(e.message)) throw e
    if (e instanceof Error && e.name === 'AssertionError') throw e
    interCache = null
  }
  return interCache
}
async function conInter(ctx: TestContext): Promise<FontEntry[]> {
  const f = await inter()
  if (!f) { console.warn('[carousel-brazo] CDN de Inter sin respuesta: prueba de PNG omitida'); ctx.skip() }
  return f as FontEntry[]
}

const props = (p: CarouselPlatform, content: SlideContent, i = 1, n = 5) => ({ brand: naufragoBrandV1, content, slide_index: i, total_slides: n })
const arbol = (p: CarouselPlatform, content: SlideContent, i = 1, n = 5) => TEMPLATES[p](props(p, content, i, n))

/** todos los textos del árbol JSX, en orden */
function textos(nodo: unknown, out: string[] = []): string[] {
  if (nodo === null || nodo === undefined || typeof nodo === 'boolean') return out
  if (typeof nodo === 'string' || typeof nodo === 'number') { out.push(String(nodo)); return out }
  if (Array.isArray(nodo)) { nodo.forEach((x) => textos(x, out)); return out }
  const el = nodo as { props?: { children?: unknown } }
  if (el.props) textos(el.props.children, out)
  return out
}
/** todos los elementos `img` del árbol */
function imgs(nodo: unknown, out: Array<Record<string, unknown>> = []): Array<Record<string, unknown>> {
  if (!nodo || typeof nodo !== 'object') return out
  if (Array.isArray(nodo)) { nodo.forEach((x) => imgs(x, out)); return out }
  const el = nodo as { type?: unknown; props?: Record<string, unknown> }
  if (el.type === 'img' && el.props) out.push(el.props)
  if (el.props) imgs(el.props.children, out)
  return out
}

// ── PNG: fabricar una foto lisa y leer un píxel (sin dependencias)
function fotoLisa(hex: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8" fill="${hex}"/></svg>`
  return `data:image/png;base64,${Buffer.from(new Resvg(svg).render().asPng()).toString('base64')}`
}
function pixel(png: Buffer, x: number, y: number): [number, number, number] {
  let off = 8, w = 0, h = 0, canales = 4
  const idat: Buffer[] = []
  while (off < png.length) {
    const len = png.readUInt32BE(off), tipo = png.subarray(off + 4, off + 8).toString('latin1'), cuerpo = png.subarray(off + 8, off + 8 + len)
    if (tipo === 'IHDR') { w = cuerpo.readUInt32BE(0); h = cuerpo.readUInt32BE(4); canales = cuerpo[9] === 6 ? 4 : cuerpo[9] === 2 ? 3 : 0; expect(cuerpo[8]).toBe(8); expect(cuerpo[12]).toBe(0) }
    if (tipo === 'IDAT') idat.push(cuerpo)
    off += 12 + len
  }
  expect(canales).toBeGreaterThan(0)
  const raw = zlib.inflateSync(Buffer.concat(idat))
  const fila = w * canales
  const px = Buffer.alloc(h * fila)
  for (let r = 0; r < h; r++) {
    const f = raw[r * (fila + 1)]
    for (let c = 0; c < fila; c++) {
      const v = raw[r * (fila + 1) + 1 + c]
      const a = c >= canales ? px[r * fila + c - canales] : 0
      const b = r > 0 ? px[(r - 1) * fila + c] : 0
      const cc = c >= canales && r > 0 ? px[(r - 1) * fila + c - canales] : 0
      const pa = Math.abs(b - cc), pb = Math.abs(a - cc), pc = Math.abs(a + b - 2 * cc)
      const paeth = pa <= pb && pa <= pc ? a : pb <= pc ? b : cc
      px[r * fila + c] = (v + (f === 0 ? 0 : f === 1 ? a : f === 2 ? b : f === 3 ? (a + b) >> 1 : paeth)) & 255
    }
  }
  const o = y * fila + x * canales
  return [px[o], px[o + 1], px[o + 2]]
}

// ═════════════════════════ 1 · lo de siempre NO cambia
describe('huella · sin las propiedades nuevas el molde es IDÉNTICO al anterior', () => {
  for (const p of PLATAFORMAS) {
    it(`${p}: el árbol JSX de las láminas 1 y 2 tiene la misma huella que antes`, () => {
      expect(sha(JSON.stringify(arbol(p, naufragoSlidesV1[0], 1)))).toBe(ANTES[p].tree)
      expect(sha(JSON.stringify(arbol(p, naufragoSlidesV1[1], 2)))).toBe(ANTES[p].tree2)
    })
    it(`${p}: las propiedades nuevas en su valor «apagado» (null / false / undefined) tampoco cambian el árbol`, () => {
      const apagado = { ...naufragoSlidesV1[0], background_image_url: null, ocultar_indicador: false }
      expect(sha(JSON.stringify(arbol(p, apagado, 1)))).toBe(ANTES[p].tree)
      expect(sha(JSON.stringify(arbol(p, { ...naufragoSlidesV1[0], background_image_url: '' }, 1)))).toBe(ANTES[p].tree)
    })
    it(`${p}: el PNG de las láminas 1 y 2 es byte a byte el de antes (Inter 5.3.0 fijado)`, async (ctx) => {
      const fonts = await conInter(ctx)
      for (const [i, hash] of [[0, ANTES[p].png], [1, ANTES[p].png2]] as const) {
        const r = await renderSlide({ platform: p, brand: naufragoBrandV1, content: naufragoSlidesV1[i], slide_index: i + 1, total_slides: 5, options: { fonts } })
        expect(sha(r.png), `${p} lámina ${i + 1}`).toBe(hash)
      }
    })
  }
})

// ═════════════════════════ 2 · foto de fondo
describe('foto de fondo · background_image_url', () => {
  const FOTO = fotoLisa('#ff0000')
  for (const p of PLATAFORMAS) {
    it(`${p}: con foto el árbol lleva la imagen a pantalla completa (cover) y la capa de contraste ANTES del contenido`, () => {
      const { width, height } = PLATFORM_SPECS[p]
      const a = arbol(p, { ...naufragoSlidesV1[0], background_image_url: FOTO })
      const i = imgs(a).find((x) => x.src === FOTO)
      expect(i, 'no hay <img> con la foto').toBeTruthy()
      expect(i!.style).toMatchObject({ position: 'absolute', top: 0, left: 0, width, height, objectFit: 'cover' })
      const raiz = a as unknown as { props: { style: Record<string, unknown>; children: Array<{ props?: { style?: Record<string, unknown> } }> } }
      expect(raiz.props.style.position).toBe('relative')
      const [c0, c1] = raiz.props.children
      expect((c0 as unknown as { type: string }).type).toBe('img')
      expect(c1.props?.style).toMatchObject({ position: 'absolute', backgroundColor: 'rgba(0,0,0,0.5)' })
      // el texto sigue ahí
      expect(textos(a).join(' ')).toContain(naufragoSlidesV1[0].headline)
    })
    it(`${p}: con foto el árbol CAMBIA respecto del de antes (la foto no se pierde en silencio)`, () => {
      expect(sha(JSON.stringify(arbol(p, { ...naufragoSlidesV1[0], background_image_url: FOTO })))).not.toBe(ANTES[p].tree)
    })
  }
  it('en píxeles: una foto roja tapa el fondo verde de la marca (centro rojo, oscurecido por la capa)', async (ctx) => {
    const fonts = await conInter(ctx)
    const sin = await renderSlide({ platform: 'instagram-feed', brand: naufragoBrandV1, content: naufragoSlidesV1[2], slide_index: 3, total_slides: 5, options: { fonts } })
    const con = await renderSlide({ platform: 'instagram-feed', brand: naufragoBrandV1, content: { ...naufragoSlidesV1[2], background_image_url: FOTO }, slide_index: 3, total_slides: 5, options: { fonts } })
    expect(sha(con.png)).not.toBe(sha(sin.png))
    const [r0, g0] = pixel(sin.png, 900, 300) // esquina libre de texto
    expect(r0).toBeLessThan(40)
    expect(g0).toBeGreaterThan(30) // verde de marca
    const [r, g, b] = pixel(con.png, 900, 300)
    expect(r).toBeGreaterThan(90) // ~255 × 0,5
    expect(r).toBeLessThan(160)
    expect(g).toBeLessThan(25)
    expect(b).toBeLessThan(25)
  })
  it('facebook-feed: la franja de marca de la izquierda queda sólida y la foto cubre el resto sin bordes; el texto pasa a claro sobre la foto', async (ctx) => {
    const fonts = await conInter(ctx)
    const r = await renderSlide({ platform: 'facebook-feed', brand: naufragoBrandV1, content: { ...naufragoSlidesV1[2], background_image_url: FOTO }, slide_index: 3, total_slides: 5, options: { fonts } })
    for (const [x, y] of [[1197, 2], [1197, 627], [400, 2], [400, 627]]) expect(pixel(r.png, x, y)[0], `esquina ${x},${y}`).toBeGreaterThan(90)
    expect(pixel(r.png, 2, 2)[0]).toBeLessThan(40) // franja de marca
    const colores = JSON.stringify(arbol('facebook-feed', { ...naufragoSlidesV1[2], background_image_url: FOTO }))
    expect(colores).not.toContain(`"color":"${naufragoBrandV1.colors.text_on_surface}"`)
  })
})

// ═════════════════════════ 3 · pie y indicador
describe('pie · «desliza» ya no es fijo', () => {
  const base = naufragoSlidesV1[1]
  it('instagram-feed: por omisión «desliza →»; pie propio lo reemplaza; null y vacío lo quitan', () => {
    expect(textos(arbol('instagram-feed', base)).join('|')).toContain('desliza →')
    const t = (pie: string | null) => textos(arbol('instagram-feed', { ...base, pie })).join('|')
    expect(t('Guárdalo')).toContain('Guárdalo')
    expect(t('Guárdalo')).not.toContain('desliza')
    expect(t(null)).not.toContain('desliza')
    expect(t('   ')).not.toContain('desliza')
    expect(textos(arbol('instagram-feed', { ...base, pie: '   ' })).filter((s) => s !== '' && !s.trim())).toEqual([]) // un pie en blanco no dibuja nada
  })
  it('instagram-reel: por omisión «↑ desliza para más»; pie propio, null y vacío', () => {
    expect(textos(arbol('instagram-reel', base)).join('|')).toContain('↑ desliza para más')
    const t = (pie: string | null) => textos(arbol('instagram-reel', { ...base, pie })).join('|')
    expect(t('Mira el siguiente')).toContain('Mira el siguiente')
    expect(t(null)).not.toContain('desliza')
    expect(t('')).not.toContain('desliza')
    expect(textos(arbol('instagram-reel', { ...base, pie: '  ' })).filter((s) => s !== '' && !s.trim())).toEqual([])
  })
  it('pie null en instagram-feed mantiene la posición del llamado (a la derecha)', () => {
    const a = arbol('instagram-feed', { ...base, cta: 'Pide', pie: null })
    expect(textos(a).join('|')).toContain('Pide')
    const JSONa = JSON.stringify(a)
    expect(JSONa).toContain('"justifyContent":"space-between"')
  })
  it('los moldes sin pie (facebook, tiktok, twitter) no inventan uno', () => {
    for (const p of ['facebook-feed', 'tiktok', 'twitter-card'] as const) {
      expect(textos(arbol(p, { ...base, pie: 'Hola' })).join('|')).not.toContain('Hola')
    }
  })
})

describe('indicador «n / N» · ocultar_indicador', () => {
  const marca: Record<CarouselPlatform, RegExp> = {
    'instagram-feed': /03\s*\/\s*05|^03$/,
    'instagram-reel': /^3$/,
    tiktok: /^3$/,
    'facebook-feed': /^slide$/,
    'twitter-card': /^3$/,
  }
  for (const p of PLATAFORMAS) {
    it(`${p}: por omisión dibuja el indicador y con ocultar_indicador:true no queda rastro`, () => {
      const con = textos(arbol(p, naufragoSlidesV1[2], 3, 5)).map((s) => s.trim()).filter(Boolean)
      const sin = textos(arbol(p, { ...naufragoSlidesV1[2], ocultar_indicador: true }, 3, 5)).map((s) => s.trim()).filter(Boolean)
      expect(con.some((s) => marca[p].test(s)), 'el indicador por omisión no aparece').toBe(true)
      expect(sin.some((s) => marca[p].test(s)), 'el indicador sigue apareciendo').toBe(false)
      // y lo demás sigue
      expect(sin.join(' ')).toContain(naufragoSlidesV1[2].headline)
    })
  }
})

// ═════════════════════════ 4 · tipografías de la marca
const ttf = (n: number) => new Uint8Array(n).buffer
const respuesta = (status: number, bytes = 10) => ({ ok: status === 200, status, arrayBuffer: async () => ttf(bytes) })

describe('tipografías · resolutor familia → fontsource', () => {
  beforeEach(() => clearFontCache())
  it('slugDeFuente: «Alfa Slab One» → alfa-slab-one', () => {
    expect(slugDeFuente('Alfa Slab One')).toBe('alfa-slab-one')
    expect(slugDeFuente('  DM Serif Display ')).toBe('dm-serif-display')
    expect(slugDeFuente('Bebas Neue')).toBe('bebas-neue')
  })
  it('pide 400 y 700 a fontsource por jsDelivr y las deja en caché (la segunda vez no pide nada)', async () => {
    const pedidos: string[] = []
    const fetchImpl = async (u: string) => { pedidos.push(u); return respuesta(200) }
    const a = await resolverFamilia('Caveat', { fetchImpl })
    expect(a.map((f) => [f.name, f.weight])).toEqual([['Caveat', 400], ['Caveat', 700]])
    expect(pedidos).toEqual([
      'https://cdn.jsdelivr.net/fontsource/fonts/caveat@latest/latin-400-normal.ttf',
      'https://cdn.jsdelivr.net/fontsource/fonts/caveat@latest/latin-700-normal.ttf',
    ])
    await resolverFamilia('Caveat', { fetchImpl })
    expect(pedidos.length).toBe(2)
  })
  it('una familia que solo existe en 400 devuelve ese peso (y no insiste con el 404)', async () => {
    const pedidos: string[] = []
    const fetchImpl = async (u: string) => { pedidos.push(u); return u.includes('-700-') ? respuesta(404) : respuesta(200) }
    const a = await resolverFamilia('Permanent Marker', { fetchImpl })
    expect(a.map((f) => f.weight)).toEqual([400])
    expect(pedidos.filter((u) => u.includes('-700-')).length).toBe(1)
  })
  it('reintenta UNA vez un corte de red; a la segunda falla da []', async () => {
    let n = 0
    const unaCaida = async (_u: string) => { n++; if (n === 1) throw new Error('ECONNRESET'); return respuesta(200) }
    expect((await resolverFamilia('Bebas Neue', { fetchImpl: unaCaida })).length).toBeGreaterThan(0)
    clearFontCache()
    let m = 0
    const siempreCae = async (_u: string) => { m++; throw new Error('ECONNRESET') }
    expect(await resolverFamilia('Bebas Neue', { fetchImpl: siempreCae })).toEqual([])
    expect(m).toBe(4) // 2 pesos × (1 intento + 1 reintento)
  })
  it('una familia inexistente da [] (404 en los dos pesos)', async () => {
    expect(await resolverFamilia('Fuente Que No Existe', { fetchImpl: async () => respuesta(404) })).toEqual([])
  })
  it('informeDeFuentes: lo no cargado se DECLARA como faltante; Inter siempre va en usadas', () => {
    const inter: FontEntry = { name: 'Inter', data: ttf(1), weight: 400, style: 'normal' }
    const caveat: FontEntry = { name: 'Caveat', data: ttf(1), weight: 400, style: 'normal' }
    expect(informeDeFuentes(['Inter', 'Inter'], [inter])).toEqual({ usadas: ['Inter'], faltantes: [] })
    expect(informeDeFuentes(['Caveat', 'Bebas Neue'], [inter, caveat])).toEqual({ usadas: ['Inter', 'Caveat'], faltantes: ['Bebas Neue'] })
    expect(informeDeFuentes(['Bebas Neue'], [inter])).toEqual({ usadas: ['Inter'], faltantes: ['Bebas Neue'] })
  })
  it('el render devuelve fonts_usadas y fonts_faltantes: una tipografía de marca que no cargó cae a Inter CON aviso', async (ctx) => {
    const fonts = await conInter(ctx)
    const marcaRara = { ...naufragoBrandV1, fonts: { family: 'Inter', headline_family: 'Fuente Que No Existe' } }
    const r = await renderSlide({ platform: 'instagram-feed', brand: marcaRara, content: naufragoSlidesV1[0], slide_index: 1, total_slides: 5, options: { fonts } })
    expect(r.fonts_faltantes).toEqual(['Fuente Que No Existe'])
    expect(r.fonts_usadas).toEqual(['Inter'])
    const ok = await renderSlide({ platform: 'instagram-feed', brand: naufragoBrandV1, content: naufragoSlidesV1[0], slide_index: 1, total_slides: 5, options: { fonts } })
    expect(ok.fonts_faltantes).toEqual([])
  })
  it('sin options.fonts el render carga las tipografías de la marca por el resolutor (inyectado, sin red para la marca)', async (ctx) => {
    await conInter(ctx) // calienta la caché de Inter con la copia verificada
    const pedidos: string[] = []
    const base = (await inter()) as FontEntry[]
    // la caché de Inter ya está llena: el resolutor solo pide la familia de la marca
    for (const f of base) { const { registerFont } = await import('../packages/carousel-engine/src'); registerFont(f) }
    const marca = { ...naufragoBrandV1, fonts: { family: 'Inter', headline_family: 'Caveat' } }
    const r = await renderSlide({
      platform: 'instagram-feed', brand: marca, content: naufragoSlidesV1[0], slide_index: 1, total_slides: 5,
      options: { fontResolver: { fetchImpl: async (u: string) => { pedidos.push(u); return respuesta(404) } } },
    })
    expect(pedidos.length).toBe(2)
    expect(r.fonts_faltantes).toEqual(['Caveat'])
  })
})
