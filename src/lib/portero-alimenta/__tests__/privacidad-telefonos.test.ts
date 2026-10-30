import { describe, expect, it } from 'vitest'
import { sinDatosPersonales } from '../dueno'

const sale = (t: string) => sinDatosPersonales(t).texto

describe('filtro de privacidad · teléfonos por su forma, no por su largo (30-oct)', () => {
  it.each([
    ['precio $1.250.000 el combo'],
    ['cuesta 1.250,50 USD'],
    ['cuesta USD 45000'],
    ['código de producto 1234567'],
    ['SKU 123456789 en bodega'],
    ['ref 4501234567 del proveedor'],
    ['pedido 123-456-789'],
    ['venta del 12/03/2025'],
    ['fecha 2025-10-30'],
    ['tiene 12.000 seguidores'],
    ['vendimos 500000 unidades'],
    ['S/ 1 200 000 de facturación'],
    ['unos 20 clientes al mediodía'],
    ['meta de 2500000 pesos'],
  ])('deja intacto: %s', (t) => {
    const r = sinDatosPersonales(t)
    expect(r.redactado).toBe(false)
    expect(r.texto).toBe(t)
  })

  it.each([
    ['EC internacional', 'escríbele al +593 99 123 4567'],
    ['EC móvil pegado', 'su número es 0991234567'],
    ['EC móvil con espacios', 'dile al 099 123 4567'],
    ['EC fijo con paréntesis', 'oficina (02) 234 5678'],
    ['CO móvil', 'WhatsApp 3001234567'],
    ['CO internacional', 'es el +57 300 123 4567'],
    ['MX con espacios', 'su cel 55 1234 5678'],
    ['PE con espacios', 'el contacto es 987 654 321'],
    ['CL internacional', 'su fono +56 9 8765 4321'],
    ['ES internacional', 'llámale al +34 612 34 56 78'],
    ['AR con guion', 'tel 11 5555-1234'],
    ['UY internacional', 'su cel +598 99 123 456'],
    ['con palabra de contacto', 'llama al 2345678'],
  ])('quita: %s', (_n, t) => {
    const r = sinDatosPersonales(t)
    expect(r.redactado).toBe(true)
    expect(r.texto).toContain('[teléfono omitido]')
    expect(r.texto).not.toMatch(/\d{6}/)
  })

  it('en un mismo texto quita el teléfono y deja el precio y el código', () => {
    const r = sinDatosPersonales('El combo cuesta $1.250.000, código 4501234567; para pedir llama al 0991234567.')
    expect(r.texto).toContain('$1.250.000')
    expect(r.texto).toContain('4501234567')
    expect(r.texto).not.toContain('0991234567')
  })

  it('correos y @usuarios se siguen quitando', () => {
    const r = sinDatosPersonales('juan.perez@mail.com y @juanp')
    expect(r.texto).toBe('[correo omitido] y [usuario omitido]')
  })
})
