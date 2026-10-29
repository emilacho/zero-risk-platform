/**
 * 29-oct · «NO GLYPH»: las fuentes de marca no traen emojis y el dibujo pintaba un recuadro vacío. Los emojis se quitan del texto que se PINTA (el texto que se publica los conserva). US$ 0, sin red.
 */
import { describe, expect, it } from 'vitest'
import { TEMPLATES, renderSlide, sinEmojis, sinEmojisEn } from '../../../../packages/carousel-engine/src'

describe('sinEmojis (puro)', () => {
  it.each([
    ['Cuida tu equipo 🦺 hoy', 'Cuida tu equipo hoy'],
    ['🚨 Alerta: casco 👷‍♂️ obligatorio ✅', 'Alerta: casco obligatorio'],
    ['Bandera 🇪🇨 y piel 👍🏽', 'Bandera y piel'],
    ['Paso 1️⃣ y 2️⃣', 'Paso 1 y 2'],
    ['❤️ gracias', 'gracias'],
  ])('«%s» → «%s»', (entra, sale) => { expect(sinEmojis(entra)).toBe(sale) })
  it('no toca acentos, ñ, ¿¡, comillas, números ni los símbolos de marca © ® ™', () => {
    const t = '¿Qué sabes de la señalización? «Mañana» 12:30 · 50% · Zero Risk™ © ® — ✓'.replace(' — ✓', '')
    expect(sinEmojis(t)).toBe(t)
  })
  it('recorre campos sueltos y listas sin cambiar la forma ni los números', () => {
    const lamina = { headline: 'Hola 🦺', body: ['uno 🚨', 'dos'], n: 3, ok: true, nada: null }
    expect(sinEmojisEn(lamina)).toEqual({ headline: 'Hola', body: ['uno', 'dos'], n: 3, ok: true, nada: null })
  })
})

describe('el dibujo recibe el texto SIN emojis', () => {
  it('renderSlide entrega a la plantilla el contenido limpio', async () => {
    let visto: unknown
    const original = TEMPLATES['instagram-feed']
    TEMPLATES['instagram-feed'] = ((args: { content: unknown }) => { visto = args.content; throw new Error('capturado') }) as never
    try {
      await expect(renderSlide({ platform: 'instagram-feed', brand: { fonts: { family: 'Inter' } } as never, content: { headline: 'Casco 🦺 siempre ✅', body: 'Revisa 🚨 tu equipo' } as never, slide_index: 1, total_slides: 1, options: { fonts: [] } })).rejects.toThrow(/capturado/)
    } finally { TEMPLATES['instagram-feed'] = original }
    expect(visto).toEqual({ headline: 'Casco siempre', body: 'Revisa tu equipo' })
  })
})
