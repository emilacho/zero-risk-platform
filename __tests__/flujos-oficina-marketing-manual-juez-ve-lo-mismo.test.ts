/**
 * 04-nov · GO Lenovo «el juez recibe la misma información que el redactor»: corre el código REAL de «[BB] Judge prep» (antes y después) con la misma evidencia que recibe el redactor. Todo en seco (US$ 0).
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { construirJuezVeLoMismo } from '../scripts/ops/oficina-marketing/manual-juez-ve-lo-mismo.mjs'

type Nodo = { name: string; parameters: Record<string, any> }
const ANTES = JSON.parse(readFileSync(join(process.cwd(), 'scripts/ops/oficina-marketing/respaldos/ssLtwYPt7zxuvnM2-antes-de-juez-igual-2026-11-04.json'), 'utf8'))
const nuevo = () => { const f = structuredClone(ANTES.workflow || ANTES); construirJuezVeLoMismo(f); return f as { nodes: Nodo[] } }
const codigo = (f: { nodes: Nodo[] }) => (f.nodes.find((n) => n.name === '[BB] Judge prep') as Nodo).parameters.jsCode as string

const SITIO = 'S'.repeat(9000) + ' FIN_DEL_SITIO'
const IG = 'I'.repeat(2500) + ' FIN_IG'
const RESUMEN = 'R'.repeat(5000) + ' FIN_RESUMEN'
const grounding = {
  client_name: 'Cliente', industry: 'restaurante', discovery_summary: RESUMEN, business_model: 'cocina oculta con entregas',
  competitors: [{ name: 'Comp A', positioning: 'precio bajo' }, { name: 'Comp B', positioning: 'delivery rápido' }],
  apify_sources: [{ fuente: 'mapas', dato: 'ZONA_NORTE' }],
  icp_signals: { segments: ['Familias'], pain_points: ['P'.repeat(2500) + ' FIN_ICP'] },
  materia_cliente: { idioma: 'es', sitio_texto: SITIO, sitio_caracteres_total: SITIO.length, instagram_propio: IG },
}
function correr(c: string, reescritura?: Record<string, unknown>, g: Record<string, unknown> = grounding) {
  const dolar = () => ({ first: () => ({ json: { client_id: 'c', ...(reescritura ? { reescritura } : {}) } }) })
  const json = { brand_book_draft: { positioning: 'pos', icp_summary: 'icp', voice_description: 'voz', customer_angle: 'ca', retention_notes: 'rn' }, _grounding_refs: g, cycle: 1, _fidelity_cycle: 1 }
  return new Function('$', '$json', c)(dolar, json)[0].json
}

describe('manual · el juez ve lo mismo que el redactor', () => {
  it('ANTES recortaba: el resumen, el sitio y el Instagram no llegaban enteros', () => {
    const j = correr(codigo(ANTES.workflow ? { nodes: (ANTES.workflow).nodes } : ANTES))
    expect(j.judge_task).not.toContain('FIN_RESUMEN')
    expect(j.judge_task).not.toContain('FIN_DEL_SITIO')
  })
  it('AHORA el juez recibe entero: resumen, modelo de negocio, competidores en detalle, fuentes, ICP, sitio e Instagram', () => {
    const j = correr(codigo(nuevo()))
    for (const m of ['FIN_RESUMEN', 'cocina oculta con entregas', 'precio bajo', 'ZONA_NORTE', 'FIN_ICP', 'FIN_DEL_SITIO', 'FIN_IG']) expect(j.judge_task).toContain(m)
    expect(j._task_recortado).toBe(false)
    expect(j._materia_recortada).toBe(false)
    expect(j._icp_recortado).toBe(false)
  })
  it('una reescritura le suma lo que declaró el dueño, y no cambia nada de lo anterior', () => {
    const sin = correr(codigo(nuevo()))
    const con = correr(codigo(nuevo()), { cambios_del_dueno: 'Quiero sacar el delivery', campos_validados: ['tagline', 'vision'] })
    expect(sin.judge_task).not.toContain('LO QUE DECLARÓ EL DUEÑO')
    expect(con.judge_task).toContain('LO QUE DECLARÓ EL DUEÑO (manda sobre la investigación)')
    expect(con.judge_task).toContain('Quiero sacar el delivery')
    expect(con.judge_task).toContain('tagline, vision')
    expect(con.judge_task).toContain('FIN_DEL_SITIO')
  })
  it('la materia que viene del guardado declara su origen', () => {
    const j = correr(codigo(nuevo()), undefined, { ...grounding, materia_cliente: { ...grounding.materia_cliente, materia_origen: 'guardado' } })
    expect(j.judge_task).toContain('origen: guardado')
  })
  it('la vara y los campos puntuados no cambian; solo cambia «[BB] Judge prep»', () => {
    const a = (ANTES.workflow || ANTES).nodes as Nodo[]
    const c = codigo(nuevo())
    expect(c).toContain('const THRESHOLD = 0.85;')
    expect(c).toContain("'positioning', 'icp_summary', 'voice_description', 'customer_angle', 'retention_notes'")
    expect(nuevo().nodes.filter((n, i) => JSON.stringify(n) !== JSON.stringify(a[i])).map((n) => n.name)).toEqual(['[BB] Judge prep'])
  })
})
