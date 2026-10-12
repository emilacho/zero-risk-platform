/** La función compartida de «palabra entera» (ronda 76) · casos trampa de CC#3 y la batería de rubros. */
import { describe, expect, it } from 'vitest'
import { BATERIA_DE_RUBROS } from '../../rubros-de-prueba/baterias'
import { familiasDelRubro } from '../../fuentes-publicas'
import { coincideAlguna, coincidePorPalabra, primeraClaveQueCoincide } from '../coincidencia'

describe('palabra entera: lo que NO coincide (las trampas del trozo de palabra)', () => {
  it.each([
    ['barbería', 'bar'], ['tienda de barrio', 'bar'], ['apicultura y miel', 'api'], ['autoescuela (carnet de conducir)', 'carne'],
    ['productora audiovisual', 'producto'], ['academia online de modalidad virtual', 'moda'], ['cafetera industrial', 'cafe'], ['parque', 'par'],
  ])('«%s» no contiene la palabra «%s»', (texto, clave) => { expect(coincidePorPalabra(texto, clave)).toBe(false) })
})

describe('palabra entera: lo que SÍ coincide', () => {
  it.each([
    ['Restaurante familiar', 'restaurante'], ['dos restaurantes', 'restaurante'], ['Cafetería', 'cafeteria'], ['hoteles de playa', 'hotel'], ['unas cabañas familiares', 'cabana'],
    ['agencia de viajes y tours', 'agencia de viajes'], ['consultoría', 'consultor*'], ['Clínica odontológica', 'odontolog*'], ['bar de jugos', 'bar'], ['manicura y pedicura', 'manicur*'],
  ])('«%s» contiene «%s»', (texto, clave) => { expect(coincidePorPalabra(texto, clave)).toBe(true) })
  it('la raíz con asterisco pide solo que la última palabra EMPIECE así; sin asterisco no hay raíz', () => {
    expect(coincidePorPalabra('odontología', 'odontolog')).toBe(false)
    expect(coincidePorPalabra('odontología', 'odontolog*')).toBe(true)
  })
  it('varias palabras: seguidas y enteras', () => {
    expect(coincidePorPalabra('agencia viajes', 'agencia de viajes')).toBe(false)
    expect(coincidePorPalabra('una agencia de viajes', 'agencia de viajes')).toBe(true)
  })
  it('lista: primera clave que coincide, o ninguna; entradas vacías no coinciden con nada', () => {
    expect(primeraClaveQueCoincide('taller mecánico de motos', ['bar', 'moto', 'motos'])).toBe('moto')
    expect(coincideAlguna('', ['bar'])).toBe(false); expect(coincidePorPalabra('algo', '')).toBe(false); expect(coincidePorPalabra(null, 'bar')).toBe(false)
  })
})

describe('familia de rubro del planificador de fuentes: palabra entera', () => {
  it.each([
    ['barbería', ['belleza_bienestar']], ['tienda de barrio', ['comercio']], ['apicultura y miel', ['general']], ['unas cabañas familiares', ['alojamiento']],
    ['autoescuela', ['educacion']], ['restaurante de mariscos costero', ['comida']], ['plataforma SaaS de gestión', ['software']], ['clínica dental', ['salud']], ['hotel boutique', ['alojamiento']],
  ])('«%s»', (rubro, esperadas) => { expect([...familiasDelRubro(rubro)].sort()).toEqual([...esperadas].sort()) })
  it('la batería de rubros cae en su familia', () => {
    const esperada: Record<string, string> = { comida: 'comida', clinica: 'salud', tienda_saas: 'comercio', servicio_b2b: 'servicios_profesionales' }
    const rubros: Record<string, string> = { comida: 'restaurante familiar', clinica: 'clínica dental', tienda_saas: 'tienda de ropa', servicio_b2b: 'consultora de ingeniería' }
    for (const c of BATERIA_DE_RUBROS) expect(familiasDelRubro(rubros[c.rubro]), c.rubro).toContain(esperada[c.rubro])
  })
})
