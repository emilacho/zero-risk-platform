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
  '[BB] Merge lentes (esperar 3)',
  '[BB] Consolidador',
  '[BB] Lazo A · corrección (sub-wf)',
  '[BB] Judge prep',
  '[BB] Judge · run-sdk',
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
  it('preserva los 51 nodos base (no borra nada del worker) · total 65 (+Merge +Judge prep/http)', () => {
    expect(worker.nodes.length).toBe(65)
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
  it('Fix Merge · las 3 lentes → Merge (inputs 0/1/2) → consolidador · fuerza que las 3 corran', () => {
    const inIdx = (l: string) => {
      const arr = (worker.connections['Lente · ' + l]?.main?.[0] ?? []) as Array<{ node: string; index: number }>
      return arr.find((c) => c.node === '[BB] Merge lentes (esperar 3)')?.index
    }
    expect(inIdx('brand-strategist')).toBe(0)
    expect(inIdx('editor-en-jefe')).toBe(1)
    expect(inIdx('jefe-client-success')).toBe(2)
    expect(targets('[BB] Merge lentes (esperar 3)')).toContain('[BB] Consolidador')
    // el Merge node espera 3 inputs (combineByPosition)
    const m = nodeByName('[BB] Merge lentes (esperar 3)') as { type: string; parameters: { numberInputs?: number } }
    expect(m.type).toBe('n8n-nodes-base.merge')
    expect(m.parameters.numberInputs).toBe(3)
  })
  it('consolidador → lazo A → Judge prep → Judge run-sdk (HTTP) → Faithfulness judge (scoring)', () => {
    expect(targets('[BB] Consolidador')).toContain('[BB] Lazo A · corrección (sub-wf)')
    expect(targets('[BB] Lazo A · corrección (sub-wf)')).toContain('[BB] Judge prep')
    expect(targets('[BB] Judge prep')).toContain('[BB] Judge · run-sdk')
    expect(targets('[BB] Judge · run-sdk')).toContain('[BB] Faithfulness judge')
  })
  it('Fix judge-http · la llamada run-sdk del judge es un HTTP node (timeout 800s + auth · el Code fetch no llegaba al runner)', () => {
    const jh = nodeByName('[BB] Judge · run-sdk') as { type: string; parameters: { options?: { timeout?: number }; headerParameters?: unknown; jsonBody?: string } }
    expect(jh.type).toBe('n8n-nodes-base.httpRequest')
    expect(jh.parameters.options?.timeout).toBe(800000)
    expect(JSON.stringify(jh.parameters.headerParameters)).toContain('x-api-key')
    expect(jh.parameters.jsonBody).toContain('"fidelity_judge": true') // extra activa el forced-emit
    expect(jh.parameters.jsonBody).toContain('$json.judge_step_name') // step_name distinto (del prep)
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
  it('Fix 1 · HARD CAP · IF ciclos agotados usa contador independiente _fidelity_cycle >= 3', () => {
    const ifNode = nodeByName('[BB] IF · ciclos agotados') as { parameters: { conditions?: { conditions?: Array<{ leftValue?: string }> } } }
    const expr = ifNode.parameters.conditions?.conditions?.[0]?.leftValue || ''
    expect(expr).toContain('_fidelity_cycle')
    expect(expr).toContain('>= 3')
    expect(expr).not.toContain('fidelity.exhausted') // ya NO depende del judge
  })
  it('Fix 1 · el consolidador incrementa _fidelity_cycle (independiente del cycle del Lazo A)', () => {
    const code = readNode('consolidator.js')
    expect(code).toContain('_fidelity_cycle')
    expect(code).toMatch(/Number\(\$json\._fidelity_cycle\)\s*\|\|\s*0\)\s*\+\s*1/)
  })
  it('Fix 1 · el judge propaga _fidelity_cycle y computa exhausted sobre él', () => {
    const code = readNode('faithfulness-judge.js')
    expect(code).toContain('_fidelity_cycle')
    expect(code).toMatch(/fidelityCycle\s*>=\s*MAX_FIDELITY_CYCLES/)
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
  it('faithfulness judge (scoring) usa umbral ≥0.85 y per-field (LLM-judge DIY)', () => {
    const code = readNode('faithfulness-judge.js')
    expect(code).toContain('0.85')
    expect(code).toContain('low_fields')
    expect(code).not.toMatch(/require\(['"][^'"]*(ragas|deepeval)|import[^\n]*(ragas|deepeval)/i)
  })
  it('Fix A · el judge-prep pide emit_fidelity_scores y el scoring lee body.fidelity_scores', () => {
    expect(readNode('judge-prep.js')).toContain('emit_fidelity_scores')
    expect(readNode('faithfulness-judge.js')).toContain('body.fidelity_scores')
  })
  it('Fix 2 · el judge-http marca extra.fidelity_judge (activa el forced-emit Messages-API)', () => {
    const jh = nodeByName('[BB] Judge · run-sdk') as { parameters: { jsonBody?: string } }
    expect(jh.parameters.jsonBody).toContain('"fidelity_judge": true')
  })
  it('Fix checkpoint · el judge-prep arma step_name DISTINTO de la lente + único por ciclo', () => {
    expect(readNode('judge-prep.js')).toMatch(/'bb-faithfulness-judge-c'\s*\+\s*fidelityCycle/)
  })
  it('Fix 8000 · judge-prep + lentes cap el task ≤7900 (run-sdk rechaza >8000)', () => {
    expect(readNode('judge-prep.js')).toMatch(/\)\s*\.slice\(0,\s*7900\)/)
    const prep = readNode('synthesis-fanout-prep.js')
    expect(prep).toMatch(/slice\(0,\s*7900\)/)
    expect(prep).toMatch(/task:\s*cap\(/)
  })
  it('Fix evidencia · judge-prep arma evidencia LEGIBLE (prosa) · no JSON.stringify(grounding).slice', () => {
    const code = readNode('judge-prep.js')
    expect(code).toContain('Resumen de descubrimiento')
    expect(code).toContain('discovery_summary')
    // ya NO usa el blob JSON truncado que rompía la verificación del judge.
    expect(code).not.toMatch(/JSON\.stringify\(grounding\)\.slice/)
  })
  it('Fix checkpoint · cada lente pasa step_name distinto (bb-lens-<lente>)', () => {
    for (const lens of ['brand-strategist', 'editor-en-jefe', 'jefe-client-success']) {
      const node = nodeByName('Lente · ' + lens) as { parameters: { jsonBody?: string } }
      expect(node.parameters.jsonBody).toContain('"step_name": "bb-lens-' + lens + '"')
    }
  })
})

describe('brand-book rewire · node code parsea como JS válido', () => {
  for (const f of ['synthesis-fanout-prep.js', 'consolidator.js', 'judge-prep.js', 'faithfulness-judge.js', 'promote-to-canon.js']) {
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
  it('Fix B · IF seguir · true→re-síntesis · false→exit · y re-síntesis → EXIT (sin loop-back · 1 ciclo)', () => {
    expect(subTargets('[BBA] Merge corrections')).toContain('[BBA] IF · seguir corrigiendo')
    expect(subTargets('[BBA] IF · seguir corrigiendo', 0)).toContain('[BBA] Re-síntesis') // true
    expect(subTargets('[BBA] IF · seguir corrigiendo', 1)).toContain('[BBA] Exit · borrador final') // false
    // Fix B · re-síntesis va al EXIT (no vuelve a review prep) · Lazo A a 1 ciclo.
    expect(subTargets('[BBA] Re-síntesis')).toContain('[BBA] Exit · borrador final')
    expect(subTargets('[BBA] Re-síntesis')).not.toContain('[BBA] Review prep')
  })
  it('Fix B · merge · cap 1 ciclo (no vinculante · recorte de volumen) + formato accionable', () => {
    const code = readSub('correction-merge.js')
    expect(code).toContain('MAX_CYCLES = 1')
    expect(code).toContain('keep_going')
    for (const k of ['eje', 'severidad', 'donde', 'problema', 'por_que', 'cambio_sugerido']) {
      expect(code).toContain(k)
    }
  })
  it('review-prep pide el formato accionable · re-síntesis es el consolidador (maker)', () => {
    expect(readSub('correction-review-prep.js')).toMatch(/cambio_sugerido/)
    expect(readSub('correction-resynth.js')).toContain('/api/agents/run-sdk')
  })
  it('Fix 8000 · revisores + re-síntesis cap el task ≤7900 (run-sdk rechaza >8000)', () => {
    expect(readSub('correction-review-prep.js')).toMatch(/slice\(0,\s*7900\)/)
    expect(readSub('correction-resynth.js')).toMatch(/\)\s*\.slice\(0,\s*7900\)/)
  })
  for (const f of ['correction-review-prep.js', 'correction-merge.js', 'correction-resynth.js']) {
    it(`${f} es JS sintácticamente válido`, () => {
      const code = readSub(f)
      expect(() => new Function('$json', '$', '$env', '$execution', '$input', `return (async()=>{${code}})`)).not.toThrow()
    })
  }
})
