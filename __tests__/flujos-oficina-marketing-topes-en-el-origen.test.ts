/**
 * 04-nov · parte C del GO «el juez ve lo mismo»: límites al máximo en el ORIGEN (alta: sitio 3.500→200.000, Instagram 8.000→100.000; lentes del manual: 14.000→590.000). Todo en seco (US$ 0).
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { construirTopeLentes, construirTopesAlta, TOPE_IG_ORIGEN, TOPE_LENTES, TOPE_SITIO_ORIGEN } from '../scripts/ops/oficina-marketing/topes-en-el-origen.mjs'

type Nodo = { name: string; parameters: Record<string, any> }
const leer = (n: string) => { const j = JSON.parse(readFileSync(join(process.cwd(), 'scripts/ops/oficina-marketing/respaldos', n), 'utf8')); return (j.workflow || j) as { nodes: Nodo[] } }
const ALTA = leer('LyVoKcrypS5uLyuu-antes-de-topes-origen-2026-11-04.json'), MANUAL = leer('ssLtwYPt7zxuvnM2-antes-de-topes-lentes-2026-11-04.json')
const cambia = (a: { nodes: Nodo[] }, b: { nodes: Nodo[] }) => a.nodes.filter((n, i) => JSON.stringify(n) !== JSON.stringify(b.nodes[i])).map((n) => n.name)
const TRANSFORM = '[JEFATURA] Transform discovery→package'

describe('límites al máximo en el origen', () => {
  it('alta: el sitio ya no se corta a 3.500 ni el Instagram a 8.000; el corte, si ocurre, se declara', () => {
    const f = structuredClone(ALTA); construirTopesAlta(f)
    const c = (f.nodes.find((n) => n.name === TRANSFORM) as Nodo).parameters.jsCode as string
    expect(c).not.toContain('slice(0, 3500)'); expect(c).not.toContain('slice(0, 8000)')
    expect(c).toContain(`_t.slice(0, ${TOPE_SITIO_ORIGEN})`); expect(c).toContain(`_d.slice(0, ${TOPE_IG_ORIGEN})`)
    expect(c).toContain('[recortado por la cabeza: se leyeron')
    expect(cambia(ALTA, f)).toEqual([TRANSFORM])
    // el sitio de Náufrago (40.353) entra entero
    const corre = (len: number) => new Function('_t', `return _t.length > ${TOPE_SITIO_ORIGEN} ? 'CORTADO' : _t`)('x'.repeat(len))
    expect(corre(40353)).toHaveLength(40353)
  })
  it('lentes del manual: el tope base sube a 590.000 y nada más en «[BB] Fan-out prep»', () => {
    const f = structuredClone(MANUAL); construirTopeLentes(f)
    const c = (f.nodes.find((n) => n.name === '[BB] Fan-out prep') as Nodo).parameters.jsCode as string
    expect(c).toContain(`const TOPE_TASK = ${TOPE_LENTES} + REGLAS_EVIDENCIA_R62.length`)
    expect(c).not.toContain('const TOPE_TASK = 14000')
    expect(cambia(MANUAL, f)).toEqual(['[BB] Fan-out prep'])
  })
})
