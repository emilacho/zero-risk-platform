#!/usr/bin/env node
// Auto-patcher for bad $node[...] refs in Code/HTTP node params.
// Scans every workflow, computes fuzzy rename from the referenced slug to
// an actual node name, and applies the substitution in jsCode/jsonBody/url
// if the match is confident enough. Otherwise reports unhandled.
//
// Usage:
//   node scripts/smoke-test/patch-bad-node-refs.mjs [--dry-run] [--min-confidence=0.5]

import { endpoints } from './lib/env.mjs'
import { fetchJson } from './lib/fetch.mjs'
import { listN8nWorkflows, fetchWorkflowDetail } from './lib/workflows.mjs'

const ep = endpoints()
const H = { 'X-N8N-API-KEY': ep.N8N_API_KEY, 'Content-Type': 'application/json', 'Accept': 'application/json' }
const DRY = process.argv.includes('--dry-run')
const MIN_CONFIDENCE = parseFloat(
  (process.argv.find(a => a.startsWith('--min-confidence=')) || '--min-confidence=0.45').split('=')[1]
)

function confidence(ref, candidate) {
  // Normalize both: lowercase, strip non-alnum
  const norm = s => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
  const a = norm(ref), b = norm(candidate)
  if (!a || !b) return 0
  // Token overlap
  const at = new Set(a.split(' '))
  const bt = new Set(b.split(' '))
  let common = 0
  for (const t of at) if (bt.has(t)) common++
  // Substring match boost
  const sub = a.includes(b) || b.includes(a) ? 0.3 : 0
  // Hyphenated → spaced match: e.g. "client-brain" should match "Client Brain"
  // Check each token in ref against candidate tokens
  let tokenHit = 0
  for (const t of at) {
    for (const bt2 of bt) {
      if (bt2.includes(t) || t.includes(bt2)) { tokenHit++; break }
    }
  }
  return (common / Math.max(at.size, bt.size)) * 0.5 + sub + (tokenHit / at.size) * 0.3
}

function pickBestMatch(ref, candidates) {
  let best = null, bestScore = 0
  for (const c of candidates) {
    const s = confidence(ref, c)
    if (s > bestScore) { bestScore = s; best = c }
  }
  return { best, score: bestScore }
}

const { workflows } = await listN8nWorkflows()
console.log(`Scanning ${workflows.length} workflows (min-confidence=${MIN_CONFIDENCE})...\n`)

let totalPatched = 0, totalWfPatched = 0, totalUnhandled = 0, totalFailed = 0
for (const w of workflows) {
  const detail = await fetchWorkflowDetail(w.id)
  if (!detail.ok || !detail.json?.nodes) { totalFailed++; continue }
  const wf = detail.json
  const nameList = wf.nodes.map(n => n.name)
  const nameSet = new Set(nameList)

  // Find bad refs and compute renames
  const rawRefs = new Set()
  for (const n of wf.nodes) {
    const sources = ['jsCode', 'jsonBody', 'url']
    for (const key of sources) {
      const text = n.parameters?.[key]
      if (!text || typeof text !== 'string') continue
      const re = /\$node\[['"]([^'"]+)['"]\]/g
      let m
      while ((m = re.exec(text)) !== null) {
        if (!nameSet.has(m[1])) rawRefs.add(m[1])
      }
    }
  }
  if (!rawRefs.size) continue

  // Compute rename map with confidence gating
  const renames = {}
  const unhandled = []
  for (const ref of rawRefs) {
    const { best, score } = pickBestMatch(ref, nameList)
    if (best && score >= MIN_CONFIDENCE) {
      renames[ref] = best
    } else {
      unhandled.push({ ref, best, score: score.toFixed(2) })
    }
  }

  console.log(`\n=== ${w.name}`)
  for (const [from, to] of Object.entries(renames)) console.log(`   rewrite: "${from}" → "${to}"`)
  for (const u of unhandled) console.log(`   UNHANDLED: "${u.ref}"  (best guess: "${u.best}" score=${u.score})`)

  if (!Object.keys(renames).length) { totalUnhandled += unhandled.length; continue }

  if (DRY) {
    totalPatched += Object.keys(renames).length
    totalWfPatched++
    totalUnhandled += unhandled.length
    continue
  }

  // Apply substitution in all string params
  for (const n of wf.nodes) {
    const keys = ['jsCode', 'jsonBody', 'url']
    for (const k of keys) {
      let text = n.parameters?.[k]
      if (!text || typeof text !== 'string') continue
      let changed = false
      for (const [from, to] of Object.entries(renames)) {
        // Use regex to match $node['from'] or $node["from"]
        const re = new RegExp(`\\$node\\[(['"])${from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\1\\]`, 'g')
        const before = text
        text = text.replace(re, `$node[$1${to}$1]`)
        if (text !== before) changed = true
      }
      if (changed) n.parameters[k] = text
    }
  }

  const put = await fetchJson(ep.n8n + '/api/v1/workflows/' + w.id, {
    method: 'PUT', headers: H,
    body: JSON.stringify({ name: wf.name, nodes: wf.nodes, connections: wf.connections, settings: wf.settings || { executionOrder: 'v1' } }),
  })
  if (put.ok) {
    totalPatched += Object.keys(renames).length
    totalWfPatched++
    console.log(`   ✓ PUT 200`)
    // Reactivate if was active
    if (w.active) {
      await fetchJson(ep.n8n + '/api/v1/workflows/' + w.id + '/deactivate', { method:'POST', headers:H, body:'{}' })
      await new Promise(r => setTimeout(r, 800))
      await fetchJson(ep.n8n + '/api/v1/workflows/' + w.id + '/activate', { method:'POST', headers:H, body:'{}' })
    }
  } else {
    console.log(`   ✗ PUT ${put.status}: ${put.text || put.error}`)
    totalFailed++
  }
  totalUnhandled += unhandled.length
  await new Promise(r => setTimeout(r, 500))
}

console.log(`\n── Summary ──`)
console.log(`  Workflows patched: ${totalWfPatched}`)
console.log(`  Rewrites applied : ${totalPatched}`)
console.log(`  Unhandled refs   : ${totalUnhandled} (need manual mapping)`)
console.log(`  Failed PUTs      : ${totalFailed}`)
