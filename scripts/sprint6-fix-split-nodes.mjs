#!/usr/bin/env node
/**
 * scripts/sprint6-fix-split-nodes.mjs · Sprint 6 Track B · CC#2
 *
 * Fix the `fieldToSplitOut` parameter missing on Split In Batches v3+ nodes
 * in 3kEC (Cannibalization Audit) + F2oU (GEO Freshness) · then re-activate.
 *
 * n8n v1+ requires `splitInBatches.fieldToSplitOut` for Split nodes.
 * The previous workflow JSONs predate that requirement.
 *
 * Strategy ·
 *   1. GET workflow by ID
 *   2. Find Split nodes missing fieldToSplitOut · inspect preceding node output
 *   3. Set sensible default · "items" or detect from prior node's output schema
 *   4. PUT workflow (n8n PATCH endpoint is /workflows/{id} · full body)
 *   5. Re-activate
 */
import fs from 'node:fs'
import path from 'node:path'

const env = fs
  .readFileSync(path.resolve('.env.local'), 'utf8')
  .split('\n')
  .reduce((acc, l) => {
    const m = l.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m) acc[m[1]] = m[2].replace(/^"|"$/g, '')
    return acc
  }, {})

const N8N_BASE = env.N8N_BASE_URL || 'https://n8n-production-72be.up.railway.app'
const N8N_KEY = env.N8N_API_KEY

const headers = { 'X-N8N-API-KEY': N8N_KEY, 'Content-Type': 'application/json' }

const TARGETS = [
  { idPrefix: '3kEC', name: 'SEO Cannibalization Audit Weekly', defaultField: 'clients' },
  { idPrefix: 'F2oU', name: 'GEO Content Freshness Cron', defaultField: 'pages' },
]

console.log('--- GET all workflows ---')
const list = await fetch(`${N8N_BASE}/api/v1/workflows?limit=250`, { headers })
const workflows = (await list.json()).data ?? []

for (const t of TARGETS) {
  const wf = workflows.find((w) => (w.id ?? '').startsWith(t.idPrefix))
  if (!wf) {
    console.error(`SKIP · ${t.idPrefix} not found`)
    continue
  }

  console.log(`\n--- ${wf.id}  ${wf.name} ---`)

  // Get full workflow detail
  const detailRes = await fetch(`${N8N_BASE}/api/v1/workflows/${wf.id}`, { headers })
  if (!detailRes.ok) {
    console.error(`  FAIL get detail · ${detailRes.status}`)
    continue
  }
  const detail = await detailRes.json()
  const nodes = detail.nodes ?? []

  let fixedCount = 0
  let suggestedField = t.defaultField

  for (const node of nodes) {
    if (!node.type || node.type !== 'n8n-nodes-base.splitOut') continue
    const params = node.parameters ?? {}
    if (params.fieldToSplitOut && params.fieldToSplitOut.length > 0) continue

    // Find the preceding node to infer the field name
    const preceding = findPrecedingNode(detail, node.name)
    if (preceding) {
      console.log(`  found Split node "${node.name}" · preceded by "${preceding.name}" (${preceding.type})`)
    }

    // Try to guess sensible field name from previous node output
    let fieldGuess = suggestedField
    if (preceding && preceding.parameters?.jsCode) {
      // Look for `return [{ json: { <key>: [...] } }]` or similar arrays
      const code = preceding.parameters.jsCode
      const arrayKey = code.match(/return\s*\[?\s*\{[^}]*?\b(\w+)\s*:\s*\[/)
      if (arrayKey && arrayKey[1]) {
        fieldGuess = arrayKey[1]
      }
    } else if (preceding && preceding.type?.includes('postgres')) {
      // SQL query output is `data` array typically
      fieldGuess = 'data'
    }

    console.log(`  setting fieldToSplitOut = "${fieldGuess}"`)
    node.parameters = { ...params, fieldToSplitOut: fieldGuess }
    fixedCount++
  }

  if (fixedCount === 0) {
    console.log('  no broken Split nodes found · maybe already fixed by another CC')
    continue
  }
  console.log(`  ${fixedCount} Split node(s) patched`)

  // Normalize connections · GET returns { node } but PUT requires { node, type, index }
  const normalizedConnections = {}
  for (const [src, conns] of Object.entries(detail.connections ?? {})) {
    normalizedConnections[src] = {}
    for (const [branch, arrays] of Object.entries(conns ?? {})) {
      normalizedConnections[src][branch] = (arrays ?? []).map((arr) =>
        (arr ?? []).map((c) => ({
          node: c.node,
          type: c.type ?? 'main',
          index: typeof c.index === 'number' ? c.index : 0,
        })),
      )
    }
  }

  // PUT updated workflow · n8n PATCH endpoint is /workflows/{id}
  const updateBody = {
    name: detail.name,
    nodes: detail.nodes,
    connections: normalizedConnections,
    settings: detail.settings ?? {},
  }
  const updateRes = await fetch(`${N8N_BASE}/api/v1/workflows/${wf.id}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify(updateBody),
  })
  const updateBody2 = await updateRes.text()
  if (!updateRes.ok) {
    console.error(`  FAIL PUT · ${updateRes.status} · ${updateBody2.slice(0, 300)}`)
    continue
  }
  console.log(`  PUT OK · status ${updateRes.status}`)

  // Activate
  const actRes = await fetch(`${N8N_BASE}/api/v1/workflows/${wf.id}/activate`, {
    method: 'POST',
    headers,
  })
  if (actRes.ok) {
    console.log(`  ACTIVATE OK · status ${actRes.status}`)
  } else {
    const actBody = await actRes.text()
    console.error(`  ACTIVATE FAIL · ${actRes.status} · ${actBody.slice(0, 300)}`)
  }
}

console.log('\n--- post-fix verify ---')
const verifyRes = await fetch(`${N8N_BASE}/api/v1/workflows?limit=250&active=true`, { headers })
const activeNow = (await verifyRes.json()).data ?? []
console.log(`active count now: ${activeNow.length}`)

function findPrecedingNode(workflow, targetNodeName) {
  const connections = workflow.connections ?? {}
  // connections is keyed by source node name · find a connection whose target includes targetNodeName
  for (const [sourceName, sourceConns] of Object.entries(connections)) {
    const mainConns = sourceConns?.main ?? []
    for (const branch of mainConns) {
      for (const conn of branch ?? []) {
        if (conn?.node === targetNodeName) {
          return workflow.nodes.find((n) => n.name === sourceName)
        }
      }
    }
  }
  return null
}
