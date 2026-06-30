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
  const TRIGGER = 'Confirm barato · competitor list'
  it('el track branchea desde un nodo INCONDICIONAL post-discovery (no Aggregate · fix 40856)', () => {
    // corre siempre tras el Discovery Parser · independiente del competitor verdict.
    expect(targets(TRIGGER)).toContain('[BB] Fan-out prep')
    // NO desde Aggregate (que hereda el gate "proceder" y no corre en "observar"→HITL).
    expect(targets('[APIFY-WIRE] Aggregate Service responses (onboarding_e2e)')).not.toContain('[BB] Fan-out prep')
  })
  it('Cal.com kickoff tiene continueOnFail (un error no aborta el journey · fix 40856)', () => {
    const cal = nodeByName('Schedule Kickoff Call (Cal.com)') as { continueOnFail?: boolean } | undefined
    expect(cal?.continueOnFail).toBe(true)
  })
  it('las 3 lentes mandan auth x-api-key a run-sdk (fix exec 41381 "Authorization failed")', () => {
    for (const l of ['Lente · brand-strategist', 'Lente · editor-en-jefe', 'Lente · jefe-client-success']) {
      const hp = JSON.stringify((nodeByName(l) as { parameters: { headerParameters?: unknown } }).parameters.headerParameters ?? {})
      expect(hp).toContain('x-api-key')
      expect(hp).toContain('INTERNAL_API_KEY')
    }
  })
  it('Fan-out → 3 lentes en paralelo', () => {
    const t = targets('[BB] Fan-out prep')
    expect(t).toEqual(
      expect.arrayContaining(['Lente · brand-strategist', 'Lente · editor-en-jefe', 'Lente · jefe-client-success']),
    )
  })
  it('Fix B · cada lente lee SU task del item único ($json.tasks.<lente>) · no mis-routing', () => {
    for (const lens of ['brand-strategist', 'editor-en-jefe', 'jefe-client-success']) {
      const node = nodeByName('Lente · ' + lens) as { parameters: { jsonBody?: string } }
      expect(node.parameters.jsonBody).toContain("$json.tasks['" + lens + "']")
    }
    // el prep emite UN item con `tasks` (no 3 items que n8n manda a todos los nodos).
    const prep = readNode('synthesis-fanout-prep.js')
    expect(prep).toContain('return [{ json: { tasks')
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
  it('Fix A · el judge emite scores vía emit_fidelity_scores y los lee de body.fidelity_scores', () => {
    const code = readNode('faithfulness-judge.js')
    expect(code).toContain('emit_fidelity_scores')
    expect(code).toContain('body.fidelity_scores')
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

// ── Lazo A · sub-workflow de corrección (paso 4 · consejero §1) ──────────────
const SUBDIR = join(DIR, 'correction-subworkflow')
const subwf = JSON.parse(readFileSync(join(SUBDIR, 'correction-subworkflow.json'), 'utf8')) as {
  nodes: Array<{ name: string }>
  connections: Record<string, { main?: Array<Array<{ node: string }>> }>
}
const subNode = (n: string) => subwf.nodes.find((x) => x.name === n)
const subTargets = (from: string, out = 0) =>
  (subwf.connections[from]?.main?.[out] ?? []).map((c) => c.node)
const readSub = (f: string) => readFileSync(join(SUBDIR, 'nodes', f), 'utf8')

describe('Lazo A · sub-workflow de corrección', () => {
  const SUB_NODES = [
    'Lazo A · trigger (Execute Workflow)', '[BBA] Review prep',
    'Revisor · brand-strategist', 'Revisor · editor-en-jefe', 'Revisor · jefe-client-success',
    '[BBA] Merge corrections', '[BBA] IF · seguir corrigiendo', '[BBA] Re-síntesis', '[BBA] Exit · borrador final',
  ]
  it('tiene los 9 nodos del lazo', () => {
    for (const n of SUB_NODES) expect(subNode(n), `falta ${n}`).toBeDefined()
  })
  it('trigger → review prep → 3 revisores → merge', () => {
    expect(subTargets('Lazo A · trigger (Execute Workflow)')).toContain('[BBA] Review prep')
    expect(subTargets('[BBA] Review prep')).toEqual(
      expect.arrayContaining(['Revisor · brand-strategist', 'Revisor · editor-en-jefe', 'Revisor · jefe-client-success']),
    )
    for (const r of ['Revisor · brand-strategist', 'Revisor · editor-en-jefe', 'Revisor · jefe-client-success']) {
      expect(subTargets(r)).toContain('[BBA] Merge corrections')
    }
  })
  it('IF seguir · true→re-síntesis · false→exit · y re-síntesis LOOP back a review prep', () => {
    expect(subTargets('[BBA] Merge corrections')).toContain('[BBA] IF · seguir corrigiendo')
    expect(subTargets('[BBA] IF · seguir corrigiendo', 0)).toContain('[BBA] Re-síntesis') // true
    expect(subTargets('[BBA] IF · seguir corrigiendo', 1)).toContain('[BBA] Exit · borrador final') // false
    expect(subTargets('[BBA] Re-síntesis')).toContain('[BBA] Review prep') // LOOP back-edge
  })
  it('merge · cap 3 ciclos + formato accionable + keep_going (creador corrige, no jefes)', () => {
    const code = readSub('correction-merge.js')
    expect(code).toContain('MAX_CYCLES = 3')
    expect(code).toContain('keep_going')
    for (const k of ['eje', 'severidad', 'donde', 'problema', 'por_que', 'cambio_sugerido']) {
      expect(code).toContain(k)
    }
  })
  it('review-prep pide el formato accionable · re-síntesis es el consolidador (maker)', () => {
    expect(readSub('correction-review-prep.js')).toMatch(/cambio_sugerido/)
    expect(readSub('correction-resynth.js')).toContain('/api/agents/run-sdk')
  })
  for (const f of ['correction-review-prep.js', 'correction-merge.js', 'correction-resynth.js']) {
    it(`${f} es JS sintácticamente válido`, () => {
      const code = readSub(f)
      expect(() => new Function('$json', '$', '$env', '$execution', '$input', `return (async()=>{${code}})`)).not.toThrow()
    })
  }
})
