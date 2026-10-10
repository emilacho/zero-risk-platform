/**
 * Condiciones de CC#3 al brazo del carrusel (#470): lo que sus mutaciones dejaron vivo.
 *  · qué tipografía SE DIBUJA (no solo cuál se baja y se declara «usada»)
 *  · la numeración de las láminas (slide-1…N sin saltos)
 *  · fotoDeFondoValida: una dirección que no se puede leer NO es válida
 *  · la frontera de 4 segmentos de la subcarpeta
 */
import crypto from 'node:crypto'
import { describe, expect, it, type TestContext } from 'vitest'
import { TEMPLATES, PLATFORM_SPECS, renderCarousel, renderSlide, type CarouselPlatform, type FontEntry } from '../packages/carousel-engine/src'
import { familiasDeMarca } from '../packages/carousel-engine/src/render'
import { naufragoBrandV1, naufragoSlidesV1 } from '../packages/carousel-engine/src/fixtures'
import { fotoDeFondoValida, rutaDeLamina, validarSubcarpeta } from '../src/lib/carousel-ruta'

const PLATAFORMAS = Object.keys(PLATFORM_SPECS) as CarouselPlatform[]
const sha = (b: crypto.BinaryLike) => crypto.createHash('sha256').update(b).digest('hex')
const marca = (family: string, headline_family?: string) => ({ ...naufragoBrandV1, fonts: { family, ...(headline_family ? { headline_family } : {}) } })

describe('qué tipografía se dibuja', () => {
  it('familiasDeMarca: cuerpo y titular; sin titular propio, el del cuerpo; sin nada, Inter', () => {
    expect(familiasDeMarca(marca('Caveat', 'Alfa Slab One'))).toEqual(['Caveat', 'Alfa Slab One'])
    expect(familiasDeMarca(marca('Caveat'))).toEqual(['Caveat', 'Caveat'])
    expect(familiasDeMarca(marca(''))).toEqual(['Inter', 'Inter'])
  })
  for (const p of PLATAFORMAS) {
    it(`${p}: el árbol de la lámina lleva la tipografía de la marca (cuerpo y titular), no Inter`, () => {
      const t = JSON.stringify(TEMPLATES[p]({ brand: marca('Caveat', 'Alfa Slab One'), content: naufragoSlidesV1[0], slide_index: 1, total_slides: 5 }))
      expect(t).toContain('"fontFamily":"Alfa Slab One"')
      expect(t).toContain('"fontFamily":"Caveat"')
    })
  }

  let interCache: FontEntry[] | null | undefined
  async function inter(ctx: TestContext): Promise<FontEntry[]> {
    if (interCache === undefined) {
      try {
        interCache = []
        for (const w of [400, 700] as const) {
          const r = await fetch(`https://cdn.jsdelivr.net/fontsource/fonts/inter@5.3.0/latin-${w}-normal.ttf`)
          if (!r.ok) throw new Error(String(r.status))
          interCache.push({ name: 'Inter', data: await r.arrayBuffer(), weight: w, style: 'normal' })
        }
      } catch { interCache = null }
    }
    if (!interCache) { console.warn('[carousel-brazo-cc3] CDN de Inter sin respuesta: prueba de PNG omitida'); ctx.skip() }
    return interCache as FontEntry[]
  }

  it('en píxeles: una marca con OTRA tipografía dibuja distinto que Inter (la lámina no cae a Inter en silencio)', async (ctx) => {
    const base = await inter(ctx)
    const negrita = base.find((f) => f.weight === 700)!
    // «Marca X» = los trazos de la negrita de Inter registrados como la familia de la marca
    const fonts: FontEntry[] = [...base, { name: 'Marca X', data: negrita.data, weight: 400, style: 'normal' }, { name: 'Marca X', data: negrita.data, weight: 700, style: 'normal' }]
    const dibujar = async (b: typeof naufragoBrandV1) => renderSlide({ platform: 'instagram-feed', brand: b, content: naufragoSlidesV1[0], slide_index: 1, total_slides: 5, options: { fonts } })
    const conInter = await dibujar(marca('Inter'))
    const conMarca = await dibujar(marca('Marca X'))
    expect(conMarca.fonts_usadas).toContain('Marca X')
    expect(conMarca.fonts_faltantes).toEqual([])
    expect(sha(conMarca.png)).not.toBe(sha(conInter.png))
    // y es estable: dibujar dos veces con la marca da lo mismo
    expect(sha((await dibujar(marca('Marca X'))).png)).toBe(sha(conMarca.png))
  })

  it('numeración: las láminas salen 1…N en orden, sin saltos, con su total', async (ctx) => {
    const fonts = await inter(ctx)
    const r = await renderCarousel({ platform: 'instagram-feed', brand: naufragoBrandV1, slides: naufragoSlidesV1.slice(0, 3), options: { fonts } })
    expect(r.map((x) => x.slide_index)).toEqual([1, 2, 3])
    expect(r.every((x) => x.total_slides === 3)).toBe(true)
    expect([1, 2, 3].map((n) => rutaDeLamina('cli', '2026-10-10', 'a/b', n))).toEqual(['cli/carousels/2026-10-10/a/b/slide-1.png', 'cli/carousels/2026-10-10/a/b/slide-2.png', 'cli/carousels/2026-10-10/a/b/slide-3.png'])
  })
})

describe('fotoDeFondoValida · una dirección que no se puede leer NO es válida', () => {
  it('https y data:image sí; lo demás no', () => {
    expect(fotoDeFondoValida('https://fotos.test/a.jpg')).toBe(true)
    expect(fotoDeFondoValida('data:image/png;base64,AAAA')).toBe(true)
    for (const x of ['http://fotos.test/a.jpg', 'ftp://x/a.jpg', 'file:///etc/passwd', 'javascript:alert(1)', 'no es una dirección', '', 'data:text/html;base64,AAAA', 'data:image/gif;base64,AAAA', 42, null, undefined]) expect(fotoDeFondoValida(x), String(x)).toBe(false)
  })
})

describe('subcarpeta · la frontera de 4 segmentos', () => {
  it('1 a 4 segmentos pasan; 5, vacíos, «..» y mayúsculas raras no', () => {
    for (const s of ['a', 'a/b', 'a/b/c', 'a/b/c/d']) expect(validarSubcarpeta(s), s).toEqual({ ok: true, valor: s })
    for (const s of ['a/b/c/d/e', 'a//b', '/a', 'a/', 'a/../b', '../a', '-a', 'a b', 'a'.padEnd(66, 'a')]) expect(validarSubcarpeta(s).ok, s).toBe(false)
    expect(validarSubcarpeta('a'.padEnd(64, 'a')).ok).toBe(true)
    expect(validarSubcarpeta(undefined)).toEqual({ ok: true, valor: undefined })
  })
})
