#!/usr/bin/env node
/**
 * Sweep patcher: change typeValidation from 'strict' to 'loose' on all IF nodes
 * in all active workflows. n8n 1.x strict mode rejects 'true' string as boolean,
 * breaking workflows where an IF condition reads `$json.flag` that's serialized
 * as string in JSON. Loose coerces.
 */
import { endpoints } from './lib/env.mjs'
import { fetchJson } from './lib/fetch.mjs'
import { listN8nWorkflows, fetchWorkflowDetail } from './lib/workflows.mjs'

const ep = endpoints()
const H = { 'X-N8N-API-KEY': ep.N8N_API_KEY, 'Content-Type': 'application/json', 'Accept': 'application/json' }
const DRY = process.argv.includes('--dry-run')

const { workflows } = await listN8nWorkflows()
let totalTouched = 0
for (const w of workflows) {
  if (!w.active) continue
  const detail = await fetchWorkflowDetail(w.id)
  if (!detail.ok || !detail.json?.nodes) continue
  const wf = detail.json
  let changedNodes = 0
  for (const node of wf.nodes) {
    if (node.type !== 'n8n-nodes-base.if') continue
    const params = node.parameters || {}
    const options = params.conditions?.options || {}
    if (options.typeValidation === 'strict') {
      options.typeValidation = 'loose'
      params.conditions.options = options
      node.parameters = params
      changedNodes++
    }
  }
  if (!changedNodes) continue
  console.log(`=== ${w.name} (${w.id}): ${changedNodes} IF node(s) → loose`)
  totalTouched++
  if (DRY) continue
  const put = await fetchJson(ep.n8n + '/api/v1/workflows/' + w.id, {
    method: 'PUT', headers: H,
    body: JSON.stringify({
      name: wf.name, nodes: wf.nodes, connections: wf.connections,
      settings: wf.settings || { executionOrder: 'v1' },
    }),
  })
  if (put.ok) {
    console.log(`   ✓ PUT 200`)
    // reactivate cycle so new config takes effect
    await fetchJson(ep.n8n + '/api/v1/workflows/' + w.id + '/deactivate', { method:'POST', headers:H, body:'{}' })
    await new Promise(r => setTimeout(r, 500))
    await fetchJson(ep.n8n + '/api/v1/workflows/' + w.id + '/activate', { method:'POST', headers:H, body:'{}' })
    console.log(`   ✓ reactivated`)
  } else {
    console.log(`   ✗ PUT ${put.status}: ${put.text?.slice(0, 300) || put.error}`)
  }
}
console.log(`\nTotal workflows patched: ${totalTouched}`)
