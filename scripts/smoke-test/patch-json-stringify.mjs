#!/usr/bin/env node
// Batch patcher: for HTTP nodes with jsonBody templates that interpolate
// agent/Claude output (which contains literal newlines + quotes breaking JSON),
// wrap the expression in JSON.stringify() and remove the surrounding quotes.
//
// Pattern targeted:
//   "field": "{{ $node['X'].json.output }}"           →  "field": {{ JSON.stringify($node['X'].json.output || '') }}
//   "field": "{{ $node['X'].json.response }}"         →  same
//   "field": "{{ $node['X'].json.result }}"           →  same
//   "field": "{{ $node['X'].json.content }}"          →  same
//   "field": "{{ $node['X'].json.text }}"             →  same
//   "field": "{{ $node['X'].json.body }}"             →  same
//   "field": "{{ $node['X'].json.markdown }}"         →  same
//
// Non-targeted (they're safe — strings, IDs, etc):
//   "field": "{{ $node['X'].json.id }}"
//   "field": "{{ $json.client_id }}"
//
// Idempotent: JSON.stringify(JSON.stringify(...)) is fine (just double-escapes once).
//
// Usage: node scripts/smoke-test/patch-json-stringify.mjs [--dry-run]

import { endpoints } from './lib/env.mjs'
import { fetchJson } from './lib/fetch.mjs'
import { listN8nWorkflows, fetchWorkflowDetail } from './lib/workflows.mjs'

const ep = endpoints()
const H = { 'X-N8N-API-KEY': ep.N8N_API_KEY, 'Content-Type': 'application/json', 'Accept': 'application/json' }
const DRY = process.argv.includes('--dry-run')

// Fields that are known to hold agent/Claude markdown output and therefore
// need JSON.stringify wrapping when interpolated as a JSON string value.
const UNSAFE_FIELDS = ['output', 'response', 'result', 'content', 'text', 'body', 'markdown', 'rationale', 'analysis', 'summary']

// Regex: match "key": "{{ $node['...'].json.<unsafe_field> ... }}"
// where the surrounding double quotes are part of the JSON value wrapper.
// Group 1 = key name, Group 2 = the inner n8n expression body.
function buildRegex() {
  const fieldAlt = UNSAFE_FIELDS.join('|')
  // Match a quoted JSON string value containing an n8n template that references
  // $node['x'].json.<unsafe>  (with optional trailing chain, like .output || '')
  return new RegExp(
    `"([^"]+)"\\s*:\\s*"\\{\\{\\s*(\\$node\\[[^\\]]+\\]\\.json\\.(?:${fieldAlt})[^}]*?)\\s*\\}\\}"`,
    'g'
  )
}

function patchBody(body) {
  if (!body || typeof body !== 'string') return { newBody: body, changes: 0 }
  let changes = 0
  const re = buildRegex()
  const newBody = body.replace(re, (_m, key, expr) => {
    changes++
    return `"${key}": {{ JSON.stringify(${expr.trim()}) }}`
  })
  return { newBody, changes }
}

const { workflows } = await listN8nWorkflows()
console.log(`Scanning ${workflows.length} workflows for JSON body interpolation bugs...\n`)

let totalChanges = 0, wfTouched = 0, failed = 0
for (const w of workflows) {
  const detail = await fetchWorkflowDetail(w.id)
  if (!detail.ok || !detail.json?.nodes) continue
  const wf = detail.json
  let wfChanges = 0
  for (const n of wf.nodes) {
    if (n.type !== 'n8n-nodes-base.httpRequest') continue
    const { newBody, changes } = patchBody(n.parameters?.jsonBody || '')
    if (changes > 0) {
      n.parameters.jsonBody = newBody
      wfChanges += changes
    }
  }
  if (!wfChanges) continue
  console.log(`${w.name}  (${wfChanges} body fields wrapped)`)
  if (DRY) {
    totalChanges += wfChanges
    wfTouched++
    continue
  }
  const put = await fetchJson(ep.n8n + '/api/v1/workflows/' + w.id, {
    method: 'PUT', headers: H,
    body: JSON.stringify({ name: wf.name, nodes: wf.nodes, connections: wf.connections, settings: wf.settings || { executionOrder: 'v1' } }),
  })
  if (put.ok) {
    totalChanges += wfChanges
    wfTouched++
    if (w.active) {
      await fetchJson(ep.n8n + '/api/v1/workflows/' + w.id + '/deactivate', { method: 'POST', headers: H, body: '{}' })
      await new Promise(r => setTimeout(r, 800))
      await fetchJson(ep.n8n + '/api/v1/workflows/' + w.id + '/activate', { method: 'POST', headers: H, body: '{}' })
    }
    console.log(`   ✓ PUT 200`)
  } else {
    console.log(`   ✗ PUT ${put.status}: ${put.text || put.error}`)
    failed++
  }
  await new Promise(r => setTimeout(r, 400))
}

console.log(`\nSummary: workflows=${wfTouched}  body_rewrites=${totalChanges}  failed=${failed}${DRY ? '  (DRY)' : ''}`)
