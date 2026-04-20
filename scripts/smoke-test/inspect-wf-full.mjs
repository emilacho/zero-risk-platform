#!/usr/bin/env node
// Deep inspector: full workflow dump + integrity checks (broken conns, credential refs, etc.)
// Usage: node scripts/smoke-test/inspect-wf-full.mjs <id>
import { endpoints } from './lib/env.mjs'
import { fetchJson } from './lib/fetch.mjs'

const ep = endpoints()
const H = { 'X-N8N-API-KEY': ep.N8N_API_KEY }
const id = process.argv[2]
if (!id) { console.error('Usage: inspect-wf-full.mjs <id>'); process.exit(1) }

const r = await fetchJson(ep.n8n + '/api/v1/workflows/' + id, { headers: H })
const wf = r.json
if (!wf || !wf.nodes) { console.error('fetch failed:', r.status); process.exit(1) }

console.log('=== Workflow:', wf.name)
console.log('   id:', wf.id, '  active:', wf.active, '  nodes:', wf.nodes.length)

// 1. Duplicate node names?
const names = wf.nodes.map(n => n.name)
const dupes = names.filter((n, i) => names.indexOf(n) !== i)
if (dupes.length) console.log('⚠ DUPLICATE NODE NAMES:', [...new Set(dupes)])

// 2. Connections reference non-existent nodes?
const nameSet = new Set(names)
const badRefs = []
for (const [src, outputs] of Object.entries(wf.connections || {})) {
  if (!nameSet.has(src)) badRefs.push(`source "${src}" not in nodes`)
  for (const branch of outputs.main || []) {
    for (const edge of branch || []) {
      if (!nameSet.has(edge.node)) badRefs.push(`${src} → "${edge.node}" (target missing)`)
    }
  }
}
if (badRefs.length) console.log('⚠ BROKEN CONNECTIONS:')
badRefs.forEach(r => console.log('  ', r))

// 3. Credential refs
for (const n of wf.nodes) {
  if (n.credentials && Object.keys(n.credentials).length) {
    console.log(`[creds] ${n.name}: ${Object.keys(n.credentials).join(', ')}`)
  }
}

// 4. Webhook nodes
const wh = wf.nodes.filter(n => n.type === 'n8n-nodes-base.webhook')
console.log('\nWebhook triggers:', wh.length)
for (const w of wh) {
  console.log(`  ${w.name}: path="${w.parameters?.path}" method=${w.parameters?.httpMethod} responseMode=${w.parameters?.responseMode || 'onReceived'}`)
}

// 5. Dangling nodes (not in any connection)
const referenced = new Set()
referenced.add(...names.filter(n => wh.some(w => w.name === n)))  // webhook sources start
for (const [src, outputs] of Object.entries(wf.connections || {})) {
  referenced.add(src)
  for (const branch of outputs.main || []) for (const edge of branch || []) referenced.add(edge.node)
}
const dangling = names.filter(n => !referenced.has(n) && !wh.some(w => w.name === n))
if (dangling.length) console.log('⚠ DANGLING NODES (not reachable):', dangling)

// 6. All node types with errors if any
console.log('\nNode types + disabled state:')
for (const n of wf.nodes) {
  const flags = []
  if (n.disabled) flags.push('DISABLED')
  if (n.continueOnFail) flags.push('continueOnFail')
  if (n.onError) flags.push(`onError=${n.onError}`)
  console.log(`  [${n.type.replace('n8n-nodes-base.', '').padEnd(12)}] ${n.name}${flags.length ? '  ('+flags.join(',')+')' : ''}`)
}

// 7. Print the connections graph
console.log('\nConnections graph:')
for (const [src, outputs] of Object.entries(wf.connections || {})) {
  for (let i = 0; i < (outputs.main || []).length; i++) {
    for (const edge of outputs.main[i] || []) {
      console.log(`  ${src.padEnd(40)} --[${i}]--> ${edge.node}`)
    }
  }
}
