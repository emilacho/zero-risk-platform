/**
 * 19-nov · ADENDA 1 · P2b (CC5): en # REFERENCIAS de la cadena, el plan y el manual no se repiten si el pedido ya los trae ENTEROS arriba
 * (# PLAN · # MANUAL DE MARCA): queda su id para citarlo. El que el pedido no trae arriba (el calendario no trae el manual) sigue entero. Sin red, US$ 0.
 */
import { describe, expect, it } from 'vitest'
import { tareaDeCalendario, tareaDeEstrategia } from '../indicaciones'
import { clienteA, contextoDe } from '../__fixtures__/clientes'

const A = clienteA()
const ctx = contextoDe(A)
const veces = (t: string, s: string) => t.split(s).length - 1
const refs = (t: string) => t.slice(t.indexOf('# REFERENCIAS'), t.indexOf('\n# ', t.indexOf('# REFERENCIAS') + 3))

describe('ADENDA 1 · P2b · las referencias no repiten el plan ni el manual', () => {
  it('🔴 estrategia: el plan y el manual salen UNA vez (en su documento); en REFERENCIAS queda el id y dónde está', () => {
    const t = tareaDeEstrategia({ ctx, formatosPermitidos: {}, version: 1 })
    expect(veces(t, ctx.planTexto)).toBe(1)
    expect(veces(t, ctx.manualTexto)).toBe(1)
    expect(refs(t)).toContain('- plan-a [plan]: (el plan entero: está en «# PLAN»)')
    expect(refs(t)).toContain('- manual-a [manual]: (el manual entero: está en «# MANUAL DE MARCA»)')
    expect(refs(t)).toContain('- ficha-precio [ficha, firmada]: El café de la casa cuesta $2,50.')
  })
  it('🔴 calendario: no trae el manual arriba, así que en REFERENCIAS el manual sigue entero', () => {
    const t = tareaDeCalendario({ ctx, estrategia: A.estrategia, tanda: 1, semanas: [1], filasPrevias: [] } as never)
    expect(refs(t)).toContain('- manual-a [manual]: Tono cercano. Café de la casa. Servimos desayunos.')
    expect(refs(t)).toContain('- plan-a [plan]: (el plan entero: está en «# PLAN»)')
    expect(t).toContain('# PLAN\n<documento fuente="el plan">')
  })
})
