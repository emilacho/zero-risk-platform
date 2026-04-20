#!/usr/bin/env node
// Patch a specific node's jsonBody on a workflow.
// Usage: node patch-wf-node-body.mjs <workflowId> <nodeName> <path-to-body.txt>
//
// The body file is read verbatim and replaces the node's parameters.jsonBody.
// After PUT, deactivate+activate to re-register webhooks.

import { readFileSync } from 'fs'
import { endpoints } from './lib/env.mjs'
import { fetchJson } from './lib/fetch.mjs'

const ep = endpoints()
const H = { 'X-N8N-API-KEY': ep.N8N_API_KEY, 'Content-Type': 'application/json', 'Accept': 'application/json' }

const [id, nodeName, bodyPath] = process.argv.slice(2)
if (!id || !nodeName || !bodyPath) {
  console.error('Usage: patch-wf-node-body.mjs <workflowId> <nodeName> <body-file.txt>')
  process.exit(1)
}

const body = readFileSync(bodyPath, 'utf-8')

const r = await fetchJson(ep.n8n + '/api/v1/workflows/' + id, { headers: H })
const wf = r.json
if (!wf) { console.error('fetch failed:', r.status); process.exit(1) }

const node = wf.nodes.find(n => n.name === nodeName)
if (!node) { console.error(`node "${nodeName}" not found. Available:`, wf.nodes.map(n => n.name)); process.exit(1) }

console.log('Before:', (node.parameters?.jsonBody || '').slice(0, 120))
node.parameters.jsonBody = body
console.log('After :', body.slice(0, 120))

const put = await fetchJson(ep.n8n + '/api/v1/workflows/' + id, {
  method: 'PUT', headers: H,
  body: JSON.stringify({ name: wf.name, nodes: wf.nodes, connections: wf.connections, settings: wf.settings || { executionOrder: 'v1' } }),
})
console.log('PUT status:', put.status, put.ok ? '✓' : '✗')

await fetchJson(ep.n8n + '/api/v1/workflows/' + id + '/deactivate', { method: 'POST', headers: H, body: '{}' })
await new Promise(r => setTimeout(r, 2000))
const act = await fetchJson(ep.n8n + '/api/v1/workflows/' + id + '/activate', { method: 'POST', headers: H, body: '{}' })
console.log('Reactivated:', act.status)
