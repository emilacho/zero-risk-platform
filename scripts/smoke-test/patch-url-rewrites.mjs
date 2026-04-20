#!/usr/bin/env node
// Batch URL rewrites across all workflows.
// Pairs are provided as args: oldPath=newPath  (ex: /api/agents/run-sdk=/api/agents/run)
// Matches occur in any node's parameters.url (as substring — keeps envs/hosts intact).
//
// Usage: node scripts/smoke-test/patch-url-rewrites.mjs "/api/agents/run-sdk=/api/agents/run" [...]

import { endpoints } from './lib/env.mjs'
import { fetchJson } from './lib/fetch.mjs'
import { listN8nWorkflows, fetchWorkflowDetail } from './lib/workflows.mjs'

const ep = endpoints()
const H = { 'X-N8N-API-KEY': ep.N8N_API_KEY, 'Content-Type': 'application/json', 'Accept': 'application/json' }
const DRY = process.argv.includes('--dry-run')

const renames = {}
for (const a of process.argv.slice(2)) {
  if (a.startsWith('--')) continue
  const eq = a.indexOf('=')
  if (eq < 0) continue
  renames[a.slice(0, eq)] = a.slice(eq + 1)
}
if (!Object.keys(renames).length) {
  console.error('Usage: patch-url-rewrites.mjs "oldPath=newPath" [...]')
  process.exit(1)
}
console.log('URL rewrites:', renames)

const { workflows } = await listN8nWorkflows()
console.log(`Scanning ${workflows.length} workflows...\n`)

let totalPatched = 0, totalWfPatched = 0, totalFailed = 0
for (const w of workflows) {
  const detail = await fetchWorkflowDetail(w.id)
  if (!detail.ok || !detail.json?.nodes) continue
  const wf = detail.json

  let changes = 0
  for (const n of wf.nodes) {
    const url = n.parameters?.url
    if (!url || typeof url !== 'string') continue
    let newUrl = url
    for (const [from, to] of Object.entries(renames)) {
      if (newUrl.includes(from)) {
        newUrl = newUrl.split(from).join(to)
      }
    }
    if (newUrl !== url) {
      n.parameters.url = newUrl
      changes++
    }
  }

  if (!changes) continue

  console.log(`\n${w.name}  (${changes} url rewrites)`)
  if (DRY) { totalPatched += changes; totalWfPatched++; continue }
  const put = await fetchJson(ep.n8n + '/api/v1/workflows/' + w.id, {
    method: 'PUT', headers: H,
    body: JSON.stringify({ name: wf.name, nodes: wf.nodes, connections: wf.connections, settings: wf.settings || { executionOrder: 'v1' } }),
  })
  if (put.ok) {
    totalPatched += changes
    totalWfPatched++
    console.log('   ✓ PUT 200')
    if (w.active) {
      await fetchJson(ep.n8n + '/api/v1/workflows/' + w.id + '/deactivate', { method:'POST', headers:H, body:'{}' })
      await new Promise(r => setTimeout(r, 800))
      await fetchJson(ep.n8n + '/api/v1/workflows/' + w.id + '/activate', { method:'POST', headers:H, body:'{}' })
    }
  } else {
    console.log(`   ✗ PUT ${put.status}: ${put.text || put.error}`)
    totalFailed++
  }
  await new Promise(r => setTimeout(r, 400))
}

console.log(`\nSummary: wf_patched=${totalWfPatched}  url_rewrites=${totalPatched}  failed=${totalFailed}${DRY ? '  (DRY)' : ''}`)
