#!/usr/bin/env node
// Inspector detallado de una execution: muestra input/output de cada node + errores completos.
// Usage: node scripts/smoke-test/inspect-exec.mjs <execId> [nodeName]

import { endpoints } from './lib/env.mjs'
import { fetchJson } from './lib/fetch.mjs'

const ep = endpoints()
const H = { 'X-N8N-API-KEY': ep.N8N_API_KEY }
const [execId, nodeFilter] = process.argv.slice(2)
if (!execId) { console.error('Usage: inspect-exec.mjs <execId> [nodeName]'); process.exit(1) }

const r = await fetchJson(ep.n8n + '/api/v1/executions/' + execId + '?includeData=true', { headers: H })
const e = r.json
if (!e?.data) { console.error('fetch failed:', r.status); process.exit(1) }

console.log('Status:', e.status, '  stoppedAt:', e.stoppedAt)
console.log('Top-level error:', e.data?.resultData?.error?.message || 'none')
console.log('Last node:', e.data?.resultData?.lastNodeExecuted)
console.log()

const runData = e.data?.resultData?.runData || {}
const nodes = Object.keys(runData)
console.log('Nodes ran:', nodes.length)
console.log()

for (const nname of nodes) {
  if (nodeFilter && !nname.includes(nodeFilter)) continue
  const arr = runData[nname]
  for (let i = 0; i < arr.length; i++) {
    const r = arr[i]
    console.log(`\n--- ${nname}  (iter ${i + 1}) ---`)
    if (r.error) {
      console.log('  ERROR message:', r.error.message)
      console.log('  ERROR description:', (r.error.description || '').slice(0, 500))
      console.log('  ERROR context:', JSON.stringify(r.error.context || {}).slice(0, 500))
      if (r.error.httpCode) console.log('  HTTP code:', r.error.httpCode)
    }
    // Input (what came INTO this node)
    const input = r.inputOverride || (i === 0 ? '(entry)' : null)
    // Output (what this node produced)
    const output = r.data?.main?.[0]?.[0]?.json
    if (output) console.log('  output:', JSON.stringify(output, null, 2).slice(0, 800))
  }
}
