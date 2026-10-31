/** ENSANCHE de `propiosDeFicha` (31-oct · regla única «¿es del cliente?»): ahora también lee `config.own_social_handles`. Prueba APARTE, a propósito: el contrato `Propios {sitio, handles}` no cambia, solo se amplía la lista. */
import { describe, expect, it } from 'vitest'
import { propiosDeFicha } from '../cliente'

describe('propiosDeFicha · ensanche con own_social_handles', () => {
  it('sin own_social_handles todo queda exactamente como antes', () => {
    expect(propiosDeFicha({ website_url: 'https://www.clinicaejemplo.test', config: { apify: { own_handles: { instagram: '@clinicaejemplo', facebook: 'https://www.facebook.com/clinicaejemplo/' } } } }))
      .toEqual({ sitio: 'https://www.clinicaejemplo.test', handles: ['clinicaejemplo', 'clinicaejemplo'].slice(0, 1) })
  })
  it('suma las cuentas puestas por una persona a las del descubridor, sin repetir', () => {
    const p = propiosDeFicha({ website_url: null, config: { own_social_handles: { tiktok: '@ejemplotk', instagram: 'ejemplo' }, apify: { own_handles: { instagram: '@ejemplo' } } } })
    expect(p.handles.sort()).toEqual(['ejemplo', 'ejemplotk'])
    expect(p.sitio).toBeNull()
  })
  it('una cuenta de una persona NO la pisa la del descubridor con la misma red', () => {
    const p = propiosDeFicha({ config: { own_social_handles: { instagram: 'humana' }, apify: { own_handles: { instagram: 'descubierta' } } } })
    expect(p.handles.sort()).toEqual(['descubierta', 'humana'])
  })
  it('valores vacíos o que no son texto se ignoran', () => {
    expect(propiosDeFicha({ config: { own_social_handles: { x: 5, y: '  ' }, apify: { own_handles: { z: null } } } }).handles).toEqual([])
  })
})
