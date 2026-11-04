/**
 * 04-nov · barrido del manual: los 10 nodos «Equipo · …» del flujo del manual cortaban la tarea a 119.000 (tope viejo de 120.000); el real es 600.000. Todo en seco (US$ 0).
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { construirManualTopeReal, TOPE_TAREA_REAL } from '../scripts/ops/oficina-marketing/manual-tope-real.mjs'

type Nodo = { name: string; parameters: Record<string, any> }
const ANTES = JSON.parse(readFileSync(join(process.cwd(), 'scripts/ops/oficina-marketing/respaldos/ssLtwYPt7zxuvnM2-antes-de-tope-real-2026-11-04.json'), 'utf8'))
const antes = () => (ANTES.workflow || ANTES).nodes as Nodo[]
const nuevo = () => { const f = structuredClone(ANTES.workflow || ANTES); construirManualTopeReal(f); return f.nodes as Nodo[] }

describe('manual · tope de la tarea al máximo real', () => {
  it('los 10 nodos del Equipo cortan a 590.000 y ya no a 119.000', () => {
    const cambiados = nuevo().filter((n, i) => JSON.stringify(n) !== JSON.stringify(antes()[i]))
    expect(cambiados).toHaveLength(10)
    for (const n of cambiados) { expect(n.parameters.jsCode).toContain(`.slice(0, ${TOPE_TAREA_REAL})`); expect(n.parameters.jsCode).not.toContain('.slice(0, 119000)') }
    expect(TOPE_TAREA_REAL).toBe(590000)
  })
  it('solo cambia ese número', () => {
    nuevo().forEach((n, i) => { if (JSON.stringify(n) !== JSON.stringify(antes()[i])) expect(n.parameters.jsCode.split('.slice(0, 590000)').join('.slice(0, 119000)')).toBe(antes()[i].parameters.jsCode) })
  })
})
