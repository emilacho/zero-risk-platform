/** Ronda 67 · la lista de términos OBLIGATORIOS entra al chequeo de hechos (en el tramo 1 se coló «origen verificable» ahí). Cliente sintético: una clínica dental inventada. Sin modelo. */
import { describe, expect, it } from 'vitest'
import { CAMPOS_EXCLUIDOS, evaluarHechos } from '../hechos'
import { cerrarPuerta } from '../firmes'
import { F } from './apoyo'

const manual = () => ({
  positioning: 'Clínica dental de barrio.',
  required_terminology: ['cita previa', 'implantes', 'trazabilidad verificable', 'atención cercana'],
  forbidden_words: ['barato', 'garantizado', 'el mejor'],
})
const propia = F('s', 'primaria_propia', 'Atendemos con cita previa. Hacemos implantes. Atención cercana siempre.', 'sitio')

describe('required_terminology se chequea; forbidden_words no', () => {
  it('ya no está excluida; forbidden_words sí (son palabras que el manual PROHÍBE, no afirma)', () => {
    expect(CAMPOS_EXCLUIDOS).not.toContain('required_terminology')
    expect(CAMPOS_EXCLUIDOS).toContain('forbidden_words')
  })
  it('un término con certeza y sin fuente («trazabilidad verificable») sale; los demás se quedan; el elemento no queda vacío ni como hueco', () => {
    const m = manual()
    const informe = evaluarHechos({ manual: m, fuentes: [propia] })
    const cierre = cerrarPuerta(m, informe)
    expect(cierre.manual.required_terminology).toEqual(['cita previa', 'implantes', 'atención cercana'])
    expect(cierre.retirados.map((r) => r.clausula)).toEqual(['trazabilidad verificable'])
    expect(cierre.manual.forbidden_words).toEqual(['barato', 'garantizado', 'el mejor']) // intacta
    expect(cierre.manual.positioning).toBe('Clínica dental de barrio.')
  })
  it('sin ninguna fuente, los términos sin marca de hecho siguen intactos (solo sale lo que afirma)', () => {
    const m = manual()
    const cierre = cerrarPuerta(m, evaluarHechos({ manual: m, fuentes: [] }))
    expect(cierre.manual.required_terminology).toEqual(['cita previa', 'implantes', 'atención cercana'])
  })
})
