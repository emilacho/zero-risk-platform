#!/usr/bin/env node
/**
 * Sprint 7.6 A5 · patch NEXUS workflow to fix state-loss between iterations.
 *
 * Bug · Resolve Phase pulls `$json.request_id` which on iteration 2+ is empty
 * because the loop path (Persist → Notify MC → All Complete? → Go Back) flows
 * through nodes that don't preserve state. Notify MC returns
 * `{ok, action, acknowledged, note}` which strips request_id/client_id.
 *
 * Fix · Resolve Phase + Persist + Advance must anchor state to
 * `$('Parse & Validate Request').item.json.<field>` for request_id +
 * client_id + campaign_brief + phases · these never change after Parse
 * so anchoring there is safe + idempotent across iterations.
 */
import fs from 'node:fs'

const N8N_KEY = fs.readFileSync('../zero-risk-platform/.env.local', 'utf8')
  .split('\n').find(l => l.startsWith('N8N_API_KEY='))?.split('=').slice(1).join('=')
if (!N8N_KEY) { console.error('FATAL · N8N_API_KEY missing'); process.exit(1) }

const N8N_BASE = 'https://n8n-production-72be.up.railway.app'
const WF_ID = 'RT1tcru9mysEwKkf'

const ALLOWED_SETTINGS = [
  'executionOrder', 'errorWorkflow', 'callerPolicy',
  'executionTimeout', 'saveExecutionProgress',
  'saveManualExecutions', 'saveDataErrorExecution',
  'saveDataSuccessExecution', 'timezone',
]

async function fetchWf() {
  const r = await fetch(`${N8N_BASE}/api/v1/workflows/${WF_ID}`, {
    headers: { 'X-N8N-API-KEY': N8N_KEY, Accept: 'application/json' },
  })
  if (!r.ok) throw new Error(`GET ${WF_ID} → ${r.status}`)
  return r.json()
}

async function putWf(body) {
  const r = await fetch(`${N8N_BASE}/api/v1/workflows/${WF_ID}`, {
    method: 'PUT',
    headers: { 'X-N8N-API-KEY': N8N_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const t = await r.text()
  if (!r.ok) throw new Error(`PUT → ${r.status} · ${t.slice(0, 300)}`)
  return { status: r.status }
}

// Anchor reference · what Parse & Validate Request always exposes as its `.json`:
// request_id · client_id · campaign_brief · priority · phases · current_phase_index
// · current_phase · phase_outputs · status · started_at
const PARSE = `$('Parse & Validate Request').item.json`

// New jsonBody for Resolve Phase · anchors core state to Parse + reads
// current_phase/index/phase_outputs from $json (loop carries those properly
// through Advance + Persist + Notify MC chain).
const NEW_RESOLVE_BODY = `={
  "current_phase": "{{ $json.current_phase || ${PARSE}.current_phase || 'DISCOVER' }}",
  "request_id": "{{ ${PARSE}.request_id || $json.request_id || '' }}",
  "client_id": "{{ ${PARSE}.client_id || $json.client_id || '' }}",
  "campaign_brief": {{ JSON.stringify(${PARSE}.campaign_brief || $json.campaign_brief || '') }},
  "priority": "{{ ${PARSE}.priority || $json.priority || 'normal' }}",
  "phases": {{ JSON.stringify(${PARSE}.phases || $json.phases || ['DISCOVER']) }},
  "phase_outputs": {{ JSON.stringify($json.phase_outputs || {}) }},
  "retry_count": {{ Number($json.retry_count) || 0 }},
  "current_phase_index": {{ Number($json.current_phase_index ?? 0) }}
}`

// Persist Phase State body · anchor IDs to Parse · keep dynamic fields from $json
const NEW_PERSIST_BODY = `={
  "request_id": "{{ ${PARSE}.request_id || $json.request_id || '' }}",
  "client_id": "{{ ${PARSE}.client_id || $json.client_id || '' }}",
  "current_phase": "{{ $json.current_phase || 'DISCOVER' }}",
  "status": "{{ $json.status || 'in_progress' }}",
  "retry_count": {{ Number($json.retry_count) || 0 }},
  "updated_at": "{{ new Date().toISOString() }}"
}`

// Advance to Next Phase · anchor IDs + campaign_brief to Parse · keep loop fields from $json
const NEW_ADVANCE_BODY = `={
  "request_id": "{{ ${PARSE}.request_id || $json.request_id || '' }}",
  "client_id": "{{ ${PARSE}.client_id || $json.client_id || '' }}",
  "campaign_brief": {{ JSON.stringify(${PARSE}.campaign_brief || $json.campaign_brief || '') }},
  "current_phase": "{{ $json.current_phase || 'DISCOVER' }}",
  "current_phase_index": {{ Number($json.current_phase_index) || 0 }},
  "phase_output": {{ JSON.stringify($('Execute Phase (jefe-marketing)').item.json.output ?? $('Execute Phase (jefe-marketing)').item.json.response ?? '') }},
  "phase_outputs": {{ JSON.stringify($json.phase_outputs || {}) }},
  "retry_count": {{ Number($json.retry_count) || 0 }},
  "priority": "{{ ${PARSE}.priority || $json.priority || 'normal' }}",
  "phases": {{ JSON.stringify(${PARSE}.phases || $json.phases || ['DISCOVER']) }}
}`

const PATCH_MAP = {
  'Resolve Phase': NEW_RESOLVE_BODY,
  'Persist Phase State to DB': NEW_PERSIST_BODY,
  'Advance to Next Phase': NEW_ADVANCE_BODY,
}

const wf = await fetchWf()
console.log(`fetched · ${wf.name} · ${wf.nodes.length} nodes`)

let patched = 0
for (const node of wf.nodes) {
  if (PATCH_MAP[node.name]) {
    const prev = node.parameters.jsonBody.slice(0, 60).replace(/\n/g, ' \\n ')
    node.parameters.jsonBody = PATCH_MAP[node.name]
    patched++
    console.log(`  patched · ${node.name} · was '${prev}...'`)
  }
}

if (patched === 0) {
  console.log('no nodes to patch · exiting')
  process.exit(0)
}

const settings = {}
for (const k of ALLOWED_SETTINGS) if (wf.settings?.[k] !== undefined) settings[k] = wf.settings[k]

await putWf({
  name: wf.name,
  nodes: wf.nodes,
  connections: wf.connections,
  settings,
})
console.log(`\nPUT OK · ${patched} nodes patched`)
