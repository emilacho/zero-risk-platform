#!/usr/bin/env node
// Scan ALL active workflows and report any with broken connection references.
// Helps batch-identify workflows that need `patch-wf-connections.mjs` treatment.

import { endpoints } from './lib/env.mjs'
import { fetchJson } from './lib/fetch.mjs'
import { listN8nWorkflows, fetchWorkflowDetail } from './lib/workflows.mjs'

const ep = endpoints()

const { workflows } = await listN8nWorkflows()
console.log(`Scanning ${workflows.length} workflows for broken connection refs...\n`)

const issues = []
for (const w of workflows) {
  const detail = await fetchWorkflowDetail(w.id)
  if (!detail.ok || !detail.json?.nodes) continue
  const wf = detail.json
  const nameSet = new Set(wf.nodes.map(n => n.name))
  const badRefs = []
  for (const [src, outputs] of Object.entries(wf.connections || {})) {
    if (!nameSet.has(src)) badRefs.push({ kind: 'missing_source', src })
    for (const branch of outputs.main || []) {
      for (const edge of branch || []) {
        if (!nameSet.has(edge.node)) badRefs.push({ kind: 'missing_target', src, target: edge.node })
      }
    }
  }
  if (badRefs.length) {
    issues.push({ id: w.id, name: w.name, badRefs, nodeNames: [...nameSet] })
  }
  await new Promise(r => setTimeout(r, 300))
}

if (!issues.length) { console.log('✓ No broken connections detected.'); process.exit(0) }

console.log(`Found ${issues.length} workflows with broken refs:\n`)
for (const w of issues) {
  console.log(`\n=== ${w.name}  (${w.id})`)
  console.log(`   Nodes (${w.nodeNames.length}): ${w.nodeNames.join(', ').slice(0, 250)}${w.nodeNames.join(', ').length > 250 ? '...' : ''}`)
  console.log(`   Broken refs:`)
  for (const r of w.badRefs) {
    if (r.kind === 'missing_source') console.log(`     src: "${r.src}"  (not in nodes)`)
    else console.log(`     "${r.src}" -> "${r.target}"  (target missing)`)
  }
  // Suggest renames via fuzzy match
  const suggestions = []
  for (const r of w.badRefs) {
    if (r.kind === 'missing_target') {
      const best = w.nodeNames.find(n => n.includes(r.target) || r.target.includes(n))
      if (best) suggestions.push(`"${r.target}=${best}"`)
    }
  }
  if (suggestions.length) {
    console.log(`   Suggested patch-wf-connections.mjs args:`)
    console.log(`     node scripts/smoke-test/patch-wf-connections.mjs ${w.id} ${suggestions.join(' ')}`)
  }
}
