/** El rubro se clasifica por el NEGOCIO del cliente (la cabeza de la descripción), no por su clientela (ronda 78 · §C.3 de CC#3). Función única de palabra entera por debajo. */
import { describe, expect, it } from 'vitest'
import { lexicoDeLaIndustria } from '../../cadena/lexico-por-rubro'
import { familiasDelRubro } from '../../fuentes-publicas'
import { cabezaDelNegocio, coincideConElNegocio, gruposDelNegocio } from '../negocio-del-cliente'

describe('la cabeza del negocio', () => {
  it.each([
    ['software para restaurantes', 'software'], ['Escuela de pastelería', 'escuela'], ['consultora para ferreterías', 'consultora'], ['clínica dental', 'clinica dental'],
    ['hotel con restaurante', 'hotel con restaurante'], ['restaurante de mariscos costero', 'restaurante'], ['para empresas', 'para empresas'],
  ])('«%s» → «%s»', (d, h) => { expect(cabezaDelNegocio(d)).toBe(h) })
})

describe('sondas de CC#3 §C.3 · familia del planificador de fuentes', () => {
  it.each([
    ['software para restaurantes', ['software']], ['marketing para pizzerías', ['servicios_profesionales']], ['consultora para ferreterías', ['servicios_profesionales']],
    ['escuela de pastelería', ['educacion']], ['academia de cocina', ['educacion']], ['estudio de decoración de eventos', ['general']], ['consultoría agrícola', ['servicios_profesionales']],
  ])('«%s» → %j', (d, esperado) => { expect([...familiasDelRubro(d)].sort()).toEqual([...esperado].sort()) })
  it('lo de siempre sigue: el negocio mismo y las frases de negocio completas', () => {
    expect(familiasDelRubro('restaurante de mariscos costero ecuatoriano')).toEqual(['comida'])
    expect(familiasDelRubro('agencia de viajes')).toContain('turismo')
    expect(familiasDelRubro('hotel con restaurante')).toEqual(expect.arrayContaining(['alojamiento', 'comida']))
    expect(familiasDelRubro('tienda de ropa')).toEqual(['comercio'])
    expect(familiasDelRubro('barbería')).toEqual(['belleza_bienestar'])
  })
  it('si la cabeza no reconoce nada se vuelve a la descripción entera', () => {
    expect(familiasDelRubro('servicios de limpieza')).toEqual(['servicios_hogar'])
    expect(familiasDelRubro('')).toEqual(['general'])
  })
})

describe('sondas de CC#3 §C.3 · paquetes de léxico de la cadena (misma regla)', () => {
  const conAlimentos = (d: string) => JSON.stringify(lexicoDeLaIndustria(d)) !== JSON.stringify(lexicoDeLaIndustria('plataforma digital'))
  it('el negocio de comida SÍ recibe su paquete; quien le vende a restaurantes, escuelas de cocina y laboratorios NO', () => {
    expect(conAlimentos('restaurante familiar')).toBe(true)
    for (const d of ['software para restaurantes', 'marketing para pizzerías', 'escuela de pastelería', 'academia de cocina']) expect(conAlimentos(d), d).toBe(false)
  })
  it('gruposDelNegocio: cabeza primero, entera después', () => {
    const g = { a: ['panaderia'], b: ['software'] }
    expect(gruposDelNegocio('software para panaderias', g)).toEqual(['b'])
    expect(gruposDelNegocio('negocio de panaderia', g)).toEqual(['a'])
    expect(coincideConElNegocio('agencia de viajes', ['agencia de viajes'])).toBe(true)
  })
})

describe('una cabeza de dos palabras con un negocio conocido al frente: la segunda lo califica', () => {
  it.each([['consultoría agrícola', ['servicios_profesionales']], ['laboratorio de alimentos', ['salud']], ['hotel boutique', ['alojamiento']], ['clínica dental', ['salud']], ['restaurante familiar', ['comida']]])('familia de «%s» → %j', (d, e) => {
    expect([...familiasDelRubro(d)].sort()).toEqual([...e].sort())
  })
  it('cadena: consultoría agrícola y laboratorio de alimentos NO reciben el paquete de alimentos', () => {
    const base = JSON.stringify(lexicoDeLaIndustria('plataforma digital'))
    for (const d of ['consultoría agrícola', 'laboratorio de alimentos']) expect(JSON.stringify(lexicoDeLaIndustria(d)), d).toBe(base)
  })
})
