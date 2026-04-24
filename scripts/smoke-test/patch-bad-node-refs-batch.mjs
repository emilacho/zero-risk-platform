#!/usr/bin/env node
/**
 * BATCH PATCHER — sweep de bad $node[] refs sobre todos los workflows.
 *
 * Pattern detectado en Sesiones 32-33: muchos workflows `proposed-sesion27b`
 * y `tier-2` usan `$node['slug-or-id']` (formato viejo) en lugar de
 * `$('Exact Display Name').item.json`. En n8n 1.x+, $node[<ID>] NO resuelve
 * correctamente → "Referenced node doesn't exist" en runtime.
 *
 * Este patcher:
 *   1. Lista todos los workflows activos en n8n
 *   2. Para cada uno, construye un mapa id → display_name
 *   3. Para cada nodo, escanea todos los campos con regex /\$node\[['"]([^'"]+)['"]\]/
 *   4. Si la ref es un ID conocido en ese workflow → reescribe a $('Display Name').item.json
 *   5. Si la ref NO matchea ni ID ni display name → log warning
 *   6. PUT + reactivate del workflow
 *
 * Uso:
 *   node scripts/smoke-test/patch-bad-node-refs-batch.mjs            # aplicar a todos los activos
 *   node scripts/smoke-test/patch-bad-node-refs-batch.mjs --dry-run  # solo mostrar changes
 *   node scripts/smoke-test/patch-bad-node-refs-batch.mjs --name "NEXUS"  # filtrar por nombre
 */
import { endpoints } from './lib/env.mjs'
import { fetchJson } from './lib/fetch.mjs'
import { listN8nWorkflows, fetchWorkflowDetail } from './lib/workflows.mjs'

const ep = endpoints()
const H = { 'X-N8N-API-KEY': ep.N8N_API_KEY, 'Content-Type': 'application/json', 'Accept': 'application/json' }
const DRY = process.argv.includes('--dry-run')
const nameFilterIdx = process.argv.indexOf('--name')
const NAME_FILTER = nameFilterIdx >= 0 ? process.argv[nameFilterIdx + 1] : null

// $node['X'] — captures X (slug/id/name)
const NODE_REF_RE = /\$node\[['"]([^'"]+)['"]\]/g

function rewriteParamsJson(paramsJson, idToName, allNames) {
  let changedCount = 0
  const warnings = []
  const out = paramsJson.replace(NODE_REF_RE, (match, ref) => {
    // If ref is already a display name → fine, leave as $node['Name'] (still valid in 1.x)
    if (allNames.has(ref)) {
      return match
    }
    // If ref is a known node ID → rewrite to $('Display Name').item.json
    if (idToName[ref]) {
      changedCount++
      return `$('${idToName[ref]}').item.json`
    }
    // Unknown — broken ref
    warnings.push(ref)
    return match
  })
  return { out, changedCount, warnings }
}

const { workflows } = await listN8nWorkflows()
const targets = workflows.filter(w => {
  if (!w.active) return false
  if (NAME_FILTER && !w.name.toLowerCase().includes(NAME_FILTER.toLowerCase())) return false
  return true
})

console.log(`\nScanning ${targets.length} active workflow(s)${NAME_FILTER ? ` matching "${NAME_FILTER}"` : ''}${DRY ? ' (dry-run)' : ''}\n`)

let totalWorkflowsChanged = 0
let totalRefsRewritten = 0
let totalBrokenRefs = 0
const allWarnings = []

for (const w of targets) {
  const detail = await fetchWorkflowDetail(w.id)
  if (!detail.ok || !detail.json?.nodes) {
    console.log(`  ✗ ${w.name} — fetch failed (${detail.status})`)
    continue
  }
  const wf = detail.json

  // Build id → display name map
  const idToName = {}
  const allNames = new Set()
  for (const n of wf.nodes) {
    idToName[n.id] = n.name
    allNames.add(n.name)
  }

  let workflowChanged = false
  let workflowRefsRewritten = 0
  const workflowWarnings = []

  for (const node of wf.nodes) {
    if (!node.parameters) continue
    const before = JSON.stringify(node.parameters)
    const { out, changedCount, warnings } = rewriteParamsJson(before, idToName, allNames)
    if (changedCount > 0) {
      node.parameters = JSON.parse(out)
      workflowChanged = true
      workflowRefsRewritten += changedCount
    }
    for (const w of warnings) {
      workflowWarnings.push({ node: node.name, ref: w })
    }
  }

  if (!workflowChanged && workflowWarnings.length === 0) continue

  console.log(`=== ${w.name} (${w.id})`)
  if (workflowRefsRewritten > 0) {
    console.log(`   ✓ rewrote ${workflowRefsRewritten} ref(s)`)
  }
  if (workflowWarnings.length > 0) {
    console.log(`   ⚠ ${workflowWarnings.length} broken ref(s) (not an ID nor a display name):`)
    for (const w of workflowWarnings) {
      console.log(`      [${w.node}] $node['${w.ref}']`)
      allWarnings.push({ wf: w.name, ...w })
    }
    totalBrokenRefs += workflowWarnings.length
  }

  if (!workflowChanged) continue

  if (DRY) {
    console.log(`   [DRY] would PUT + reactivate`)
    totalWorkflowsChanged++
    totalRefsRewritten += workflowRefsRewritten
    continue
  }

  const put = await fetchJson(ep.n8n + '/api/v1/workflows/' + w.id, {
    method: 'PUT', headers: H,
    body: JSON.stringify({
      name: wf.name, nodes: wf.nodes, connections: wf.connections,
      settings: wf.settings || { executionOrder: 'v1' },
    }),
  })

  if (put.ok) {
    console.log(`   ✓ PUT 200`)
    totalWorkflowsChanged++
    totalRefsRewritten += workflowRefsRewritten

    // Reactivate (deactivate + sleep + activate) so new refs take effect
    await fetchJson(ep.n8n + '/api/v1/workflows/' + w.id + '/deactivate', { method: 'POST', headers: H, body: '{}' })
    await new Promise(r => setTimeout(r, 600))
    await fetchJson(ep.n8n + '/api/v1/workflows/' + w.id + '/activate', { method: 'POST', headers: H, body: '{}' })
    console.log(`   ✓ reactivated`)
  } else {
    console.log(`   ✗ PUT ${put.status}: ${put.text?.slice(0, 300) || put.error}`)
  }
}

console.log(`\n=== SUMMARY ===`)
console.log(`Workflows scanned:    ${targets.length}`)
console.log(`Workflows changed:    ${totalWorkflowsChanged}`)
console.log(`Refs rewritten:       ${totalRefsRewritten}`)
console.log(`Broken refs (TODO):   ${totalBrokenRefs}`)

if (allWarnings.length > 0) {
  console.log(`\n=== BROKEN REFS REPORT ===`)
  const byWf = {}
  for (const w of allWarnings) {
    byWf[w.wf] ||= []
    byWf[w.wf].push(`${w.node}: $node['${w.ref}']`)
  }
  for (const [name, refs] of Object.entries(byWf)) {
    console.log(`\n${name}`)
    for (const r of refs) console.log(`  ${r}`)
  }
  console.log(`\nNote: broken refs are either (a) references to DELETED nodes — remove the expression, or (b) typos in slugs. Manual fix required.`)
}
