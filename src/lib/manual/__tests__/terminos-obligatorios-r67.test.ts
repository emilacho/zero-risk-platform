/** Ronda 67 · la lista de términos OBLIGATORIOS entra al chequeo de hechos (en el tramo 1 se coló «origen verificable» ahí). Cliente sintético: una clínica dental inventada. Sin modelo. */
import { describe, expect, it } from 'vitest'
import { CAMPOS_EXCLUIDOS, evaluarHechos } from '../hechos'
import { recomprobar } from '../firmes'
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
  it('un término con certeza y sin fuente («trazabilidad verificable») se detecta; el texto y las listas se quedan', () => {
    const m = manual()
    expect(evaluarHechos({ manual: m, fuentes: [propia] }).sin_respaldo.map((h) => h.clausula)).toEqual(['trazabilidad verificable'])
    const r = recomprobar({}, m, { fuentes: [propia] })
    expect(r.manual.required_terminology).toEqual(m.required_terminology)
    expect(r.retirados).toEqual([])
    expect(r.manual.forbidden_words).toEqual(['barato', 'garantizado', 'el mejor'])
    expect(r.manual.positioning).toBe('Clínica dental de barrio.')
  })
})
