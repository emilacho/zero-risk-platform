#!/usr/bin/env node
/**
 * Surgical patcher for Subject Line A/B + A/A Validator workflow.
 *
 * Root cause: every HTTP/Respond node references $node['slug'] using the node
 * IDs (validate, sample-size-calc, schwedelson-validation, run-aa-test,
 * create-test) which n8n v1.x no longer resolves. Rewrite to use $('Exact Name').item.json.
 *
 * Also adds defensive fallbacks so JSON.stringify(undefined) can't produce
 * invalid JSON if upstream Code nodes return unexpected shapes.
 */
import { endpoints } from './lib/env.mjs'
import { fetchJson } from './lib/fetch.mjs'
import { listN8nWorkflows, fetchWorkflowDetail } from './lib/workflows.mjs'

const ep = endpoints()
const H = { 'X-N8N-API-KEY': ep.N8N_API_KEY, 'Content-Type': 'application/json', 'Accept': 'application/json' }
const DRY = process.argv.includes('--dry-run')

const BASE = "{{ $env.ZERO_RISK_API_URL || 'https://zero-risk-platform.vercel.app' }}"

const VALIDATE = `$('Validate Input').item.json`
const SCHWEDELSON = `$('Schwedelson Patterns Check').item.json`
const SAMPLE = `$('Sample Size Calculator').item.json`
const AA_TEST = `$('Run A/A Control Test').item.json`
const CREATE = `$('Create Test Plan').item.json`

const FIXED_PARAMS = {
  'Run A/A Control Test': {
    method: 'POST',
    url: `=${BASE}/api/subject-line-tests/aa-control`,
    sendHeaders: true,
    headerParameters: { parameters: [
      { name: 'Content-Type', value: 'application/json' },
      { name: 'x-api-key', value: '={{ $env.INTERNAL_API_KEY }}' },
      { name: 'x-smoke-test', value: `={{ (${VALIDATE}.client_id || "").startsWith("smoke-") ? "1" : "" }}` },
    ]},
    sendBody: true,
    specifyBody: 'json',
    jsonBody: `={\n  "client_id": "{{ ${VALIDATE}.client_id || '' }}",\n  "subject_line": "{{ ${VALIDATE}.subject_a || '' }}",\n  "test_group_size": {{ Math.floor((${SAMPLE}.segment_size || 100) / 4) }},\n  "variance_threshold": 0.05\n}`,
    options: { timeout: 120000, response: { response: { neverError: true } } },
  },
  'Create Test Plan': {
    method: 'POST',
    url: `=${BASE}/api/subject-line-tests/create`,
    sendHeaders: true,
    headerParameters: { parameters: [
      { name: 'Content-Type', value: 'application/json' },
      { name: 'x-api-key', value: '={{ $env.INTERNAL_API_KEY }}' },
    ]},
    sendBody: true,
    specifyBody: 'json',
    jsonBody: `={\n  "client_id": "{{ ${VALIDATE}.client_id || '' }}",\n  "subject_a": "{{ ${VALIDATE}.subject_a || '' }}",\n  "subject_b": {{ JSON.stringify(${VALIDATE}.subject_b ?? null) }},\n  "sample_per_arm": {{ Number(${SAMPLE}.sample_size_per_arm) || 0 }},\n  "schwedelson_validation": {{ JSON.stringify(${SCHWEDELSON}.validation ?? {}) }},\n  "aa_control_passed": {{ JSON.stringify(${AA_TEST} ?? {}) }}\n}`,
    options: { timeout: 30000 },
  },
  'Respond: Test Ready': {
    httpMethod: 'POST',
    respondWith: 'json',
    responseBody: `={{ { test_id: (${CREATE}.id || (${CREATE}.ids && ${CREATE}.ids[0]) || null), status: 'ready', validation_score: Number(${SCHWEDELSON}.validation && ${SCHWEDELSON}.validation.preview_score) || 0, power_status: (${SAMPLE}.power_quality || 'unknown') } }}`,
    options: {},
  },
  'Respond: Abort (A/A Bias)': {
    httpMethod: 'POST',
    respondWith: 'json',
    responseBody: `={{ { status: 'error', reason: 'A/A control test detected segment bias. Abort test and resegment contacts.' } }}`,
    options: {},
  },
}

const { workflows } = await listN8nWorkflows()
const targets = workflows.filter(w => /Subject Line A\/B/i.test(w.name))
if (!targets.length) { console.error('No Subject Line A/B workflow found.'); process.exit(1) }

const CLEAR_ON_REWRITE = ['formData', 'bodyParameters', 'queryParameters', 'authentication']
for (const w of targets) {
  console.log(`\n=== ${w.name} (${w.id})`)
  const detail = await fetchWorkflowDetail(w.id)
  if (!detail.ok || !detail.json?.nodes) { console.error(`   ✗ fetch failed: ${detail.status}`); continue }
  const wf = detail.json
  let changed = 0
  const missing = []
  for (const node of wf.nodes) {
    const fix = FIXED_PARAMS[node.name]
    if (!fix) continue
    const before = JSON.stringify(node.parameters)
    const baseParams = { ...(node.parameters || {}) }
    for (const key of CLEAR_ON_REWRITE) delete baseParams[key]
    node.parameters = { ...baseParams, ...fix }
    if (JSON.stringify(node.parameters) !== before) { changed++; console.log(`   rewrote: ${node.name}`) }
  }
  for (const name of Object.keys(FIXED_PARAMS)) {
    if (!wf.nodes.some(n => n.name === name)) missing.push(name)
  }
  if (missing.length) console.log('   ⚠ missing nodes:', missing)
  if (!changed) { console.log('   (no changes)'); continue }
  if (DRY) { console.log(`   [DRY] would PUT ${changed} node rewrites`); continue }
  const put = await fetchJson(ep.n8n + '/api/v1/workflows/' + w.id, {
    method: 'PUT', headers: H,
    body: JSON.stringify({
      name: wf.name, nodes: wf.nodes, connections: wf.connections,
      settings: wf.settings || { executionOrder: 'v1' },
    }),
  })
  if (put.ok) {
    console.log(`   ✓ PUT 200 — ${changed} nodes patched`)
    if (w.active) {
      await fetchJson(ep.n8n + '/api/v1/workflows/' + w.id + '/deactivate', { method:'POST', headers:H, body:'{}' })
      await new Promise(r => setTimeout(r, 800))
      await fetchJson(ep.n8n + '/api/v1/workflows/' + w.id + '/activate', { method:'POST', headers:H, body:'{}' })
      console.log(`   ✓ reactivated`)
    }
  } else {
    console.log(`   ✗ PUT ${put.status}: ${put.text?.slice(0, 400) || put.error}`)
  }
}
console.log('\nDone.')
