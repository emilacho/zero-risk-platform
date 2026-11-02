// 01-nov · firma de Emilio: la duración y el tamaño de la tanda son de cada campaña; sin pedirlos, 90 días y 4 semanas.
import { describe, expect, it } from 'vitest'
import { DIAS_DE_CAMPANA, medidaDeCampana, SEMANAS_DE_TANDA, TOTAL_DE_TANDAS, TOTAL_SEMANAS } from '../constantes'
import { semanasDeTanda } from '../pasos'

describe('la medida de cada campaña', () => {
  it('sin datos vale lo de siempre', () => {
    expect(medidaDeCampana()).toEqual({ dias: DIAS_DE_CAMPANA, semanasPorTanda: SEMANAS_DE_TANDA, totalSemanas: TOTAL_SEMANAS, totalTandas: TOTAL_DE_TANDAS })
    expect(semanasDeTanda(1)).toEqual([1, 2, 3, 4])
    expect(semanasDeTanda(4)).toEqual([13])
  })
  it('una campaña de 90 días por fechas mide igual que la de siempre', () => {
    expect(medidaDeCampana({ fecha_inicio: '2026-10-12', fecha_fin: '2027-01-09' })).toEqual(medidaDeCampana())
  })
  it('🔴 una campaña de 30 días con tandas de 2 semanas se reparte en sus propias tandas', () => {
    const m = medidaDeCampana({ fecha_inicio: '2026-11-02', fecha_fin: '2026-12-01', semanas_de_tanda: 2 })
    expect(m).toEqual({ dias: 30, semanasPorTanda: 2, totalSemanas: 5, totalTandas: 3 })
    expect(semanasDeTanda(1, m)).toEqual([1, 2])
    expect(semanasDeTanda(3, m)).toEqual([5])
  })
  it('🔴 lo que no se puede leer no adivina: vale lo de siempre', () => {
    expect(medidaDeCampana({ fecha_inicio: 'x', fecha_fin: null, semanas_de_tanda: 0 })).toEqual(medidaDeCampana())
    expect(medidaDeCampana({ fecha_inicio: '2026-12-01', fecha_fin: '2026-11-01' }).dias).toBe(DIAS_DE_CAMPANA)
  })
})
