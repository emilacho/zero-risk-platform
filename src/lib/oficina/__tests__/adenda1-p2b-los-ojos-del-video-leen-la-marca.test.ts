/**
 * 19-nov · ADENDA 1 · P2b (CC5): los ojos del video (el agente que mira el clip antes de la jefatura) reciben el manual y el plan ENTEROS,
 * cada uno en su <documento fuente>, después de la fila del brief. Sin ellos, el pedido es el de siempre. Sin red, US$ 0.
 */
import { describe, expect, it } from 'vitest'
import { tareaDeLaMirada } from '../video/mirada'

const base = { cuadros: [], planos: [], segundos: 10, brief_texto: 'LA FILA', red: 'instagram', formato: 'reel', contrato: '{}' }
const MANUAL = 'm'.repeat(80_000) + ' FIN-DEL-MANUAL'
const PLAN = 'p'.repeat(80_000) + ' FIN-DEL-PLAN'

describe('ADENDA 1 · P2b · la mirada del video lee la marca', () => {
  it('🔴 el manual y el plan llegan enteros, en su <documento>, después de la fila del brief', () => {
    const { task } = tareaDeLaMirada({ ...base, manual_texto: MANUAL, plan_texto: PLAN })
    expect(task).toContain(`## El manual de marca del cliente\n<documento fuente="el manual de marca">\n${MANUAL}\n</documento>`)
    expect(task).toContain(`## El plan de trabajo del cliente\n<documento fuente="el plan">\n${PLAN}\n</documento>`)
    expect(task.indexOf('LA FILA')).toBeLessThan(task.indexOf('FIN-DEL-MANUAL'))
    expect(task.indexOf('FIN-DEL-PLAN')).toBeLessThan(task.indexOf('## Tu trabajo'))
  })
  it('sin manual ni plan, el pedido es el de siempre', () => {
    expect(tareaDeLaMirada({ ...base }).task).toBe(tareaDeLaMirada({ ...base, manual_texto: '', plan_texto: null }).task)
    expect(tareaDeLaMirada({ ...base }).task).not.toContain('<documento')
  })
})
