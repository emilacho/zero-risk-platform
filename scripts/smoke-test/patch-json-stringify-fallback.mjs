#!/usr/bin/env node
/**
 * BATCH PATCHER — agrega defensive `?? null` a JSON.stringify(X) en jsonBody
 * templates de todos los workflows activos.
 *
 * Pattern del bug (documentado en S32):
 *   `"field": {{ JSON.stringify($json.X) }}`
 * Si $json.X es undefined → JSON.stringify(undefined) = undefined →
 * n8n renderiza literal `undefined` en el JSON body → invalid JSON → node fails.
 *
 * Fix: reescribir a `{{ JSON.stringify($json.X ?? null) }}` que siempre es
 * valid JSON (`null` se serializa correctamente).
 *
 * Este patcher:
 *   1. Lista workflows activos
 *   2. Para cada nodo, escanea jsonBody/responseBody (parameters.jsonBody, parameters.responseBody)
 *   3. Encuentra JSON.stringify(expr) donde expr incluye $json. o $(...) y NO tiene ?? or ||
 *   4. Reescribe a JSON.stringify((expr) ?? null)
 *   5. PUT + reactivate
 *
 * Uso: igual que patch-bad-node-refs-batch.mjs (--dry-run, --name).
 */
import { endpoints } from './lib/env.mjs'
import { fetchJson } from './lib/fetch.mjs'
import { listN8nWorkflows, fetchWorkflowDetail } from './lib/workflows.mjs'

const ep = endpoints()
const H = { 'X-N8N-API-KEY': ep.N8N_API_KEY, 'Content-Type': 'application/json', 'Accept': 'application/json' }
const DRY = process.argv.includes('--dry-run')
const nameFilterIdx = process.argv.indexOf('--name')
const NAME_FILTER = nameFilterIdx >= 0 ? process.argv[nameFilterIdx + 1] : null

// Captura: JSON.stringify(  ARG  )
// ARG puede tener paréntesis anidados hasta 2 niveles → usamos balanced parser manual.

function parseJsonStringifyArg(s, startIdx) {
  // startIdx apunta al caracter después de JSON.stringify(
  let depth = 1
  let i = startIdx
  while (i < s.length && depth > 0) {
    const c = s[i]
    if (c === '(') depth++
    else if (c === ')') {
      depth--
      if (depth === 0) return { end: i, arg: s.slice(startIdx, i) }
    }
    i++
  }
  return null
}

function rewriteJsonStringifyInString(raw) {
  // Find all JSON.stringify( occurrences
  const marker = 'JSON.stringify('
  let out = ''
  let pos = 0
  let changedCount = 0
  while (pos < raw.length) {
    const idx = raw.indexOf(marker, pos)
    if (idx === -1) {
      out += raw.slice(pos)
      break
    }
    out += raw.slice(pos, idx)
    const parsed = parseJsonStringifyArg(raw, idx + marker.length)
    if (!parsed) {
      // Malformed — just output as-is
      out += raw.slice(idx)
      break
    }
    const arg = parsed.arg
    const trimmed = arg.trim()
    // Skip if already has fallback
    const hasFallback = /\?\?|(^|\s)\|\|/.test(arg)
    // Skip if doesn't reference $json or $() or .item.json
    const referencesState = /\$json\.|\$\(|\.item\.json\./.test(arg)
    // Skip pure object literals {...} or array literals [...]
    const isLiteral = (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
                      (trimmed.startsWith('[') && trimmed.endsWith(']'))
    if (!hasFallback && referencesState && !isLiteral) {
      out += `JSON.stringify((${arg}) ?? null)`
      changedCount++
    } else {
      out += `JSON.stringify(${arg})`
    }
    pos = parsed.end + 1
  }
  return { out, changedCount }
}

function rewriteNodeParameters(node) {
  let totalChanges = 0
  const params = node.parameters || {}
  // Targets: jsonBody, responseBody. Both are strings.
  for (const key of ['jsonBody', 'responseBody']) {
    if (typeof params[key] !== 'string') continue
    const { out, changedCount } = rewriteJsonStringifyInString(params[key])
    if (changedCount > 0) {
      params[key] = out
      totalChanges += changedCount
    }
  }
  // Also deep-scan parameters as serialized JSON (covers headerParameters.parameters[].value, etc)
  // Skip — complex, and jsonBody/responseBody are the 95% case.
  return totalChanges
}

const { workflows } = await listN8nWorkflows()
const targets = workflows.filter(w => {
  if (!w.active) return false
  if (NAME_FILTER && !w.name.toLowerCase().includes(NAME_FILTER.toLowerCase())) return false
  return true
})

console.log(`\nScanning ${targets.length} active workflow(s)${NAME_FILTER ? ` matching "${NAME_FILTER}"` : ''}${DRY ? ' (dry-run)' : ''}\n`)

let totalWorkflowsChanged = 0
let totalRewrites = 0

for (const w of targets) {
  const detail = await fetchWorkflowDetail(w.id)
  if (!detail.ok || !detail.json?.nodes) continue
  const wf = detail.json
  let workflowChanges = 0
  for (const node of wf.nodes) {
    workflowChanges += rewriteNodeParameters(node)
  }
  if (!workflowChanges) continue

  console.log(`=== ${w.name} (${w.id}): +${workflowChanges} fallback(s)`)
  if (DRY) { totalWorkflowsChanged++; totalRewrites += workflowChanges; continue }

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
    totalRewrites += workflowChanges
    await fetchJson(ep.n8n + '/api/v1/workflows/' + w.id + '/deactivate', { method: 'POST', headers: H, body: '{}' })
    await new Promise(r => setTimeout(r, 600))
    await fetchJson(ep.n8n + '/api/v1/workflows/' + w.id + '/activate', { method: 'POST', headers: H, body: '{}' })
    console.log(`   ✓ reactivated`)
  } else {
    console.log(`   ✗ PUT ${put.status}: ${put.text?.slice(0, 300)}`)
  }
}

console.log(`\n=== SUMMARY ===`)
console.log(`Workflows scanned:  ${targets.length}`)
console.log(`Workflows changed:  ${totalWorkflowsChanged}`)
console.log(`Total rewrites:     ${totalRewrites}`)
