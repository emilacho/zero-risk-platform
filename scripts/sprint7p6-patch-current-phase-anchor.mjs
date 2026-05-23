#!/usr/bin/env node
/**
 * Sprint 7.6 A5 part 3 · second-iteration root cause fix.
 *
 * After A5 part 1 (body anchors to Parse) + A5 part 2 (rewire Persist→All-Complete),
 * smoke (1-phase) E2E passed but full 7-phase E2E still looped infinitely on
 * STRATEGIZE phase (exec 9669 · 22 iters all stuck same phase · died at
 * Anthropic API "service not able to process request" after 22 jefe-marketing calls).
 *
 * Diagnosis · Validate Phase Output response from `/api/evidence/validate` does
 * NOT include `current_phase` at top level · Advance + Persist receive `$json`
 * without current_phase · my fallback chain `$json.current_phase || 'DISCOVER'`
 * defaulted to DISCOVER · Advance went DISCOVER→STRATEGIZE forever.
 *
 * Fix · anchor `current_phase` to `$('Resolve Phase').item.json.current_phase`
 * (Resolve runs once per iter at start · has the canonical current_phase from
 * the upstream Persist chain · n8n's `$('Node').item` returns most-recent run).
 */
import fs from 'node:fs'

const N8N_KEY = fs.readFileSync('../zero-risk-platform/.env.local', 'utf8')
  .split('\n').find(l => l.startsWith('N8N_API_KEY='))?.split('=').slice(1).join('=')
const N8N_BASE = 'https://n8n-production-72be.up.railway.app'
const WF_ID = 'RT1tcru9mysEwKkf'

const ALLOWED_SETTINGS = [
  'executionOrder', 'errorWorkflow', 'callerPolicy',
  'executionTimeout', 'saveExecutionProgress',
  'saveManualExecutions', 'saveDataErrorExecution',
  'saveDataSuccessExecution', 'timezone',
]

const PARSE = `$('Parse & Validate Request').item.json`
const RESOLVE = `$('Resolve Phase').item.json`

// Advance · anchor current_phase + current_phase_index to Resolve (per-iter source of truth)
const NEW_ADVANCE_BODY = `={
  "request_id": "{{ ${PARSE}.request_id || $json.request_id || '' }}",
  "client_id": "{{ ${PARSE}.client_id || $json.client_id || '' }}",
  "campaign_brief": {{ JSON.stringify(${PARSE}.campaign_brief || $json.campaign_brief || '') }},
  "current_phase": "{{ ${RESOLVE}.current_phase || $json.current_phase || 'DISCOVER' }}",
  "current_phase_index": {{ Number(${RESOLVE}.current_phase_index ?? $json.current_phase_index ?? 0) }},
  "phase_output": {{ JSON.stringify($('Execute Phase (jefe-marketing)').item.json.output ?? $('Execute Phase (jefe-marketing)').item.json.response ?? '') }},
  "phase_outputs": {{ JSON.stringify(${RESOLVE}.phase_outputs || $json.phase_outputs || {}) }},
  "retry_count": {{ Number($json.retry_count) || 0 }},
  "priority": "{{ ${PARSE}.priority || $json.priority || 'normal' }}",
  "phases": {{ JSON.stringify(${PARSE}.phases || $json.phases || ['DISCOVER']) }}
}`

// Persist · current_phase from Advance's output (which is now correct via $json)
const NEW_PERSIST_BODY = `={
  "request_id": "{{ ${PARSE}.request_id || $json.request_id || '' }}",
  "client_id": "{{ ${PARSE}.client_id || $json.client_id || '' }}",
  "current_phase": "{{ $json.current_phase || ${RESOLVE}.current_phase || 'DISCOVER' }}",
  "status": "{{ $json.status || 'in_progress' }}",
  "retry_count": {{ Number($json.retry_count) || 0 }},
  "updated_at": "{{ new Date().toISOString() }}"
}`

// Resolve · phase_outputs needs to accumulate across iters · keep $json.phase_outputs as primary (Persist propagates)
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

const PATCH_MAP = {
  'Resolve Phase': NEW_RESOLVE_BODY,
  'Persist Phase State to DB': NEW_PERSIST_BODY,
  'Advance to Next Phase': NEW_ADVANCE_BODY,
}

async function fetchWf() {
  const r = await fetch(`${N8N_BASE}/api/v1/workflows/${WF_ID}`, {
    headers: { 'X-N8N-API-KEY': N8N_KEY, Accept: 'application/json' },
  })
  if (!r.ok) throw new Error(`GET → ${r.status}`)
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
}

const wf = await fetchWf()
let patched = 0
for (const node of wf.nodes) {
  if (PATCH_MAP[node.name]) {
    node.parameters.jsonBody = PATCH_MAP[node.name]
    patched++
    console.log(`  patched · ${node.name}`)
  }
}
const settings = {}
for (const k of ALLOWED_SETTINGS) if (wf.settings?.[k] !== undefined) settings[k] = wf.settings[k]
await putWf({ name: wf.name, nodes: wf.nodes, connections: wf.connections, settings })
console.log(`\nPUT OK · ${patched} nodes patched with $('Resolve Phase').item anchor for current_phase`)
