/**
 * 11-nov · reglas rígidas #13 y #14 (GO Lenovo 18:50 · líneas de certificación de CC7): el observador de imagen de la mesa recibe el texto de la pieza y JUZGA
 * si hay texto ajeno y si muestra un dato sin verificar; el código solo lee su sí o no. Sin respuesta (o sin alguna de las dos) la imagen NO pasa sola en real.
 * Dos clientes de rubros distintos: Náufrago (restaurante) y Zero Risk Seguridad Industrial (industria).
 */
import { describe, expect, it } from 'vitest'
import { PEDIDO_DEL_OBSERVADOR, leerObservador, observacionDeLaMesa, siNo, type LecturaDelObservador } from '../mesa/evidencia'

const item = [{ indice: 0, ref: 'hook' }]
const lect = (o: Partial<LecturaDelObservador> = {}): Record<number, LecturaDelObservador> => ({ 0: { texto_leido: [], marcas: [], personas: 0, leido: true, texto_ajeno: false, dato_sin_verificar: false, ...o } })

describe('el pedido al observador lleva el texto de la pieza y las dos preguntas', () => {
  it('pregunta TEXTO_AJENO y DATO_SIN_VERIFICAR y pega el texto de la pieza', () => {
    const t = PEDIDO_DEL_OBSERVADOR('un encebollado humeante', 'Vine buscando oro. Encontré encebollado. @naufrago.ec')
    expect(t).toMatch(/TEXTO_AJENO: <sí o no/)
    expect(t).toMatch(/DATO_SIN_VERIFICAR: <sí o no/)
    expect(t).toMatch(/Texto de la pieza: Vine buscando oro\. Encontré encebollado\. @naufrago\.ec/)
    expect(t).toMatch(/NO la evalúes/)
  })
  it('sin texto de la pieza lo dice', () => { expect(PEDIDO_DEL_OBSERVADOR('x')).toMatch(/Texto de la pieza: \(sin texto\)/) })
})

describe('el código solo lee el sí o el no', () => {
  it.each([['sí', true], ['Si', true], ['**SÍ**, dice «ISO»', true], ['yes', true], ['no', false], ['No.', false], ['  - no hay', false]])('«%s» → %s', (v, esperado) => { expect(siNo(v)).toBe(esperado) })
  it.each([[''], ['quizás'], ['nose'], ['sin'], ['n/a']])('«%s» → no contestó (null)', (v) => { expect(siNo(v)).toBeNull() })
  it('leerObservador trae las dos respuestas; si falta una, queda en null', () => {
    const r = leerObservador('TEXTO_VISIBLE: "ENCEBOLLADO"\nMARCAS: ninguna\nPERSONAS: 0\nTEXTO_AJENO: no\nDATO_SIN_VERIFICAR: sí')
    expect(r).toMatchObject({ leido: true, texto_ajeno: false, dato_sin_verificar: true, texto_leido: ['ENCEBOLLADO'] })
    expect(leerObservador('TEXTO_VISIBLE: ninguno\nMARCAS: ninguna\nPERSONAS: 0').texto_ajeno).toBeNull()
    expect(leerObservador('')).toMatchObject({ leido: false, texto_ajeno: null, dato_sin_verificar: null })
  })
})

describe('la decisión de la mesa con el juicio del observador', () => {
  it('Náufrago · texto de la pieza en la imagen («NÁUFRAGO», «encebollado»): el observador dice «no ajeno» y se acepta (ya no se compara palabra por palabra)', () => {
    const o = observacionDeLaMesa({ items: item, lecturas: lect({ texto_leido: ['NAUFRAGO', 'ENCEBOLLADO DE OLÓN'] }), marcasPropias: ['Náufrago'] })
    expect(o.aceptadas).toEqual({ hook: [0] }); expect(o.rechazadas).toEqual([])
  })
  it('🔴 #14 · el observador dice que hay texto ajeno: se rechaza con lo que se lee', () => {
    const o = observacionDeLaMesa({ items: item, lecturas: lect({ texto_leido: ['2x1 HOY'], texto_ajeno: true }) })
    expect(o.aceptadas).toEqual({}); expect(o.rechazadas[0].motivo).toMatch(/texto que la pieza no pidió: 2x1 HOY/)
  })
  it('🔴 #13 · Zero Risk (industria) · el observador dice que muestra un dato sin verificar (un sello ISO): se rechaza', () => {
    const o = observacionDeLaMesa({ items: item, lecturas: lect({ texto_leido: ['ISO 9001'], dato_sin_verificar: true }), marcasPropias: ['Zero Risk Seguridad Industrial'] })
    expect(o.aceptadas).toEqual({}); expect(o.rechazadas[0].motivo).toMatch(/dato que nadie verificó/)
  })
  it('🔴 sin una de las dos respuestas NO se acepta (nunca aprobada por omisión) y dice cuál faltó', () => {
    const sinTexto = observacionDeLaMesa({ items: item, lecturas: lect({ texto_ajeno: null }) })
    expect(sinTexto.aceptadas).toEqual({}); expect(sinTexto.rechazadas[0].motivo).toMatch(/no contestó si hay texto ajeno/)
    const sinDato = observacionDeLaMesa({ items: item, lecturas: lect({ dato_sin_verificar: null }) })
    expect(sinDato.aceptadas).toEqual({}); expect(sinDato.rechazadas[0].motivo).toMatch(/no contestó si muestra un dato sin verificar/)
    expect(sinDato.sin_lectura).toEqual([0])
  })
  it('🔴 sin lectura en REAL no se acepta; en un ENSAYO (el observador no mira) se acepta y queda anotada', () => {
    const vacia = { 0: { texto_leido: [], marcas: [], personas: 0, leido: false, texto_ajeno: null, dato_sin_verificar: null } }
    expect(observacionDeLaMesa({ items: item, lecturas: vacia }).aceptadas).toEqual({})
    const seco = observacionDeLaMesa({ items: item, lecturas: vacia, seco: true })
    expect(seco.aceptadas).toEqual({ hook: [0] }); expect(seco.sin_lectura).toEqual([0]); expect(seco.rechazadas).toEqual([])
  })
  it('la marca ajena sigue EXACTA (código), aunque el observador diga «no ajeno»', () => {
    const o = observacionDeLaMesa({ items: item, lecturas: lect({ marcas: ['Coca-Cola'] }), marcasPropias: ['Náufrago'] })
    expect(o.rechazadas[0].motivo).toMatch(/marca ajena: Coca-Cola/)
  })
})

describe('el paso completo del observador (cableado)', () => {
  const estado = () => {
    const art = (datos: unknown) => ({ version: 1, version_consumida: 0, datos })
    return {
      artefactos: {
        encargo: art({ F: { cliente_nombre: 'Náufrago', marca: { brand_handle: '@naufrago.ec' } } }),
        imagenes: art({ ultimo_intento: 1, items: [{ indice: 0, ref: 'hook', url: 'https://x.test/a.png', prompt: 'encebollado', intento: 1 }] }),
        copy_carrusel: art({ texto_base: 'Vine buscando oro', pie_de_foto: 'Encontré encebollado', hashtags: [] }),
        laminas: art({ laminas: [{ orden: 1, rol: 'hook', headline: 'Vine buscando oro' }] }),
      },
    }
  }
  const correr = async (texto: string, dry_run: boolean) => {
    const { observarImagenes } = await import('../mesa/observar')
    const pedidos: string[] = []
    const P = { revisor: async (p: { texto: string }) => { pedidos.push(p.texto); return { ok: true, texto, costo_usd: 0.004 } } }
    const r = await observarImagenes(P as never, { id: 'e', client_id: 'c', dry_run, estado_del_motor: estado() } as never, {} as never)
    return { r, pedidos, art: r.res.artefacto as { aceptadas: Record<string, number[]> }, fichas: (r.res.fichas ?? []) as Array<{ id: string; gravedad: string; problema?: string }> }
  }
  it('el pedido lleva el texto de la pieza', async () => {
    const { pedidos } = await correr('TEXTO_VISIBLE: ninguno\nMARCAS: ninguna\nPERSONAS: 0\nTEXTO_AJENO: no\nDATO_SIN_VERIFICAR: no', false)
    expect(pedidos[0]).toMatch(/Texto de la pieza: .*Vine buscando oro.*Encontré encebollado/)
  })
  it('🔴 real y el observador no contesta: la imagen no se acepta y la ficha BLOQUEA («no se pudo juzgar»)', async () => {
    const { art, fichas } = await correr('', false)
    expect(art.aceptadas).toEqual({})
    expect(fichas.find((f) => f.id === 'observador-hook')).toMatchObject({ gravedad: 'bloquea' })
    expect(JSON.stringify(fichas)).toMatch(/no se pudo juzgar/)
  })
  it('ensayo y el observador no mira: se acepta con un aviso que dice que en real no pasaría sola', async () => {
    const { art, fichas } = await correr('', true)
    expect(art.aceptadas).toEqual({ hook: [0] })
    expect(fichas.find((f) => f.id === 'observador-sin-lectura')).toMatchObject({ gravedad: 'sugerencia' })
    expect(fichas.some((f) => f.gravedad === 'bloquea')).toBe(false)
  })
})
