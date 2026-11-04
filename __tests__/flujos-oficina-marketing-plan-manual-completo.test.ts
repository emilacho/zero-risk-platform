/**
 * 04-nov · ENCARGO Lenovo «el plan como se diseñó» punto 1: el redactor del plan recibe el manual ENTERO (antes 6 datos: 1.682 de 46.511 caracteres) y el límite interno sube a 590.000.
 * Todo en seco, sin n8n ni modelo (US$ 0): corre el código real de «① GUARDA» con una fila de manual falsa.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { construirPlanManualCompleto, LIMITE_V3 } from '../scripts/ops/oficina-marketing/plan-manual-completo.mjs'

type Nodo = { name: string; parameters: Record<string, any> }
const ANTES = JSON.parse(readFileSync(join(process.cwd(), 'scripts/ops/oficina-marketing/respaldos/X9F0zp6LQ2xGEYVS-antes-de-manual-completo-2026-11-04.json'), 'utf8'))
const nuevo = () => { const f = structuredClone(ANTES.workflow || ANTES); construirPlanManualCompleto(f); return f as { nodes: Nodo[] } }
const codigo = (f: { nodes: Nodo[] }, n: string) => (f.nodes.find((x) => x.name === n) as Nodo).parameters.jsCode as string
const GUARDA = '① GUARDA · sin manual aprobado se DETIENE'

function correrGuarda(c: string, fila: Record<string, unknown>) {
  const dolar = () => ({ first: () => ({ json: { body: { client_id: 'c', dry_run: false } } }) })
  return new Function('$', '$input', '$env', '$execution', '$workflow', c)(dolar, { all: () => [{ json: fila }] }, {}, {}, {})[0].json
}

describe('plan · el manual completo llega al redactor', () => {
  const fila = { id: 'm1', client_id: 'c', gate_outcome: 'paso_la_vara', version: 5, provenance_tag: '{}', voice_description: 'voz', tone_guidelines: 'tono', writing_style: 'estilo', tagline: 'eslogan', positioning: 'pos', required_terminology: 't', content_text: 'X'.repeat(40000), primary_colors: ['#fff'], typography: { a: 1 }, created_at: 'z' }

  it('la guarda devuelve todos los campos del manual y conserva lo de antes', () => {
    const j = correrGuarda(codigo(nuevo(), GUARDA), fila)
    expect(Object.keys(j.contenido_del_manual).sort()).toEqual(['content_text', 'positioning', 'primary_colors', 'required_terminology', 'tagline', 'tone_guidelines', 'typography', 'voice_description', 'writing_style'])
    expect(j.contenido_del_manual.content_text.length).toBe(40000)
    expect(j.manual_aprobado).toBe(true)
    expect(j.manual_id).toBe('m1')
    expect(j.identidad_del_manual.primary_colors).toEqual(['#fff'])
  })
  it('no pasa claves internas ni campos vacíos', () => {
    const j = correrGuarda(codigo(nuevo(), GUARDA), { ...fila, positioning: '', tagline: null })
    for (const k of ['id', 'client_id', 'provenance_tag', 'created_at', 'gate_outcome', 'version', 'positioning', 'tagline']) expect(j.contenido_del_manual).not.toHaveProperty(k)
  })
  it('el límite del redactor sube a 590.000 y su estimación suma el manual', () => {
    const b4 = codigo(nuevo(), 'Redactor (B4)')
    expect(LIMITE_V3).toBe(590000)
    expect(b4).toContain('var _V3_LIMITE = 590000')
    expect(b4).not.toContain('var _V3_LIMITE = 110000')
    expect(b4).toContain('JSON.stringify((ent && ent.manual) || {})')
  })
  it('solo cambian esos dos nodos', () => {
    const a = (ANTES.workflow || ANTES).nodes as Nodo[], d = nuevo().nodes
    expect(d.filter((n, i) => JSON.stringify(n) !== JSON.stringify(a[i])).map((n) => n.name).sort()).toEqual(['Redactor (B4)', GUARDA].sort())
  })
})
