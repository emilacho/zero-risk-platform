/**
 * 🔴 E93 · EL PUNTO DE CONSULTA DEL DESCUBRIMIENTO NUNCA ENTREGA UN TEXTO RECORTADO COMO SI FUERA ENTERO.
 *
 * Medido (E91 · CC#3): `output_summary` se guarda recortado a 2.000 + «…» y el punto de consulta lo
 * servía como `response` sin decir nada. En la bolita (corrida 140135) el alta recibió 2.001 caracteres
 * de 4.545 y de 22.888. La fila declara el largo real en `metadata.response_length`: se compara y se declara.
 *
 * Fija con la evidencia REAL: fila recortada ⇒ el lector se entera (complete:false + nota); fila entera ⇒
 * complete:true; fila vieja sin largo declarado ⇒ «no sé» (null) y se dice.
 */
import { describe, it, expect } from 'vitest'
import { describeStoredResponse } from '@/app/api/onboarding/discovery-status/[clientId]/route'

const guardado = (n: number, marca = '…') => 'x'.repeat(n) + marca

describe('E93 · describeStoredResponse · lo guardado vs lo real', () => {
  it('evidencia 140135 · descubridor 1: 2.000+«…» guardados de 4.545 ⇒ RECORTADA · el lector se entera', () => {
    const r = describeStoredResponse(guardado(2000), { response_length: 4545 })
    expect(r.complete).toBe(false)
    expect(r.truncated).toBe(true)
    expect(r.stored_length).toBe(2001)
    expect(r.real_length).toBe(4545)
    expect(r.note).toMatch(/RESPUESTA RECORTADA · guardados 2000 de 4545 caracteres \(44 %\)/)
    expect(r.note).toMatch(/NO leer como entera/)
  })
  it('evidencia 140135 · re-descubrimiento: 2.000+«…» de 22.888 (se perdió el 91 %)', () => {
    const r = describeStoredResponse(guardado(2000), { response_length: 22888 })
    expect(r.complete).toBe(false)
    expect(r.note).toMatch(/2000 de 22888 caracteres \(9 %\)/)
  })
  it('evidencia 140135 · veredicto de competidores: 1.730 de 1.730 ⇒ ENTERA · sin nota', () => {
    const r = describeStoredResponse('y'.repeat(1730), { response_length: 1730 })
    expect(r.complete).toBe(true)
    expect(r.truncated).toBe(false)
    expect(r.note).toBeNull()
  })
  it('fila vieja sin response_length ⇒ «no sé» (null) y se dice · con «…» se sospecha', () => {
    const sin = describeStoredResponse(guardado(2000), null)
    expect(sin.complete).toBeNull()
    expect(sin.truncated).toBeNull()
    expect(sin.note).toMatch(/LARGO DESCONOCIDO/)
    expect(sin.note).toMatch(/probablemente recortada/)
    const sinMarca = describeStoredResponse('texto corto', {})
    expect(sinMarca.complete).toBeNull()
    expect(sinMarca.note).not.toMatch(/probablemente/)
  })
  it('un texto que termina en «…» pero cuyo largo declarado coincide NO se declara recortado (la marca es pista, no prueba)', () => {
    const r = describeStoredResponse('bueno…', { response_length: 5 })
    expect(r.complete).toBe(true)
  })
  it('sin texto guardado: 0 de N ⇒ recortada · null/undefined no rompen', () => {
    expect(describeStoredResponse('', { response_length: 300 }).truncated).toBe(true)
    expect(describeStoredResponse(null, { response_length: 0 }).complete).toBe(true)
    expect(describeStoredResponse(undefined, undefined).complete).toBeNull()
  })
  it('response_length inválido (texto · negativo) ⇒ «no sé», no un dato', () => {
    expect(describeStoredResponse('abc', { response_length: '3' }).complete).toBeNull()
    expect(describeStoredResponse('abc', { response_length: -1 }).complete).toBeNull()
  })
})
