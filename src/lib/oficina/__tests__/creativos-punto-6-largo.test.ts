/**
 * 17-nov · GO creativos en cada paso · punto 6 (CC1 · certifica CC6): los topes de caracteres (eyebrow 24 · rol 60 · …) no matan el encargo.
 * El agente los recibe CLAROS en su contrato y, si solo sobran caracteres, el chequeo se lo DEVUELVE para acortar (campo, largo, tope, cuánto sobra), con un tope de
 * vueltas explícito. Lo mezclado con otro error sigue la regla de siempre. El código nunca recorta el texto del autor. US$ 0.
 */
import { describe, expect, it } from 'vitest'
import { CONTRATOS_LAMINAS } from '../pedidos-laminas'
import { CORRECCIONES_DE_LARGO, LIMITES_DE_ESTRUCTURA, pedidoDeAcortar, procesarSalida, soloTextosLargos } from '../salida'

const elemento = (o: Record<string, unknown> = {}) => ({ ref: 'e01', rol: 'apertura', beat: 'la mesa se llena', mood: 'cálido', ...o })
const estructura = (o: Record<string, unknown> = {}) => JSON.stringify({ elementos: [elemento(o)] })
const ROL_LARGO = 'apertura emocional con la mesa larga llena de amigos que se ríen al atardecer' // 77

describe('el agente recibe los topes claros', () => {
  it('🔴 el contrato de la estructura dice el tope de cada texto (los MISMOS números del esquema)', () => {
    expect(LIMITES_DE_ESTRUCTURA).toEqual({ rol: 60, beat: 200, mood: 120, sugerencia_interactiva: 160 })
    expect(CONTRATOS_LAMINAS['estructura.v1']).toContain('"rol": "(≤ 60 caracteres CONTADOS con espacios y signos)"')
    expect(CONTRATOS_LAMINAS['estructura.v1']).toContain('"beat": "(≤ 200)"')
    expect(CONTRATOS_LAMINAS['estructura.v1']).toContain('"mood": "(≤ 120)"')
    expect(CONTRATOS_LAMINAS['resolucion_estructura.v1']).toContain('"rol": "(≤ 60)"')
  })
  it('el esquema mide con esos topes: 60 entra, 61 no', () => {
    expect(procesarSalida(estructura({ rol: 'r'.repeat(60) }), 'estructura.v1', 0, 1)).toMatchObject({ ok: true })
    expect(procesarSalida(estructura({ rol: 'r'.repeat(61) }), 'estructura.v1', 0, 1)).toMatchObject({ ok: false, accion: 'reintentar' })
  })
})

describe('si SOLO sobran caracteres, se devuelve para acortar (no se mata el encargo)', () => {
  it('🔴 el caso real (`rol` de 77 > 60): se devuelve en el intento 0, 1 y 2; recién en el 3 (1 + 2 correcciones) es falla visible', () => {
    expect(CORRECCIONES_DE_LARGO).toBe(2)
    for (const intento of [0, 1, 2]) expect(procesarSalida(estructura({ rol: ROL_LARGO }), 'estructura.v1', intento, 1), `intento ${intento}`).toMatchObject({ ok: false, accion: 'reintentar' })
    expect(procesarSalida(estructura({ rol: ROL_LARGO }), 'estructura.v1', 3, 1)).toMatchObject({ ok: false, accion: 'falla_visible' })
  })
  it('🔴 el pedido dice en claro qué campo, cuánto mide, su tope y cuánto sobra; pide reescribir, no cortar', () => {
    const r = procesarSalida(estructura({ rol: ROL_LARGO }), 'estructura.v1', 1, 1)
    if (r.ok || r.accion !== 'reintentar') throw new Error('debía devolverse')
    expect(r.mensaje_de_error).toContain('- $.elementos[0].rol: tiene 77 caracteres y el tope es 60 (sobran 17)')
    expect(r.mensaje_de_error).toMatch(/letras, espacios y signos/)
    expect(r.mensaje_de_error).toMatch(/no los cortes a la mitad/)
    expect(r.mensaje_de_error).toMatch(/JSON COMPLETO/)
  })
  it('🔴 con reintento_formato 0 también se devuelve (las correcciones de largo son aparte): 0 y 1 sí, 2 no', () => {
    expect(procesarSalida(estructura({ rol: ROL_LARGO }), 'estructura.v1', 0, 0)).toMatchObject({ accion: 'reintentar' })
    expect(procesarSalida(estructura({ rol: ROL_LARGO }), 'estructura.v1', 1, 0)).toMatchObject({ accion: 'reintentar' })
    expect(procesarSalida(estructura({ rol: ROL_LARGO }), 'estructura.v1', 2, 0)).toMatchObject({ accion: 'falla_visible' })
  })
  it('varios campos largos a la vez: todos en el mismo pedido', () => {
    const r = procesarSalida(estructura({ rol: ROL_LARGO, mood: 'm'.repeat(130) }), 'estructura.v1', 1, 1)
    if (r.ok || r.accion !== 'reintentar') throw new Error('debía devolverse')
    expect(r.mensaje_de_error).toContain('rol: tiene 77')
    expect(r.mensaje_de_error).toContain('mood: tiene 130 caracteres y el tope es 120 (sobran 10)')
  })
  it('🔴 el código NUNCA recorta: la corrección que llega dentro del tope se acepta TAL CUAL', () => {
    const corto = 'apertura con la mesa larga al atardecer'
    expect(procesarSalida(estructura({ rol: corto }), 'estructura.v1', 2, 1)).toMatchObject({ ok: true, valor: { elementos: [{ rol: corto }] } })
  })
})

describe('lo que NO es solo largo sigue la regla de siempre', () => {
  it('🔴 largo + otro error (falta un campo requerido): un reintento y después falla visible, como hoy', () => {
    const t = JSON.stringify({ elementos: [{ ref: 'e01', rol: ROL_LARGO, beat: 'b' }] }) // sin mood
    const r0 = procesarSalida(t, 'estructura.v1', 0, 1)
    expect(r0).toMatchObject({ accion: 'reintentar' })
    if (!r0.ok && r0.accion === 'reintentar') expect(r0.mensaje_de_error).toMatch(/^Tu respuesta no cumple el formato/)
    expect(procesarSalida(t, 'estructura.v1', 1, 1)).toMatchObject({ accion: 'falla_visible' })
  })
  it('JSON roto no gana correcciones de largo', () => {
    expect(procesarSalida('{"elementos": [', 'estructura.v1', 1, 1)).toMatchObject({ accion: 'falla_visible' })
  })
  it('«demasiado corto» o «sobran elementos» no son largo de texto', () => {
    expect(soloTextosLargos(['$.x: texto demasiado largo (máx. 5; el tuyo tiene 8)'])).toBe(true)
    expect(soloTextosLargos(['$.x: texto demasiado largo (máx. 5; el tuyo tiene 8)', '$.y: falta'])).toBe(false)
    expect(soloTextosLargos(['$.elementos: sobran elementos (máx. 30)'])).toBe(false)
    expect(soloTextosLargos([])).toBe(false)
  })
  it('pedidoDeAcortar arma una línea por campo', () => {
    expect(pedidoDeAcortar(['$.a.eyebrow: texto demasiado largo (máx. 24; el tuyo tiene 31)']).split('\n')[1]).toBe('- $.a.eyebrow: tiene 31 caracteres y el tope es 24 (sobran 7)')
  })
})
