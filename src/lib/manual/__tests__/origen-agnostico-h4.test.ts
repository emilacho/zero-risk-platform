/** H4 + H11 · las reglas de «origen» del manual no marcan historias de fundación ni personas como sujeto, en cuatro rubros; el control sigue marcando. Sin modelo. */
import { describe, expect, it } from 'vitest'
import { BATERIA_DE_RUBROS } from '../../rubros-de-prueba/baterias'
import { evaluarHechos } from '../hechos'
import { elObjetoEsUnBien } from '../lugares'
import { buscarCerteza, PALABRAS_DE_CERTEZA_ES } from '../palabras-de-certeza.es'
import { palabrasDe } from '../texto'

const marcaOrigen = (t: string) => buscarCerteza(palabrasDe(t), PALABRAS_DE_CERTEZA_ES).some((m) => m.id === 'origen')

describe.each(BATERIA_DE_RUBROS)('batería · $rubro ($pais, $registro)', (c) => {
  it.each(c.noMarcar)('NO marca: «%s»', (frase) => {
    const r = evaluarHechos({ manual: { positioning: frase }, fuentes: [], bienes: c.bienes })
    expect(r.hechos.map((h) => `${h.marcas}:${h.clausula}`), frase).toEqual([])
  })
  it.each(c.siMarcar)('SÍ marca (control): «%s»', (frase) => {
    const r = evaluarHechos({ manual: { positioning: frase }, fuentes: [], bienes: c.bienes })
    expect(r.sin_respaldo.length, frase).toBeGreaterThan(0)
  })
})

describe('H4 · las entradas sueltas de «origen» salieron; las que llevan objeto de certeza se quedan', () => {
  it.each(['Nuestro origen es humilde', 'El origen del nombre viene de una leyenda', 'Un origen familiar', 'Su origen es modesto'])('«%s» NO', (t) => expect(marcaOrigen(t)).toBe(false))
  it.each(['Origen verificable de cada material', 'El origen es la prueba', 'Con denominación de origen', 'Un origen geográfico específico'])('«%s» SÍ', (t) => expect(marcaOrigen(t)).toBe(true))
})

describe('H4 · la regla de lugar solo cuando el objeto es un bien', () => {
  it('personas como sujeto y fundación: no', () => {
    expect(elObjetoEsUnBien('Nuestros pacientes vienen de Quito')).toBe(false)
    expect(elObjetoEsUnBien('Empezamos en Cuenca con tres personas')).toBe(false)
    expect(elObjetoEsUnBien('Los clientes llegan de Lima')).toBe(false)
  })
  it('un bien: sí (por sustantivo general o por el catálogo del cliente)', () => {
    expect(elObjetoEsUnBien('Los repuestos llegan de Alemania')).toBe(true)
    expect(elObjetoEsUnBien('El origen de nuestros productos es Mendoza')).toBe(true)
    expect(elObjetoEsUnBien('El origen del malbec es Mendoza')).toBe(false)
    expect(elObjetoEsUnBien('El origen del malbec es Mendoza', ['malbec'])).toBe(true)
  })
})
