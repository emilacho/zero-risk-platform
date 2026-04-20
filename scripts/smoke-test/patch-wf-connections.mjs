#!/usr/bin/env node
// Generic workflow connection name patcher.
// Given a workflow id + rename map, rewrites the connections JSON and PUTs it back.
//
// Usage: node scripts/smoke-test/patch-wf-connections.mjs <id> <oldName>=<newName> [<oldName>=<newName> ...]

import { endpoints } from './lib/env.mjs'
import { fetchJson } from './lib/fetch.mjs'

const ep = endpoints()
const H = { 'X-N8N-API-KEY': ep.N8N_API_KEY, 'Content-Type': 'application/json', 'Accept': 'application/json' }

const [id, ...maps] = process.argv.slice(2)
if (!id || !maps.length) {
  console.error('Usage: patch-wf-connections.mjs <id> "oldName=newName" [...]')
  process.exit(1)
}

const renames = {}
for (const m of maps) {
  const eq = m.indexOf('=')
  if (eq < 0) continue
  renames[m.slice(0, eq)] = m.slice(eq + 1)
}

console.log('Renames:', renames)

const r = await fetchJson(ep.n8n + '/api/v1/workflows/' + id, { headers: H })
const wf = r.json
if (!wf || !wf.nodes) { console.error('fetch failed:', r.status); process.exit(1) }

// Rewrite connections: keys AND inner edge .node refs
const rebuilt = {}
for (const [src, outputs] of Object.entries(wf.connections || {})) {
  const newSrc = renames[src] || src
  rebuilt[newSrc] = { main: (outputs.main || []).map(branch =>
    (branch || []).map(edge => ({
      ...edge,
      node: renames[edge.node] || edge.node,
    }))
  )}
}

// Count actual changes
let changed = 0
for (const key of Object.keys(rebuilt)) {
  if (!(key in (wf.connections || {}))) changed++
  for (const branch of rebuilt[key].main) {
    for (const edge of branch) {
      if (renames[edge.node]) changed++
    }
  }
}

console.log(`Detected ${changed} rewrites in connections. Applying PUT...`)

const put = await fetchJson(ep.n8n + '/api/v1/workflows/' + id, {
  method: 'PUT',
  headers: H,
  body: JSON.stringify({
    name: wf.name,
    nodes: wf.nodes,
    connections: rebuilt,
    settings: wf.settings || { executionOrder: 'v1' },
  }),
})

console.log('PUT status:', put.status, put.ok ? '✓' : '✗')

// Reactivate to register the webhook with the fixed graph
const act = await fetchJson(ep.n8n + '/api/v1/workflows/' + id + '/deactivate', { method: 'POST', headers: H, body: '{}' })
console.log('deactivate:', act.status)
await new Promise(r => setTimeout(r, 2000))
const act2 = await fetchJson(ep.n8n + '/api/v1/workflows/' + id + '/activate', { method: 'POST', headers: H, body: '{}' })
console.log('activate:', act2.status)
