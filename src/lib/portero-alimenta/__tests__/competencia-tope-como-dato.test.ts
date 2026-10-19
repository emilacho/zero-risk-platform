/**
 * El tope de competidores por sede es un DATO de la ficha del cliente (`config.apify.tope_competidores_por_sede`), por omisión 10 (19-oct: con 5 fijo, 26 candidatos de Náufrago
 * quedaban «en duda» solo por cupo). US$ 0 · sin red · nada a la medida de un cliente.
 */
import { describe, expect, it } from 'vitest'
import { aplicarGuardasDeCompetencia, topeDeCompetidoresDeSede, MAX_COMPETIDORES_POR_SEDE } from '../brazos/juez-competencia'
import { debeEvaluarse, hayCupoParaLosDegradados } from '../brazos/sistematica'
import type { Candidato } from '../brazos/descubrir'

const cand = (i: number): Candidato => ({ nombre: `C${i}`, slug: `c${i}`, hechos: `categoría Marisquería ${i}` } as unknown as Candidato)
const respuesta = (n: number) => JSON.stringify({ decisiones: Array.from({ length: n }, (_, i) => ({ n: i + 1, veredicto: 'competidor', cita: `categoría Marisquería ${i}`, razon: 'sí' })) })

describe('el tope por sede, como dato', () => {
  it('por omisión 10; un número es del cliente; un objeto manda por sede y «por_defecto»; lo inválido se ignora', () => {
    expect(MAX_COMPETIDORES_POR_SEDE).toBe(10)
    expect(topeDeCompetidoresDeSede({}, 'olon')).toBe(10)
    expect(topeDeCompetidoresDeSede(null, 'olon')).toBe(10)
    expect(topeDeCompetidoresDeSede({ apify: { tope_competidores_por_sede: 7 } }, 'olon')).toBe(7)
    expect(topeDeCompetidoresDeSede({ apify: { tope_competidores_por_sede: '8' } }, 'olon')).toBe(8)
    const t = { apify: { tope_competidores_por_sede: { olon: 4, por_defecto: 12 } } }
    expect(topeDeCompetidoresDeSede(t, 'olon')).toBe(4)
    expect(topeDeCompetidoresDeSede(t, 'guayaquil')).toBe(12)
    expect(topeDeCompetidoresDeSede({ apify: { tope_competidores_por_sede: { olon: 0 } } }, 'olon')).toBe(10)
    for (const malo of [0, -3, 2.5, 'mucho', true, [], NaN]) expect(topeDeCompetidoresDeSede({ apify: { tope_competidores_por_sede: malo } }, 'olon')).toBe(10)
    expect(topeDeCompetidoresDeSede({ apify: { tope_competidores_por_sede: 5000 } }, 'olon')).toBe(50)
  })

  it('el cupo se aplica con el tope del cliente y lo degradado por cupo dice degradada_por «tope» (no es una duda real)', () => {
    const muchos = Array.from({ length: 14 }, (_, i) => cand(i))
    const por10 = aplicarGuardasDeCompetencia(muchos, respuesta(14))
    expect(por10.filter((x) => x.veredicto === 'competidor')).toHaveLength(10)
    expect(por10.filter((x) => x.degradada_por === 'tope')).toHaveLength(4)
    const por3 = aplicarGuardasDeCompetencia(muchos, respuesta(14), 3)
    expect(por3.filter((x) => x.veredicto === 'competidor')).toHaveLength(3)
    expect(por3.filter((x) => x.degradada_por === 'tope')).toHaveLength(11)
    // una duda real del modelo NO se marca como cupo
    const mezcla = aplicarGuardasDeCompetencia([cand(0), cand(1)], JSON.stringify({ decisiones: [{ n: 1, veredicto: 'duda', razon: 'no sé' }, { n: 2, veredicto: 'competidor', cita: 'categoría Marisquería 1', razon: 'sí' }] }), 1)
    expect(mezcla[0].degradada_por).toBeUndefined()
    expect(mezcla[1].veredicto).toBe('competidor')
  })
})

describe('re-evaluar lo degradado por cupo en la próxima corrida normal', () => {
  const ficha = (clase: string, sede: string, extra: Record<string, unknown> = {}, dias = 5) => ({ clase, observado_en: new Date(Date.parse('2026-10-19T12:00:00Z') - dias * 864e5).toISOString(), provenance_tag: { datos: { sede, veredicto: clase === 'competidor_vigilado' ? 'competidor' : 'duda', ...extra } } })
  const ahora = new Date('2026-10-19T12:30:00Z')
  const vigilados = (n: number) => Array.from({ length: n }, () => ficha('competidor_vigilado', 'olon'))
  const viejas = [ficha('competidor_evaluacion', 'olon', { degradada_por: 'fuera de los 5 primeros por puntuación' }), ficha('competidor_evaluacion', 'olon', { degradada_por: 'tope' })]

  it('con 5 vigilados, dos degradadas por cupo (texto viejo o nuevo) y tope 10: se vuelve a evaluar aunque la última evaluación sea de hace 5 días', () => {
    const v = [...vigilados(5), ...viejas] as never
    expect(hayCupoParaLosDegradados(v, 'olon', 10)).toBe(true)
    expect(debeEvaluarse(v, 'olon', ahora, false, [], 10)).toBe(true)
  })
  it('con el cupo lleno NO se repite cada día (cuesta una llamada); sin degradados tampoco; sin tope dado se comporta como antes', () => {
    expect(debeEvaluarse([...vigilados(10), ...viejas] as never, 'olon', ahora, false, [], 10)).toBe(false)
    expect(debeEvaluarse([...Array.from({ length: 5 }, () => ficha('competidor_vigilado', 'olon', { tope_aplicado: 10 })), ficha('competidor_evaluacion', 'olon', { tope_aplicado: 10, degradada_por: 'sin cita literal en los hechos del candidato' })] as never, 'olon', ahora, false, [], 10)).toBe(false)
    expect(debeEvaluarse([...vigilados(5), ...viejas] as never, 'olon', ahora, false, [])).toBe(false)
  })
  it('evaluaciones de ANTES (sin motivo guardado): 5 vigilados y dudas del mismo día se re-evalúan UNA vez; la evaluación nueva trae tope_aplicado y ya no se repite', () => {
    const hoy = '2026-10-17T12:00:00.000Z'
    const f = (clase: string, v: string, extra: Record<string, unknown> = {}) => ({ clase, observado_en: hoy, provenance_tag: { datos: { sede: 'olon', veredicto: v, ...extra } } })
    const viejas5 = [...Array.from({ length: 5 }, () => f('competidor_vigilado', 'competidor')), ...Array.from({ length: 9 }, () => f('competidor_evaluacion', 'duda'))] as never
    expect(hayCupoParaLosDegradados(viejas5, 'olon', 10)).toBe(true)
    expect(hayCupoParaLosDegradados(viejas5, 'olon', 5)).toBe(false) // el cliente pidió 5: nada que re-evaluar
    const nuevas = [...Array.from({ length: 5 }, () => f('competidor_vigilado', 'competidor', { tope_aplicado: 10 })), ...Array.from({ length: 9 }, () => f('competidor_evaluacion', 'duda', { tope_aplicado: 10 }))] as never
    expect(hayCupoParaLosDegradados(nuevas, 'olon', 10)).toBe(false)
    // una sede sin vigilados (solo dudas) no es un caso de cupo
    expect(hayCupoParaLosDegradados(Array.from({ length: 8 }, () => f('competidor_evaluacion', 'duda')) as never, 'olon', 10)).toBe(false)
  })
  it('otra sede no se mezcla', () => {
    expect(hayCupoParaLosDegradados([...vigilados(5), ...viejas] as never, 'guayaquil', 10)).toBe(false)
  })
})
