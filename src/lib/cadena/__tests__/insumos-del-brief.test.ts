/**
 * `insumosDelBrief` · los insumos del verificador del brief, armados en UN solo lugar (la mesa, la revalidación y los colaterales).
 * Dos contextos de rubros distintos: cada uno con sus prohibidas, su registro y sus redes (una apagada).
 */
import { describe, expect, it } from 'vitest'
import { insumosDelBrief } from '../brief-creativo'

const A = { planTexto: 'plan A', manualTexto: 'manual A', forbiddenWords: ['barato'], palabrasDuras: ['gratis'], registro: 'tu' as const }
const B = { planTexto: 'plan B', manualTexto: 'manual B', forbiddenWords: ['garantizado', 'el mejor'], palabrasDuras: [], registro: 'usted' as const }

describe('insumosDelBrief', () => {
  it('lleva plan, manual, prohibidas, duras y registro de CADA cliente, y solo las redes que la estrategia usa', () => {
    expect(insumosDelBrief(A, [{ red: 'instagram', rol: 'principal' }, { red: 'tiktok', rol: 'no' }, { red: 'facebook', rol: 'replica' }] as never)).toEqual({
      planTexto: 'plan A', manualTexto: 'manual A', prohibidas: ['barato'], duras: ['gratis'], redes: ['instagram', 'facebook'], registro: 'tu',
    })
    expect(insumosDelBrief(B, [{ red: 'linkedin', rol: 'principal' }, { red: 'youtube', rol: 'no' }] as never)).toEqual({
      planTexto: 'plan B', manualTexto: 'manual B', prohibidas: ['garantizado', 'el mejor'], duras: [], redes: ['linkedin'], registro: 'usted',
    })
  })

  it('sin contexto ni canales no inventa nada: plan vacío, sin prohibidas, sin redes', () => {
    expect(insumosDelBrief(null, null)).toEqual({ planTexto: '', manualTexto: undefined, prohibidas: [], duras: undefined, redes: [], registro: undefined })
  })
})
