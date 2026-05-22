#!/usr/bin/env node
/**
 * Sprint 7.6 A5 part 2 · rewire NEXUS loop to preserve state.
 *
 * Diagnosis · Notify Mission Control returns {ok, action, acknowledged, note}
 * stripping state from the request body · the noOp "Go Back to Phase Execution"
 * then has empty $json · Resolve Phase iter 2+ can't recover request_id.
 *
 * Fix · re-route connections so that Persist Phase State to DB feeds BOTH ·
 *   - All Phases Complete? (main critical path · state preserved)
 *   - Notify Mission Control · side-effect parallel (output discarded)
 *
 * Result · Notify MC still fires (Mission Control gets notified) but it's
 * a parallel branch, not in the loop's critical state path.
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
console.log(`fetched · ${wf.name}`)

// Current ·
//   Persist Phase State to DB → Notify Mission Control → All Phases Complete?
//   All Phases Complete? [main:1=not-complete] → Go Back to Phase Execution → Resolve
// Target ·
//   Persist Phase State to DB → [parallel] All Phases Complete? + Notify Mission Control
//   All Phases Complete? [main:1=not-complete] → Go Back to Phase Execution → Resolve
// Net · Notify MC fires in parallel (still notifies MC for audit) but state flows
// Persist → All Phases Complete? directly · preserving request_id/client_id

const conns = JSON.parse(JSON.stringify(wf.connections || {}))

// 1. Persist Phase State to DB · add All Phases Complete? as second output (parallel to Notify MC)
const persistConn = conns['Persist Phase State to DB']?.main?.[0] || []
const hasAllComplete = persistConn.some((t) => t.node === 'All Phases Complete?')
if (!hasAllComplete) {
  persistConn.push({ node: 'All Phases Complete?', type: 'main', index: 0 })
}
conns['Persist Phase State to DB'] = { main: [persistConn] }

// 2. Notify Mission Control · drop downstream connection (it was feeding All Phases Complete?
//    · now redundant since Persist feeds directly · Notify becomes terminal)
conns['Notify Mission Control (Phase Complete)'] = { main: [[]] }

const settings = {}
for (const k of ALLOWED_SETTINGS) if (wf.settings?.[k] !== undefined) settings[k] = wf.settings[k]

await putWf({
  name: wf.name,
  nodes: wf.nodes,
  connections: conns,
  settings,
})
console.log('rewired · Persist → All Phases Complete? direct · Notify MC parallel side-effect')
