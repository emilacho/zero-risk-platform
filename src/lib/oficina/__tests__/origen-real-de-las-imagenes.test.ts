/**
 * P6 del encargo de correcciones (29-oct) · el resumen de la bandeja dice el origen REAL de cada imagen (la que se usó), no la que se pidió.
 * Caso real (encargo 8adbfb3d): se pidieron 5 imágenes generadas, una se descartó por el observador y la última lámina no lleva imagen; el resumen anunciaba otra cosa. US$ 0, sin red.
 */
import { describe, expect, it } from 'vitest'
import { marcaDeOrigenActiva, origenesDeImagenes } from '../marcas-de-origen'

const base = { version: 1, version_consumida: 0 }
const art = (datos: unknown) => ({ ...base, datos })
const estado = (a: Record<string, unknown>) => ({ artefactos: Object.fromEntries(Object.entries(a).map(([k, v]) => [k, art(v)])) }) as never

const PEDIDAS = [
  { ref: 'hook', modo: 'generada' }, { ref: 'problem', modo: 'generada' }, { ref: 'reframe', modo: 'generada' },
  { ref: 'proof', modo: 'generada' }, { ref: 'benefit', modo: 'generada' }, { ref: 'cierre', modo: 'ninguna' },
]
const LAMINAS = { laminas: PEDIDAS.map((p, i) => ({ orden: i + 1, rol: p.ref })) }
const ELEGIDAS_REALES = { por_ref: { problem: { origen: 'generada' }, reframe: { origen: 'generada' }, proof: { origen: 'generada' }, benefit: { origen: 'generada' } } }

describe('el origen sale de lo que se USÓ', () => {
  const o = origenesDeImagenes(estado({ visual_direction: { imagenes: PEDIDAS }, laminas: LAMINAS, imagenes_elegidas: ELEGIDAS_REALES }), { roles_sin_imagen: ['cta', 'cierre'] })!
  it('4 generadas, 1 pedida y descartada (la del hook) y 1 lámina tipográfica — no «5 generadas»', () => {
    expect(o.por_imagen.map((x) => [x.lamina, x.origen])).toEqual([[1, 'descartada'], [2, 'generada'], [3, 'generada'], [4, 'generada'], [5, 'generada'], [6, 'tipografica']])
    expect(o.resumen).toBe('4 imagen generada con IA · 1 imagen pedida que no se usó (la lámina queda sin imagen) · 1 lámina tipográfica de marca')
    expect(o.resumen).not.toMatch(/^5 /)
  })
  it('una foto propia elegida se anuncia como foto propia (y como cercana si la candidata lo dice)', () => {
    const e = (cands: unknown) => estado({ visual_direction: { imagenes: [{ ref: 'hook', modo: 'real', foto_id: 'f1' }] }, laminas: { laminas: [{ orden: 1, rol: 'hook' }] }, imagenes_elegidas: { por_ref: { hook: { origen: 'real', foto_id: 'f1' } } }, candidatas_foto: cands })
    expect(origenesDeImagenes(e({ candidatas: [{ id: 'f1' }] }))!.por_imagen[0]).toMatchObject({ origen: 'foto_propia', foto_id: 'f1', lamina: 1 })
    expect(origenesDeImagenes(e({ candidatas: [{ id: 'f1', cercana: true }] }))!.por_imagen[0].origen).toBe('foto_cercana')
  })
  it('una foto propia que se pidió y NO quedó elegida no se anuncia como foto propia', () => {
    const r = origenesDeImagenes(estado({ visual_direction: { imagenes: [{ ref: 'hook', modo: 'real', foto_id: 'f1' }] }, imagenes_elegidas: { por_ref: {} } }))!
    expect(r.por_imagen[0].origen).toBe('descartada')
  })
})

describe('sin imágenes elegidas todavía, el comportamiento de siempre', () => {
  it('lee la dirección visual', () => {
    const l = origenesDeImagenes(estado({ visual_direction: { imagenes: [{ ref: 'hook', modo: 'generada' }, { ref: 'cta', modo: 'ninguna' }, { ref: 'proof', modo: 'ninguna' }] } }))!
    expect(l.por_imagen.map((x) => x.origen)).toEqual(['generada', 'tipografica', 'sin_imagen'])
  })
  it('sin dirección visual no hay resumen', () => { expect(origenesDeImagenes(estado({}))).toBeNull() })
})

describe('la plantilla de la mesa lo trae encendido', () => {
  it('la marca de origen se activa con `mesa: true`, con la generación o con el material; apagada, no', () => {
    expect(marcaDeOrigenActiva({ mesa: true })).toBe(true)
    expect(marcaDeOrigenActiva({ generar_cuando_no_hay_foto: true })).toBe(true)
    expect(marcaDeOrigenActiva({ material_activo: false })).toBe(false)
    expect(marcaDeOrigenActiva(undefined)).toBe(false)
  })
})
