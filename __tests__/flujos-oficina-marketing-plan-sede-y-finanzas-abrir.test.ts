/**
 * 04-nov · puntos 4 y 5 de CC1 (parte de CC2): la sede en la fila de la tabla del redactor y el `trabajo_id` al abrir el encargo de finanzas. Todo en seco (US$ 0).
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { construirPlanSedeYFinanzasAbrir } from '../scripts/ops/oficina-marketing/plan-sede-y-finanzas-abrir.mjs'

type Nodo = { name: string; parameters: Record<string, any> }
const ANTES = JSON.parse(readFileSync(join(process.cwd(), 'scripts/ops/oficina-marketing/respaldos/X9F0zp6LQ2xGEYVS-antes-de-paso0-siempre-2026-11-04.json'), 'utf8'))
const nuevo = () => { const f = structuredClone(ANTES.workflow || ANTES); construirPlanSedeYFinanzasAbrir(f); return f as { nodes: Nodo[] } }
const nodo = (f: { nodes: Nodo[] }, n: string) => f.nodes.find((x) => x.name === n) as Nodo

describe('plan · sede en la tabla y trabajo_id al abrir finanzas', () => {
  it('la fila de la tabla dice la sede', () => {
    const c = nodo(nuevo(), 'Redactor (B4)').parameters.jsCode as string
    expect(c).toContain("(d.sede ? ' · sede ' + d.sede : '')")
    expect(c).toContain("d.id, d.tipo_id + (d.atributo ? ' (' + d.atributo + ')' : '') + (d.sede")
  })
  it('abrir finanzas manda el tipo y el id de la corrida; sin pre-vuelo queda vacío sin caerse', () => {
    const jb = nodo(nuevo(), 'FIN · abrir la conversación').parameters.jsonBody as string
    expect(jb).toContain("accion: 'abrir', trabajo_tipo: 'plan', trabajo_id: (function () { try { const r = $('V9 · pre-vuelo').all();")
    expect(jb).toContain("client_id: $json.client_id")
  })
  it('solo cambian esos dos nodos', () => {
    const a = (ANTES.workflow || ANTES).nodes as Nodo[]
    expect(nuevo().nodes.filter((n, i) => JSON.stringify(n) !== JSON.stringify(a[i])).map((n) => n.name).sort()).toEqual(['FIN · abrir la conversación', 'Redactor (B4)'])
  })
})
