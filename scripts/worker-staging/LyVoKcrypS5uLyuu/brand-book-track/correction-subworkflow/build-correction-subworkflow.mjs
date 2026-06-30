/**
 * Lazo A · sub-workflow de corrección del brand book (SPEC paso 4 · consejero §1).
 * Reusa el patrón SPEC-camino-iii-lazo-correccion: los jefes DIAGNOSTICAN
 * (correcciones accionables), el consolidador CORRIGE · máx 3 ciclos · automático
 * sin humano · NO vinculante (la fidelidad decide canon · es mejora iterativa).
 *
 * Self-contained: el loop vive dentro del sub-wf · el worker lo llama una vez.
 * Output: correction-subworkflow.json (workflow n8n separado).
 *
 * Run: node .../correction-subworkflow/build-correction-subworkflow.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const DIR = dirname(fileURLToPath(import.meta.url))
const N = (f) => readFileSync(join(DIR, 'nodes', f), 'utf8')

const code = (name, file, [x, y]) => ({
  parameters: { jsCode: N(file) },
  id: 'bba-' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 36),
  name, type: 'n8n-nodes-base.code', typeVersion: 2, position: [x, y],
})
const reviewer = (slug, [x, y]) => ({
  parameters: {
    method: 'POST',
    url: "={{ $env.ZERO_RISK_API_URL || 'https://zero-risk-platform.vercel.app' }}/api/agents/run-sdk",
    // FIX-FORWARD 2026-06-30 · auth interna run-sdk (igual que los nodos existentes).
    sendHeaders: true,
    headerParameters: { parameters: [
      { name: 'Content-Type', value: 'application/json' },
      { name: 'x-api-key', value: '={{ $env.INTERNAL_API_KEY }}' },
    ] },
    sendBody: true, specifyBody: 'json',
    jsonBody:
      '={\n  "agent": "{{ $json.agent }}",\n  "client_id": "{{ $json.client_id }}",\n' +
      '  "workflow_id": "{{ $execution.id }}",\n  "workflow_execution_id": "{{ $execution.id }}",\n' +
      '  "task": {{ JSON.stringify($json.task) }},\n  "context": { "role": "brand_book_corrector", "reviewer": "' + slug + '" }\n}',
    // FIX-FORWARD 2026-06-30 · timeout 800s + neverError (igual que run-sdk existentes).
    options: { response: { response: { neverError: true } }, timeout: 800000 },
  },
  id: 'bba-rev-' + slug, name: 'Revisor · ' + slug,
  type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: [x, y],
})

const trigger = {
  parameters: {}, id: 'bba-trigger', name: 'Lazo A · trigger (Execute Workflow)',
  type: 'n8n-nodes-base.executeWorkflowTrigger', typeVersion: 1, position: [120, 400],
}
const prep = code('[BBA] Review prep', 'correction-review-prep.js', [360, 400])
const rStrat = reviewer('brand-strategist', [600, 200])
const rEditor = reviewer('editor-en-jefe', [600, 400])
const rCS = reviewer('jefe-client-success', [600, 600])
const merge = code('[BBA] Merge corrections', 'correction-merge.js', [860, 400])
const ifGo = {
  parameters: {
    conditions: {
      options: { caseSensitive: true, typeValidation: 'loose' },
      conditions: [{ leftValue: '={{ $json.keep_going }}', rightValue: true, operator: { type: 'boolean', operation: 'true' } }],
      combinator: 'and',
    },
  },
  id: 'bba-if-seguir', name: '[BBA] IF · seguir corrigiendo',
  type: 'n8n-nodes-base.if', typeVersion: 2, position: [1120, 400],
}
const resynth = code('[BBA] Re-síntesis', 'correction-resynth.js', [1120, 120])
const exit = {
  parameters: {
    jsCode:
      "// Lazo A · salida · devuelve el borrador final mejorado al worker caller.\n" +
      "const j = $json;\nreturn [{ json: { brand_book_draft: j.brand_book_draft, " +
      "_grounding_refs: j._grounding_refs, client_id: j.client_id, cycle: j.cycle, " +
      "corrections: j.corrections || [], _lazo_a_done: true } }];\n",
  },
  id: 'bba-exit', name: '[BBA] Exit · borrador final',
  type: 'n8n-nodes-base.code', typeVersion: 2, position: [1380, 600],
}

const nodes = [trigger, prep, rStrat, rEditor, rCS, merge, ifGo, resynth, exit]

const C = {}
const link = (from, to, idx = 0) => {
  C[from] = C[from] || { main: [] }
  while (C[from].main.length <= idx) C[from].main.push([])
  C[from].main[idx].push({ node: to, type: 'main', index: 0 })
}
link('Lazo A · trigger (Execute Workflow)', '[BBA] Review prep')
link('[BBA] Review prep', 'Revisor · brand-strategist')
link('[BBA] Review prep', 'Revisor · editor-en-jefe')
link('[BBA] Review prep', 'Revisor · jefe-client-success')
link('Revisor · brand-strategist', '[BBA] Merge corrections')
link('Revisor · editor-en-jefe', '[BBA] Merge corrections')
link('Revisor · jefe-client-success', '[BBA] Merge corrections')
link('[BBA] Merge corrections', '[BBA] IF · seguir corrigiendo')
link('[BBA] IF · seguir corrigiendo', '[BBA] Re-síntesis', 0) // true · seguir
link('[BBA] IF · seguir corrigiendo', '[BBA] Exit · borrador final', 1) // false · converge/agota
link('[BBA] Re-síntesis', '[BBA] Review prep') // LOOP back (cap por cycle en merge)

const wf = {
  name: 'Zero Risk — Brand Book · Lazo A corrección (sub-workflow)',
  nodes, connections: C,
  settings: { executionOrder: 'v1' }, active: false,
}
const out = join(DIR, 'correction-subworkflow.json')
writeFileSync(out, JSON.stringify(wf, null, 2))
console.log('Lazo A sub-workflow written ·', nodes.length, 'nodes ·', out)
