/**
 * 19-nov · ADENDA 1 · P2b · el calendario recibe del brief VALIDADO el «Público» y los «Hechos de las ofertas», enteros (CC5).
 * Sin el nuevo orden (sin gran idea) o sin brief, la tarea es la de siempre. Sin red, US$ 0.
 */
import { describe, expect, it } from 'vitest'
import { clienteA, contextoDe } from '../__fixtures__/clientes'
import { delBriefParaElCalendario } from '../brief-creativo'
import { tareaDeCalendario } from '../indicaciones'

const A = clienteA()
const ctx = contextoDe(A)
const HECHOS = Array.from({ length: 300 }, (_, i) => `- oferta ${i + 1}: dato ${i + 1} (ficha:o${i + 1})`).join('\n')
const MD = ['## Insight', 'algo', '## Público', 'Quien vive cerca y decide rápido.', '## Hechos de las ofertas', HECHOS, '## Tono', 'Cercano.'].join('\n')
const concepto = { leido: { contrato: 'concepto.v1', gran_idea: { nombre: 'X', frase: 'Y' }, por_que_funciona: '', como_se_ve: '', como_suena: '', capitulos: [], banco: [], ideas_descartadas: [] } as never, version: 1 }
const base = { ctx, estrategia: A.estrategia, tanda: 1, semanas: [1], filasPrevias: [] }

describe('ADENDA 1 · P2b · el brief al calendario', () => {
  it('el lector del brief saca las dos secciones enteras (300 hechos, ninguno cortado)', () => {
    const b = delBriefParaElCalendario(MD)
    expect(b.publico).toBe('Quien vive cerca y decide rápido.')
    expect(b.hechos_de_las_ofertas).toBe(HECHOS)
  })
  it('🔴 con la gran idea y el brief: el <documento> del brief va en la tarea, con las dos secciones enteras', () => {
    const t = tareaDeCalendario({ ...base, concepto, brief: delBriefParaElCalendario(MD) } as never)
    expect(t).toContain('<documento fuente="el brief de la campaña">\n## Público\nQuien vive cerca y decide rápido.\n\n## Hechos de las ofertas\n' + HECHOS + '\n</documento>')
  })
  it('sin gran idea (orden viejo) o sin brief: la tarea es la de siempre, byte a byte', () => {
    expect(tareaDeCalendario({ ...base, brief: delBriefParaElCalendario(MD) } as never)).toBe(tareaDeCalendario(base as never))
    expect(tareaDeCalendario({ ...base, concepto, brief: null } as never)).toBe(tareaDeCalendario({ ...base, concepto } as never))
    expect(tareaDeCalendario({ ...base, concepto } as never)).not.toContain('# EL BRIEF DE LA CAMPAÑA')
  })
})
