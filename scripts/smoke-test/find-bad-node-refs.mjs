#!/usr/bin/env node
// Scan all workflows for Code/HTTP nodes that reference $node['X'] where X doesn't exist.
// These cause "Referenced node doesn't exist" errors at runtime.

import { endpoints } from './lib/env.mjs'
import { listN8nWorkflows, fetchWorkflowDetail } from './lib/workflows.mjs'

const ep = endpoints()
const { workflows } = await listN8nWorkflows()
console.log(`Scanning ${workflows.length} workflows for bad $node[...] refs in Code/HTTP bodies...\n`)

const issues = []
for (const w of workflows) {
  const detail = await fetchWorkflowDetail(w.id)
  if (!detail.ok || !detail.json?.nodes) continue
  const wf = detail.json
  const nameSet = new Set(wf.nodes.map(n => n.name))
  const bad = []
  for (const n of wf.nodes) {
    const sources = []
    if (n.parameters?.jsCode) sources.push({ source: 'jsCode', text: n.parameters.jsCode })
    if (n.parameters?.jsonBody) sources.push({ source: 'jsonBody', text: n.parameters.jsonBody })
    if (n.parameters?.url) sources.push({ source: 'url', text: n.parameters.url })
    for (const s of sources) {
      const re = /\$node\[['"]([^'"]+)['"]\]/g
      let m
      while ((m = re.exec(s.text)) !== null) {
        if (!nameSet.has(m[1])) {
          bad.push({ node: n.name, source: s.source, ref: m[1] })
        }
      }
    }
  }
  if (bad.length) {
    issues.push({ id: w.id, name: w.name, bad, nodeNames: [...nameSet] })
  }
  await new Promise(r => setTimeout(r, 300))
}

if (!issues.length) { console.log('✓ No bad $node[...] refs detected.'); process.exit(0) }

console.log(`Found ${issues.length} workflows with bad $node[...] refs:\n`)
for (const w of issues) {
  console.log(`\n=== ${w.name}  (${w.id})`)
  // Dedupe by ref
  const byRef = {}
  for (const b of w.bad) {
    byRef[b.ref] = byRef[b.ref] || []
    byRef[b.ref].push(b.node + '.' + b.source)
  }
  for (const [ref, uses] of Object.entries(byRef)) {
    const best = w.nodeNames.find(n => n.toLowerCase().includes(ref.toLowerCase()) || ref.toLowerCase().includes(n.toLowerCase()))
    console.log(`   bad ref: "${ref}"  used in ${uses.length} place(s): ${uses.slice(0,3).join(', ')}`)
    if (best) console.log(`     → fuzzy match: "${best}"`)
  }
}
