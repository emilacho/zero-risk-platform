#!/usr/bin/env node
/**
 * BATCH PATCHER — fix Jinja pipe syntax in n8n expressions.
 *
 * Bug pattern: some workflows (research-generated) use Jinja/Nunjucks-style
 * filters like `{{ value | slice(0, 2000) }}` or `{{ value | trim }}`.
 * n8n uses JavaScript expressions, NOT Jinja — the `|` pipe fails as bitwise OR.
 *
 * Fix: rewrite common pipe patterns to JS equivalents:
 *   - `X | slice(a, b)` → `(X || '').slice(a, b)`
 *   - `X | trim` → `(X || '').trim()`
 *   - `X | lower` → `(X || '').toLowerCase()`
 *   - `X | upper` → `(X || '').toUpperCase()`
 *   - `X | json` → `JSON.stringify(X)`
 *
 * Uso: node patch-jinja-pipe-syntax.mjs [--dry-run] [--name <filter>]
 */
import { endpoints } from './lib/env.mjs'
import { fetchJson } from './lib/fetch.mjs'
import { listN8nWorkflows, fetchWorkflowDetail } from './lib/workflows.mjs'

const ep = endpoints()
const H = { 'X-N8N-API-KEY': ep.N8N_API_KEY, 'Content-Type': 'application/json', 'Accept': 'application/json' }
const DRY = process.argv.includes('--dry-run')
const nameFilterIdx = process.argv.indexOf('--name')
const NAME_FILTER = nameFilterIdx >= 0 ? process.argv[nameFilterIdx + 1] : null

// Detect: inside {{ ... }}, anything like "X | slice(N, M)" or similar
// Match the pipe + filter inside template expressions
function rewriteJinjaPipes(str) {
  if (typeof str !== 'string') return { out: str, changed: 0 }
  let out = str
  let changed = 0

  // Inside {{ ... }} blocks only
  out = out.replace(/\{\{([^}]+?)\}\}/g, (match, inner) => {
    let newInner = inner
    let localChanges = 0

    // slice: X | slice(a, b)
    newInner = newInner.replace(/([\$\w\.\[\]'"]+?)\s*\|\s*slice\s*\(\s*(\d+)\s*,\s*(\d+)\s*\)/g, (_, v, a, b) => {
      localChanges++
      return `(${v.trim()} || '').slice(${a}, ${b})`
    })
    // trim
    newInner = newInner.replace(/([\$\w\.\[\]'"]+?)\s*\|\s*trim\b/g, (_, v) => {
      localChanges++
      return `(${v.trim()} || '').trim()`
    })
    // lower
    newInner = newInner.replace(/([\$\w\.\[\]'"]+?)\s*\|\s*lower\b/g, (_, v) => {
      localChanges++
      return `(${v.trim()} || '').toLowerCase()`
    })
    // upper
    newInner = newInner.replace(/([\$\w\.\[\]'"]+?)\s*\|\s*upper\b/g, (_, v) => {
      localChanges++
      return `(${v.trim()} || '').toUpperCase()`
    })
    // json
    newInner = newInner.replace(/([\$\w\.\[\]'"]+?)\s*\|\s*json\b/g, (_, v) => {
      localChanges++
      return `JSON.stringify(${v.trim()})`
    })
    // default(v): X | default('foo')
    newInner = newInner.replace(/([\$\w\.\[\]'"]+?)\s*\|\s*default\s*\(\s*(['"][^'"]*['"])\s*\)/g, (_, v, def) => {
      localChanges++
      return `(${v.trim()} || ${def})`
    })

    if (localChanges > 0) {
      changed += localChanges
      return `{{${newInner}}}`
    }
    return match
  })

  return { out, changed }
}

function rewriteNodeParams(node) {
  let totalChanges = 0
  const params = node.parameters || {}
  for (const key of ['jsonBody', 'responseBody', 'url']) {
    if (typeof params[key] !== 'string') continue
    const { out, changed } = rewriteJinjaPipes(params[key])
    if (changed > 0) {
      params[key] = out
      totalChanges += changed
    }
  }
  // Also scan headerParameters.parameters[].value
  const headers = params.headerParameters?.parameters || []
  for (const h of headers) {
    if (typeof h.value !== 'string') continue
    const { out, changed } = rewriteJinjaPipes(h.value)
    if (changed > 0) {
      h.value = out
      totalChanges += changed
    }
  }
  return totalChanges
}

const { workflows } = await listN8nWorkflows()
const targets = workflows.filter(w => {
  if (!w.active) return false
  if (NAME_FILTER && !w.name.toLowerCase().includes(NAME_FILTER.toLowerCase())) return false
  return true
})

console.log(`\nScanning ${targets.length} workflow(s)${DRY ? ' (dry-run)' : ''}\n`)

let totalFixed = 0
let totalRewrites = 0

for (const w of targets) {
  const detail = await fetchWorkflowDetail(w.id)
  if (!detail.ok || !detail.json?.nodes) continue
  const wf = detail.json
  let changes = 0
  for (const node of wf.nodes) {
    changes += rewriteNodeParams(node)
  }
  if (!changes) continue

  console.log(`=== ${w.name}: ${changes} pipe(s) rewritten`)
  if (DRY) { totalFixed++; totalRewrites += changes; continue }

  const put = await fetchJson(ep.n8n + '/api/v1/workflows/' + w.id, {
    method: 'PUT', headers: H,
    body: JSON.stringify({
      name: wf.name, nodes: wf.nodes, connections: wf.connections,
      settings: wf.settings || { executionOrder: 'v1' },
    }),
  })
  if (put.ok) {
    console.log(`   ✓ PUT 200`)
    await fetchJson(ep.n8n + '/api/v1/workflows/' + w.id + '/deactivate', { method:'POST', headers:H, body:'{}' })
    await new Promise(r => setTimeout(r, 500))
    await fetchJson(ep.n8n + '/api/v1/workflows/' + w.id + '/activate', { method:'POST', headers:H, body:'{}' })
    totalFixed++
    totalRewrites += changes
  } else {
    console.log(`   ✗ PUT ${put.status}: ${put.text?.slice(0, 300)}`)
  }
}

console.log(`\n=== SUMMARY ===`)
console.log(`Workflows fixed: ${totalFixed}`)
console.log(`Pipe expressions rewritten: ${totalRewrites}`)
