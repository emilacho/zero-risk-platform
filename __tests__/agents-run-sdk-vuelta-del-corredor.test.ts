/**
 * Relevo 41 · #461 · el reenvío de `cerrada_por_tope` y de la salida estructurada en la respuesta de /api/agents/run-sdk
 * (única mutación viva de CC#3: quitar el reenvío no hacía fallar nada).
 */
import { describe, it, expect } from 'vitest'
import { camposDeLaVueltaDelCorredor } from '@/app/api/agents/run-sdk/route'

describe('la vuelta del corredor en la respuesta de run-sdk', () => {
  it('sin nada de lo opcional, la respuesta de siempre (ninguna llave nueva)', () => {
    expect(camposDeLaVueltaDelCorredor({})).toEqual({})
    expect(camposDeLaVueltaDelCorredor({ cerradaPorTope: false })).toEqual({})
  })
  it('`cerrada_por_tope` viaja SOLO cuando pasó (true), nunca como false', () => {
    expect(camposDeLaVueltaDelCorredor({ cerradaPorTope: true })).toEqual({ cerrada_por_tope: true })
  })
  it('el objeto estructurado y su validez viajan juntos; un objeto inválido NO se descarta ni se arregla', () => {
    expect(camposDeLaVueltaDelCorredor({ structuredOutputValid: true, structuredOutput: { a: 1 } })).toEqual({ structured_output_valid: true, structured_output: { a: 1 } })
    expect(camposDeLaVueltaDelCorredor({ structuredOutputValid: false, structuredOutput: { a: 1 } })).toEqual({ structured_output_valid: false, structured_output: { a: 1 } })
  })
  it('`valid: false` sin objeto sigue viajando (el flujo debe poder leer «se pidió y no hubo»); un objeto null también', () => {
    expect(camposDeLaVueltaDelCorredor({ structuredOutputValid: false })).toEqual({ structured_output_valid: false })
    expect(camposDeLaVueltaDelCorredor({ structuredOutput: null })).toEqual({ structured_output: null })
  })
  it('las tres llaves a la vez', () => {
    expect(Object.keys(camposDeLaVueltaDelCorredor({ cerradaPorTope: true, structuredOutputValid: true, structuredOutput: {} })).sort()).toEqual(['cerrada_por_tope', 'structured_output', 'structured_output_valid'])
  })
})
