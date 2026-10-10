/** los ladrillos de texto: lo que las demás pruebas dan por sentado */
import { describe, expect, it } from 'vitest'
import { contenidoCompartido, contenidoDe, normalizar, palabrasDe, partirEnClausulas, partirEnFrases } from '..'

describe('texto', () => {
  it('normalizar tolera nulos y números; palabrasDe parte por espacios normalizados', () => {
    expect(normalizar(null)).toBe(''); expect(normalizar(undefined)).toBe(''); expect(normalizar(12.5)).toBe('12 5')
    expect(palabrasDe('  Hola,   MUNDO ')).toEqual(['hola', 'mundo'])
    expect(palabrasDe('')).toEqual([])
  })
  it('contenidoDe: palabras de ≥ 3 letras y sin relleno (las de 3 letras SÍ cuentan, las de 2 no, el relleno no)', () => {
    expect(contenidoDe('el dos de las casas y un no')).toEqual(['dos', 'casas'])
    expect(contenidoDe('ab cd ef')).toEqual([])
    expect(contenidoDe('con sin sobre entre')).toEqual([])
    expect(contenidoDe('')).toEqual([])
  })
  it('contenidoCompartido cuenta palabras DISTINTAS que comparten dos textos', () => {
    expect(contenidoCompartido('casa grande casa', 'una casa grande y bonita')).toBe(2)
    expect(contenidoCompartido('perro', 'gato')).toBe(0)
  })
  it('partirEnFrases y partirEnClausulas: vacío ⇒ nada; una palabra sola es una cláusula; la puntuación final no forma parte de la cláusula', () => {
    expect(partirEnFrases('')).toEqual([]); expect(partirEnFrases(null)).toEqual([])
    expect(partirEnClausulas('Único, claro.')).toEqual(['Único', 'claro'])
    expect(partirEnClausulas('...')).toEqual([])
    expect(partirEnClausulas('Una (dos) tres')).toEqual(['Una', 'dos', 'tres'])
  })
})
