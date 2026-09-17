/**
 * 🔴 E87 · UNA RESPUESTA PERDIDA NO ES ÉXITO (arreglo C de E86 · puntos b y d).
 *
 * Medido en la bolita (E83/E86): la conexión de la función a corredor se perdió, el `catch` final
 * devolvió `{"error":"terminated"}` SIN `success:false`, y la puerta con aviso de vuelta lo leyó
 * como éxito (`success !== false`) ⇒ `agent_dispatches` quedó «completed» 21 s ANTES de que el
 * empleado terminara y el flujo recibió ese cuerpo como si fuera la respuesta.
 *
 * Ahora: éxito SÓLO si `success === true`; todo lo demás viaja marcado `success:false` + causa.
 */
import { describe, it, expect } from 'vitest'
import { innerResponseIsSuccess, markInnerBodyAsNotSuccess } from '@/app/api/agents/run-sdk/route'

const PERDIDA = { error: 'terminated' } // el cuerpo literal de la bolita (140135 · Competitor Verdict)

describe('E87 · innerResponseIsSuccess · sólo success:true es éxito', () => {
  it('la respuesta perdida de la bolita NO es éxito', () => {
    expect(innerResponseIsSuccess(PERDIDA)).toBe(false)
  })
  it('éxito de verdad', () => {
    expect(innerResponseIsSuccess({ success: true, response: 'x', agent: 'a' })).toBe(true)
  })
  it('sin success · success:false · null · texto · arreglo · vacío ⇒ NO', () => {
    for (const b of [{ response: 'x' }, { success: false }, null, undefined, 'ok', [{ success: true }], {}, { success: 'true' }]) {
      expect(innerResponseIsSuccess(b), JSON.stringify(b)).toBe(false)
    }
  })
})

describe('E87 · markInnerBodyAsNotSuccess · lo que viaja al flujo va marcado', () => {
  it('la respuesta perdida sale con success:false · error_kind response_lost · el cuerpo original adjunto', () => {
    const m = markInnerBodyAsNotSuccess(PERDIDA)
    expect(m.success).toBe(false)
    expect(m.error).toBe('terminated')
    expect(m.error_kind).toBe('response_lost')
    expect(m.inner).toEqual(PERDIDA)
  })
  it('un cuerpo sin success ni error ⇒ success:false · response_not_success', () => {
    const m = markInnerBodyAsNotSuccess({ response: 'algo' })
    expect(m.success).toBe(false)
    expect(m.error_kind).toBe('response_not_success')
    expect(typeof m.error).toBe('string')
  })
  it('un success:false ya marcado pasa tal cual', () => {
    const b = { success: false, error: 'x', error_kind: 'inner_run_threw' }
    expect(markInnerBodyAsNotSuccess(b)).toBe(b)
  })
  it('null / texto ⇒ objeto marcado, nunca un dato', () => {
    for (const b of [null, 'texto', 42]) {
      const m = markInnerBodyAsNotSuccess(b)
      expect(m.success).toBe(false)
      expect(m.error_kind).toBe('response_not_success')
    }
  })
})
