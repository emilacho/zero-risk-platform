/**
 * Brand Book · rewire builder · worker LyVoKcrypS5uLyuu (SPEC 2026-06-29).
 *
 * Causa raíz (CC#4 §148): `Persist Canon · brand_book` está downstream del gate
 * Camino III (IF PASS/REJECT) → nunca corre → client_brand_books=0. Fix: track
 * propio de brand book DESPUÉS de FASE 2 (Aggregate Apify), fuera del gate, que
 * decide canon por FIDELIDAD (no por voto). Shadow · NO toca el worker live.
 *
 * Build determinístico (patrón build-staged-worker.mjs): lee la base live +
 * embebe el código de los nodos + cablea el nuevo track. Output: rewired-worker.json.
 *
 * Run: node scripts/worker-staging/LyVoKcrypS5uLyuu/brand-book-track/build-brand-book-rewire.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const DIR = dirname(fileURLToPath(import.meta.url))
const N = (f) => readFileSync(join(DIR, 'nodes', f), 'utf8')

const base = JSON.parse(readFileSync(join(DIR, 'base-worker-live-51.json'), 'utf8'))
const nodes = base.nodes
const conns = base.connections

// ── helpers ────────────────────────────────────────────────────────────────
const codeNode = (name, file, [x, y]) => ({
  parameters: { jsCode: N(file) },
  id: 'bb-' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40),
  name,
  type: 'n8n-nodes-base.code',
  typeVersion: 2,
  position: [x, y],
})

// run-sdk lens agent · HTTP POST sync · workflow_id POR-RUN ($execution.id) para
// NO colisionar con el checkpoint cache (lección exec 40025 · fix #223).
const lensNode = (lens, agent, [x, y]) => ({
  parameters: {
    method: 'POST',
    url: "={{ $env.ZERO_RISK_API_URL || 'https://zero-risk-platform.vercel.app' }}/api/agents/run-sdk",
    // FIX-FORWARD 2026-06-30 · run-sdk requiere auth interna · mismo patrón que
    // los nodos run-sdk existentes (Re-discovery/Competitor Verdict · exec 41381
    // erroró "Authorization failed" sin esto).
    sendHeaders: true,
    headerParameters: {
      parameters: [
        { name: 'Content-Type', value: 'application/json' },
        { name: 'x-api-key', value: '={{ $env.INTERNAL_API_KEY }}' },
      ],
    },
    sendBody: true,
    specifyBody: 'json',
    jsonBody:
      '={\n' +
      '  "agent": "' + agent + '",\n' +
      '  "client_id": "{{ $json.client_id }}",\n' +
      '  "workflow_id": "{{ $execution.id }}",\n' +
      '  "workflow_execution_id": "{{ $execution.id }}",\n' +
      // Fix B · cada lente lee SU task del item único ($json.tasks.<lente>).
      "  \"task\": {{ JSON.stringify($json.tasks['" + lens + "']) }},\n" +
      '  "context": { "role": "brand_book_lens", "lens": "' + lens + '" }\n' +
      '}',
    // FIX-FORWARD 2026-06-30 · timeout 800s + neverError (igual que los run-sdk
    // existentes) · el agente synthesis puede tardar · 120s lo cortaba
    // ("connection aborted" exec 41388) · neverError = un 502 transiente no
    // aborta · el consolidador tolera lentes faltantes (floor seguro).
    options: { response: { response: { neverError: true } }, timeout: 800000 },
  },
  id: 'bb-lens-' + lens,
  name: 'Lente · ' + lens,
  type: 'n8n-nodes-base.httpRequest',
  typeVersion: 4.2,
  position: [x, y],
})

const ifNode = (name, leftExpr, rightVal, [x, y]) => ({
  parameters: {
    conditions: {
      options: { caseSensitive: true, typeValidation: 'loose' },
      conditions: [{ leftValue: leftExpr, rightValue: rightVal, operator: { type: 'boolean', operation: 'true' } }],
      combinator: 'and',
    },
  },
  id: 'bb-if-' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 30),
  name,
  type: 'n8n-nodes-base.if',
  typeVersion: 2,
  position: [x, y],
})

// ── new nodes (offset y=+1200 bajo el grafo existente) ──────────────────────
const Y = 1800
const fanout = codeNode('[BB] Fan-out prep', 'synthesis-fanout-prep.js', [200, Y])
const lensStrat = lensNode('brand-strategist', 'brand-strategist', [460, Y - 200])
const lensEditor = lensNode('editor-en-jefe', 'editor-en-jefe', [460, Y])
const lensCS = lensNode('jefe-client-success', 'jefe-client-success', [460, Y + 200])
const consolidator = codeNode('[BB] Consolidador', 'consolidator.js', [760, Y])
// Lazo A · correction sub-workflow (Execute Workflow · automático · consejero §1).
const correctionLoop = {
  parameters: {
    workflowId: "={{ $env.BB_CORRECTION_SUBWORKFLOW_ID || '' }}",
    options: {},
  },
  id: 'bb-correction-subwf',
  name: '[BB] Lazo A · corrección (sub-wf)',
  type: 'n8n-nodes-base.executeWorkflow',
  typeVersion: 1,
  position: [1020, Y],
}
const judge = codeNode('[BB] Faithfulness judge', 'faithfulness-judge.js', [1280, Y])
const ifFidelity = ifNode('[BB] IF · fidelidad PASS', '={{ $json.fidelity.pass }}', true, [1540, Y])
// FIX 2026-06-30 (Bug 1) · HARD CAP numérico sobre el contador INDEPENDIENTE
// `_fidelity_cycle` (no `fidelity.exhausted` · que dependía del judge). Mata el
// loop sí o sí tras 3 iteraciones del consolidador aunque el judge falle siempre.
const ifExhausted = ifNode('[BB] IF · ciclos agotados', '={{ (Number($json._fidelity_cycle) || 0) >= 3 }}', true, [1540, Y + 300])
const promote = codeNode('[BB] Promote → canon', 'promote-to-canon.js', [1800, Y - 150])
const hitl = {
  parameters: {
    method: 'POST',
    url: "={{ $env.ZERO_RISK_API_URL || 'https://zero-risk-platform.vercel.app' }}/api/hitl/queue",
    sendBody: true, specifyBody: 'json',
    jsonBody:
      '={\n  "type": "brand_book_fidelity_last_resort",\n  "client_id": "{{ $json.brand_book_draft.client_id }}",\n  "fidelity": {{ JSON.stringify($json.fidelity) }}\n}',
    options: { timeout: 15000 },
  },
  id: 'bb-hitl-lastresort',
  name: '[BB] HITL último recurso (no Emilio)',
  type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2,
  position: [1800, Y + 300],
}

const newNodes = [fanout, lensStrat, lensEditor, lensCS, consolidator, correctionLoop, judge, ifFidelity, ifExhausted, promote, hitl]

// ── connection surgery ──────────────────────────────────────────────────────
const link = (from, to, fromOut = 'main', idx = 0) => {
  conns[from] = conns[from] || {}
  conns[from][fromOut] = conns[from][fromOut] || []
  while (conns[from][fromOut].length <= idx) conns[from][fromOut].push([])
  conns[from][fromOut][idx].push({ node: to, type: 'main', index: 0 })
}

// (0/7) NUEVO TRACK · FIX-FORWARD 2026-06-30: branchear desde un nodo
// INCONDICIONAL post-discovery, NO desde Aggregate. Aggregate solo corre en el
// path "proceder" del competitor verdict · con verdict "observar"→HITL (caso común)
// nunca corría → el track no se disparaba (exec 40856 · 0/9 nodos). `Confirm
// barato · competitor list` corre SIEMPRE tras el Discovery Parser (antes del
// verdict) y ya tiene el `discovery_package` que el fan-out prep necesita. El
// Apify aggregate es opcional (fan-out prep tiene fallback graceful).
const TRIGGER = 'Confirm barato · competitor list'
// en paralelo al path existente (→ Competitor Verdict) · no lo rompe.
link(TRIGGER, '[BB] Fan-out prep')
// Fan-out → 3 lentes (cada item del split va a cada lente por separado)
link('[BB] Fan-out prep', 'Lente · brand-strategist')
link('[BB] Fan-out prep', 'Lente · editor-en-jefe')
link('[BB] Fan-out prep', 'Lente · jefe-client-success')
// lentes → consolidador (merge implícito por referencia de nodos en el código)
link('Lente · brand-strategist', '[BB] Consolidador')
link('Lente · editor-en-jefe', '[BB] Consolidador')
link('Lente · jefe-client-success', '[BB] Consolidador')
// consolidador → lazo A corrección → judge
link('[BB] Consolidador', '[BB] Lazo A · corrección (sub-wf)')
link('[BB] Lazo A · corrección (sub-wf)', '[BB] Faithfulness judge')
// judge → IF fidelidad · PASS(true)→promote · FAIL(false)→IF ciclos agotados
link('[BB] Faithfulness judge', '[BB] IF · fidelidad PASS')
link('[BB] IF · fidelidad PASS', '[BB] Promote → canon', 'main', 0) // true
link('[BB] IF · fidelidad PASS', '[BB] IF · ciclos agotados', 'main', 1) // false
// ciclos agotados? sí→HITL último recurso · no→re-síntesis (vuelve al consolidador)
link('[BB] IF · ciclos agotados', '[BB] HITL último recurso (no Emilio)', 'main', 0) // true
link('[BB] IF · ciclos agotados', '[BB] Consolidador', 'main', 1) // false · re-synth (cap por cycle)

// (0/7) DES-GATEAR el brand_book del Camino III: el viejo Persist Canon dejaba el
// brand_book detrás del IF Camino III PASS. Lo neutralizamos para brand_book ·
// ICP/competitive siguen su path directo. Marcamos el nodo viejo como deprecado.
const oldPersist = nodes.find((n) => n.name === 'Persist Canon · brand_book + ICP + analysis')
if (oldPersist && typeof oldPersist.parameters.jsCode === 'string') {
  oldPersist.parameters.jsCode =
    '// [BB-REWIRE 2026-06-29] brand_book ya NO se persiste aquí (estaba gateado por\n' +
    '// Camino III PASS · nunca corría). El brand_book lo escribe el track propio\n' +
    "// '[BB] Promote → canon' por FIDELIDAD PASS. ICP/competitive mantienen su path.\n" +
    oldPersist.parameters.jsCode
}

// FIX-FORWARD 2026-06-30 · continueOnFail en el nodo Cal.com: un error del
// servicio (caído · canon §6 · "contact_email_required" en exec 40856) NO debe
// abortar el journey ni matar el track de brand book. El journey sigue con el
// resto (handoff, notify) aunque el kickoff falle.
const calcom = nodes.find((n) => n.name === 'Schedule Kickoff Call (Cal.com)')
if (calcom) {
  calcom.continueOnFail = true
  calcom.onError = 'continueRegularOutput'
}

base.nodes = nodes.concat(newNodes)

const outPath = join(DIR, 'rewired-worker.json')
writeFileSync(outPath, JSON.stringify(base, null, 2))
console.log('rewired worker written ·', base.nodes.length, 'nodes (', newNodes.length, 'new ) ·', outPath)
