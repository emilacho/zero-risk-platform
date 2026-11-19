/**
 * 19-nov · caso 3 del grupo 2 (nada se frena) · ¿la pieza está en una campaña? Sin campaña, la jefatura manda sus correcciones al creador DE LA PIEZA
 * (la vuelta a la mesa de #1182) en vez de a la cadena. Solo se decide con lo que se SABE.
 */
import { describe, expect, it } from 'vitest'
import { piezaSinCampana } from '../orquestador'

const P = (parte: () => Promise<{ texto: string; campana_id?: string | null } | null>) => ({ parte: async () => parte() })

describe('piezaSinCampana', () => {
  it('🔴 sin parte: sin campaña', async () => {
    expect(await piezaSinCampana(P(async () => ({ texto: 'x', campana_id: 'cmp-1' })), { parte_id: null, client_id: 'c' })).toBe(true)
  })
  it('🔴 un parte leído sin campaña (null, vacía o ausente): sin campaña', async () => {
    for (const campana_id of [null, '', '   ', undefined]) expect(await piezaSinCampana(P(async () => ({ texto: 'x', campana_id })), { parte_id: 'p-1', client_id: 'c' }), String(campana_id)).toBe(true)
    expect(await piezaSinCampana(P(async () => null), { parte_id: 'p-1', client_id: 'c' })).toBe(true)
  })
  it('🔴 un parte en una campaña: CON campaña (las correcciones van a la cadena, como siempre)', async () => {
    expect(await piezaSinCampana(P(async () => ({ texto: 'x', campana_id: 'cmp-1' })), { parte_id: 'p-1', client_id: 'c' })).toBe(false)
  })
  it('🔴 si la lectura del parte falla, no se decide nada: queda como antes (con campaña) y la espera de la cadena lo vuelve a mirar', async () => {
    expect(await piezaSinCampana(P(async () => { throw new Error('base caída') }), { parte_id: 'p-1', client_id: 'c' })).toBe(false)
  })
})
