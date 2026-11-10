/**
 * Lista única de dependencias entre documentos (motor de colaterales · tramo 1 · CC1 · certifica CC7).
 * Criterios: CRITERIOS-CC1-a-LENOVO-CC7-CC6-colaterales-aceptacion-antes-de-construir (+ corrección 2 de CC7: el mapa no es una fila).
 */
import { describe, it, expect } from 'vitest'
import { DOCUMENTOS, LEE, afectados, aguasArriba, esDocumento, loLeenDirecto, puedeProponer, type Documento } from '../dependencias-de-documentos'

describe('qué lee cada documento (sacado del código que lo arma)', () => {
  it('cada documento lee exactamente lo que su paso carga', () => {
    expect(LEE).toEqual({
      manual: [],
      plan: ['manual'],
      estrategia: ['plan', 'manual'],
      brief: ['plan', 'manual', 'estrategia'],
      gran_idea: ['brief', 'estrategia', 'manual', 'plan'],
      calendario: ['gran_idea', 'estrategia', 'manual', 'plan'],
      pieza: ['calendario', 'gran_idea', 'brief', 'manual', 'plan'],
    })
  })

  it('nadie lee algo que viene después en la cadena (sin ciclos) ni se lee a sí mismo', () => {
    for (const d of DOCUMENTOS) {
      for (const leido of LEE[d]) {
        expect(DOCUMENTOS.indexOf(leido), `${d} lee ${leido}`).toBeLessThan(DOCUMENTOS.indexOf(d))
      }
    }
  })

  it('sin repetidos en lo que lee cada uno', () => {
    for (const d of DOCUMENTOS) expect(new Set(LEE[d]).size).toBe(LEE[d].length)
  })
})

describe('corrección 2 de CC7 · el mapa no es una fila', () => {
  it('el manual lo leen DIRECTO el plan, la estrategia, el brief, la gran idea, el calendario y las piezas', () => {
    expect(loLeenDirecto('manual')).toEqual(['plan', 'estrategia', 'brief', 'gran_idea', 'calendario', 'pieza'])
  })
  it('el brief lo leen directo la gran idea y las piezas (no el calendario)', () => {
    expect(loLeenDirecto('brief')).toEqual(['gran_idea', 'pieza'])
  })
  it('las piezas no las lee nadie', () => {
    expect(loLeenDirecto('pieza')).toEqual([])
  })
})

describe('afectados · lo que un cambio puede desalinear, en orden de la cadena', () => {
  const casos: Array<[Documento, Documento[]]> = [
    ['manual', ['plan', 'estrategia', 'brief', 'gran_idea', 'calendario', 'pieza']],
    ['plan', ['estrategia', 'brief', 'gran_idea', 'calendario', 'pieza']],
    ['estrategia', ['brief', 'gran_idea', 'calendario', 'pieza']],
    ['brief', ['gran_idea', 'calendario', 'pieza']],
    ['gran_idea', ['calendario', 'pieza']],
    ['calendario', ['pieza']],
    ['pieza', []],
  ]
  it.each(casos)('%s → %j', (doc, esperado) => {
    expect(afectados(doc)).toEqual(esperado)
  })
  it('nunca incluye al propio documento', () => {
    for (const d of DOCUMENTOS) expect(afectados(d)).not.toContain(d)
  })
})

describe('aguas arriba · donde el motor NUNCA propone (regla «nunca» n.º 7)', () => {
  it('el brief depende del manual, el plan y la estrategia', () => {
    expect(aguasArriba('brief')).toEqual(['manual', 'plan', 'estrategia'])
  })
  it('las piezas dependen de todo lo demás', () => {
    expect(aguasArriba('pieza')).toEqual(['manual', 'plan', 'estrategia', 'brief', 'gran_idea', 'calendario'])
  })
  it('el manual no depende de nada', () => {
    expect(aguasArriba('manual')).toEqual([])
  })
  it('aguas arriba y afectados nunca se cruzan, y entre los dos más el propio cubren la cadena', () => {
    for (const d of DOCUMENTOS) {
      const arriba = aguasArriba(d), abajo = afectados(d)
      expect(arriba.filter((x) => abajo.includes(x))).toEqual([])
      expect(new Set([...arriba, ...abajo, d]).size).toBe(DOCUMENTOS.length)
    }
  })
  it('puedeProponer: brief → gran idea sí; brief → manual o plan no; un documento sobre sí mismo no', () => {
    expect(puedeProponer('brief', 'gran_idea')).toBe(true)
    expect(puedeProponer('brief', 'manual')).toBe(false)
    expect(puedeProponer('brief', 'plan')).toBe(false)
    expect(puedeProponer('brief', 'brief')).toBe(false)
    expect(puedeProponer('manual', 'pieza')).toBe(true)
  })
})

describe('esDocumento', () => {
  it('acepta los 7 y rechaza lo demás', () => {
    for (const d of DOCUMENTOS) expect(esDocumento(d)).toBe(true)
    for (const x of ['concepto', 'Manual', '', null, undefined, 3]) expect(esDocumento(x)).toBe(false)
  })
})
