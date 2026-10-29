/**
 * P3 del encargo de correcciones (29-oct) · el observador externo NO rechaza la marca del PROPIO cliente como «marca ajena».
 * En la pieza real, la foto del hook se descartó con «marca ajena: Zero Risk» siendo Zero Risk el cliente. US$ 0, sin red.
 */
import { describe, expect, it } from 'vitest'
import { esMarcaPropia, observacionDeLaMesa, type LecturaDelObservador } from '../mesa/evidencia'

const lectura = (marcas: string[], texto: string[] = []): LecturaDelObservador => ({ texto_leido: texto, marcas, personas: 0, leido: true })
const uno = [{ indice: 0, ref: 'hook' }]
const CLIENTE = 'Zero Risk Seguridad Industrial'

describe('¿es la marca del propio cliente?', () => {
  it('el nombre corto que ve el observador está dentro del nombre de la ficha («Zero Risk» ⊂ «Zero Risk Seguridad Industrial»)', () => {
    expect(esMarcaPropia('Zero Risk', [CLIENTE])).toBe(true)
    expect(esMarcaPropia('ZERO RISK', [CLIENTE])).toBe(true)
    expect(esMarcaPropia('Zero Risk Seguridad Industrial', ['Zero Risk'])).toBe(true)
  })
  it('el usuario de la marca y el nombre exacto también', () => {
    expect(esMarcaPropia('@zerorisk.ec', ['@zerorisk.ec'])).toBe(true)
    expect(esMarcaPropia('Náufrago', ['Naufrago'])).toBe(true)
  })
  it('una marca de OTRO negocio no pasa por propia, aunque comparta una palabra suelta', () => {
    expect(esMarcaPropia('Coca-Cola', [CLIENTE])).toBe(false)
    expect(esMarcaPropia('Risk Control', [CLIENTE])).toBe(false)
    expect(esMarcaPropia('Zero', [CLIENTE])).toBe(false)
    expect(esMarcaPropia('Zero Industrial Group', [CLIENTE])).toBe(false)
  })
  it('un nombre de cliente vacío o de dos letras no deja pasar nada', () => {
    expect(esMarcaPropia('Nike', ['', 'ab'])).toBe(false)
    expect(esMarcaPropia('', [CLIENTE])).toBe(false)
  })
})

describe('el cotejo de la mesa con el nombre del cliente', () => {
  it('la foto cuya única marca es «Zero Risk» se ACEPTA cuando el cliente es Zero Risk Seguridad Industrial', () => {
    const o = observacionDeLaMesa({ items: uno, lecturas: { 0: lectura(['Zero Risk']) }, permitido: ['zero risk'], marcasPropias: ['@zerorisk', CLIENTE] })
    expect(o.rechazadas).toEqual([])
    expect(o.aceptadas).toEqual({ hook: [0] })
  })
  it('sigue rechazando la marca AJENA aunque venga junto a la propia', () => {
    const o = observacionDeLaMesa({ items: uno, lecturas: { 0: lectura(['Zero Risk', 'Nike']) }, permitido: ['zero risk'], marcasPropias: [CLIENTE] })
    expect(o.rechazadas).toHaveLength(1)
    expect(o.rechazadas[0].motivo).toMatch(/marca ajena: Nike/)
    expect(o.rechazadas[0].motivo).not.toMatch(/Zero Risk/)
  })
  it('sin el nombre del cliente entre las propias, el caso real SÍ se rechazaba (la prueba del arreglo)', () => {
    const o = observacionDeLaMesa({ items: uno, lecturas: { 0: lectura(['Zero Risk']) }, permitido: ['zero risk'], marcasPropias: ['@zerorisk'] })
    expect(o.rechazadas[0]?.motivo).toMatch(/marca ajena: Zero Risk/)
  })
})

describe('el paso del observador completo recibe el nombre del cliente (cableado)', () => {
  const estadoConImagen = (nombre: string) => {
    const art = (datos: unknown) => ({ version: 1, version_consumida: 0, datos })
    return {
      artefactos: {
        encargo: art({ F: { cliente_nombre: nombre, marca: { brand_handle: '@zerorisk.ec' } } }),
        imagenes: art({ ultimo_intento: 1, items: [{ indice: 0, ref: 'hook', url: 'https://x.test/a.png', prompt: 'extintores', intento: 1 }] }),
        copy_carrusel: art({ texto_base: 'hola', pie_de_foto: 'pie', hashtags: [] }),
        laminas: art({ laminas: [{ orden: 1, rol: 'hook', headline: 'hola' }] }),
      },
    }
  }
  const correr = async (nombre: string) => {
    const { observarImagenes } = await import('../mesa/observar')
    const P = { revisor: async () => ({ ok: true, texto: 'TEXTO_VISIBLE: ninguno\nMARCAS: Zero Risk\nPERSONAS: 0', costo_usd: 0.004 }) }
    const enc = { id: 'e', client_id: 'c', dry_run: false, estado_del_motor: estadoConImagen(nombre) }
    return observarImagenes(P as never, enc as never, {} as never)
  }
  it('cliente «Zero Risk Seguridad Industrial»: la foto con su propia marca se acepta', async () => {
    const r = await correr(CLIENTE)
    const art = r.res.artefacto as { aceptadas: Record<string, number[]>; rechazadas: unknown[] }
    expect(art.rechazadas).toEqual([])
    expect(art.aceptadas).toEqual({ hook: [0] })
  })
  it('cliente de OTRO nombre: la misma marca SÍ es ajena y se rechaza', async () => {
    const r = await correr('Pizzería Don Luis')
    const art = r.res.artefacto as { rechazadas: Array<{ motivo: string }> }
    expect(art.rechazadas[0].motivo).toMatch(/marca ajena: Zero Risk/)
  })
})
