/**
 * Tests · Brand Book collaborative-track rewire (worker LyVoKcrypS5uLyuu · CC#4 2026-06-29).
 *
 * Valida los invariantes estructurales del worker reescrito (SPEC brand-book
 * colaborativo cero-humano): el brand_book sale del gate Camino III y corre en
 * un track propio post-FASE-2 que decide canon por FIDELIDAD (no por voto).
 * §148 evidence · cubre el nuevo track sin tocar el worker live.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const DIR = join(process.cwd(), 'scripts/worker-staging/LyVoKcrypS5uLyuu/brand-book-track')
const worker = JSON.parse(readFileSync(join(DIR, 'rewired-worker.json'), 'utf8')) as {
  nodes: Array<{ name: string; type: string; parameters: Record<string, unknown> }>
  connections: Record<string, { main?: Array<Array<{ node: string }>> }>
}
const nodeByName = (n: string) => worker.nodes.find((x) => x.name === n)
const targets = (from: string, out = 0) =>
  (worker.connections[from]?.main?.[out] ?? []).map((c) => c.node)
const readNode = (f: string) => readFileSync(join(DIR, 'nodes', f), 'utf8')

const NEW_NODES = [
  '[BB] Fan-out prep',
  'Lente · brand-strategist',
  'Lente · editor-en-jefe',
  'Lente · jefe-client-success',
  '[BB] Consolidador',
  '[BB] Lazo A · corrección (sub-wf)',
  '[BB] Faithfulness judge',
  '[BB] IF · fidelidad PASS',
  '[BB] IF · ciclos agotados',
  '[BB] Promote → canon',
  '[BB] HITL último recurso (no Emilio)',
]

describe('brand-book rewire · nodos del nuevo track', () => {
  it('agrega los 11 nodos del track colaborativo', () => {
    for (const n of NEW_NODES) expect(nodeByName(n), `falta nodo ${n}`).toBeDefined()
  })
  it('preserva los 51 nodos base (no borra nada del worker) · total 62', () => {
    expect(worker.nodes.length).toBe(62)
  })
})

describe('brand-book rewire · cableado del track (fuera del gate Camino III)', () => {
  const AGG = '[APIFY-WIRE] Aggregate Service responses (onboarding_e2e)'
  it('Aggregate (FASE 2) dispara el Fan-out prep · track propio', () => {
    expect(targets(AGG)).toContain('[BB] Fan-out prep')
  })
  it('Fan-out → 3 lentes en paralelo', () => {
    const t = targets('[BB] Fan-out prep')
    expect(t).toEqual(
      expect.arrayContaining(['Lente · brand-strategist', 'Lente · editor-en-jefe', 'Lente · jefe-client-success']),
    )
  })
  it('3 lentes → consolidador (maker)', () => {
    for (const l of ['Lente · brand-strategist', 'Lente · editor-en-jefe', 'Lente · jefe-client-success']) {
      expect(targets(l)).toContain('[BB] Consolidador')
    }
  })
  it('consolidador → lazo A corrección → judge', () => {
    expect(targets('[BB] Consolidador')).toContain('[BB] Lazo A · corrección (sub-wf)')
    expect(targets('[BB] Lazo A · corrección (sub-wf)')).toContain('[BB] Faithfulness judge')
  })
  it('judge → IF fidelidad · PASS(true)→promote · FAIL(false)→IF ciclos agotados', () => {
    expect(targets('[BB] Faithfulness judge')).toContain('[BB] IF · fidelidad PASS')
    expect(targets('[BB] IF · fidelidad PASS', 0)).toContain('[BB] Promote → canon') // true
    expect(targets('[BB] IF · fidelidad PASS', 1)).toContain('[BB] IF · ciclos agotados') // false
  })
  it('ciclos agotados? sí→HITL último recurso · no→re-síntesis (back-edge al consolidador)', () => {
    expect(targets('[BB] IF · ciclos agotados', 0)).toContain('[BB] HITL último recurso (no Emilio)')
    expect(targets('[BB] IF · ciclos agotados', 1)).toContain('[BB] Consolidador')
  })
})

describe('brand-book rewire · canon por fidelidad, NO por Camino III', () => {
  it('Promote → canon escribe brand_book gateado por fidelity.pass (no camino_iii)', () => {
    const code = readNode('promote-to-canon.js')
    expect(code).toContain('fidelity.pass')
    expect(code).toContain('/api/clients/')
    expect(code).toContain('/brand-book')
    expect(code).toContain('fidelity_passed: true')
    expect(code).not.toMatch(/camino_iii_approved:\s*true/)
  })
  it('el viejo Persist Canon ya NO persiste brand_book (marcado deprecado)', () => {
    const old = nodeByName('Persist Canon · brand_book + ICP + analysis')
    expect(old).toBeDefined()
    expect(String(old!.parameters.jsCode)).toContain('[BB-REWIRE 2026-06-29]')
  })
  it('faithfulness judge usa umbral ≥0.85 y per-field (LLM-judge DIY)', () => {
    const code = readNode('faithfulness-judge.js')
    expect(code).toContain('0.85')
    expect(code).toContain('low_fields')
    // consejero §2 · LLM-judge DIY in-stack (gateway run-sdk) · NO paquete Python.
    expect(code).toContain('/api/agents/run-sdk')
    expect(code).not.toMatch(/require\(['"][^'"]*(ragas|deepeval)|import[^\n]*(ragas|deepeval)/i)
  })
})

describe('brand-book rewire · node code parsea como JS válido', () => {
  for (const f of ['synthesis-fanout-prep.js', 'consolidator.js', 'faithfulness-judge.js', 'promote-to-canon.js']) {
    it(`${f} es JS sintácticamente válido`, () => {
      const code = readNode(f)
      // los Code nodes corren como cuerpo async · envolvemos para validar sintaxis.
      expect(() => new Function('$json', '$', '$env', '$execution', '$items', `return (async()=>{${code}})`)).not.toThrow()
    })
  }
})
