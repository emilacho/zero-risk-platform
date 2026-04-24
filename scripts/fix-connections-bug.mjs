#!/usr/bin/env node
/**
 * Zero Risk — Fix "connections use node IDs instead of names" bug in workflow JSONs.
 *
 * Symptom: workflow webhook fires successfully (200), only the first node runs,
 * nothing reaches Supabase. Root cause: n8n requires `connections` keys to be
 * node NAMES, but research-generated JSONs used node IDs.
 *
 * Scans all workflow JSONs in n8n-workflows/proposed-sesion27b/, detects those
 * with connection keys matching node IDs (not names), and rewrites them.
 *
 * Usage:
 *   node scripts/fix-connections-bug.mjs              # dry-run, shows what would change
 *   node scripts/fix-connections-bug.mjs --apply      # write fixed JSONs to disk
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs'
import { resolve, dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const APPLY = process.argv.includes('--apply')
const ROOT = resolve(__dirname, '..', 'n8n-workflows', 'proposed-sesion27b')

function walk(dir) {
  const out = []
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    const s = statSync(full)
    if (s.isDirectory()) out.push(...walk(full))
    else if (name.endsWith('.json') && !name.endsWith('.meta.json') && !name.includes('LIVE')) out.push(full)
  }
  return out
}

const files = walk(ROOT).sort()
console.log(`📂 Scanning ${files.length} workflow files...\n`)

let fixedCount = 0
let skippedCount = 0
const changes = []

for (const file of files) {
  const relPath = file.replace(ROOT + '/', '').replace(ROOT + '\\', '')
  const wf = JSON.parse(readFileSync(file, 'utf-8'))
  const connections = wf.connections || {}
  const nodes = wf.nodes || []

  // Build id→name map
  const idToName = {}
  const names = new Set()
  for (const n of nodes) {
    if (n.id) idToName[n.id] = n.name
    names.add(n.name)
  }

  // Check if connections keys OR inner refs use IDs
  const connKeys = Object.keys(connections)
  const usesIds = connKeys.filter(k => idToName[k] && !names.has(k)).length

  // Also scan inner refs
  let innerUsesIds = 0
  for (const value of Object.values(connections)) {
    for (const branches of Object.values(value || {})) {
      for (const branch of branches || []) {
        for (const edge of branch || []) {
          if (edge && typeof edge === 'object' && edge.node && idToName[edge.node] && !names.has(edge.node)) {
            innerUsesIds++
          }
        }
      }
    }
  }

  if (usesIds === 0 && innerUsesIds === 0) {
    skippedCount++
    continue
  }

  // Rewrite: replace each id key with its corresponding name
  // Also walk inner values and replace any {node: "id", ...} with {node: "name", ...}
  let innerFixed = 0
  const newConnections = {}
  for (const [key, value] of Object.entries(connections)) {
    const resolvedKey = idToName[key] || key
    // Walk the value structure: { main: [[{node, type, index}, ...], ...] }
    const newValue = {}
    for (const [outputType, branches] of Object.entries(value)) {
      newValue[outputType] = (branches || []).map(branch =>
        (branch || []).map(edge => {
          if (edge && typeof edge === 'object' && edge.node && idToName[edge.node]) {
            innerFixed++
            return { ...edge, node: idToName[edge.node] }
          }
          return edge
        })
      )
    }
    newConnections[resolvedKey] = newValue
  }

  wf.connections = newConnections
  fixedCount++
  changes.push({ file: relPath, idsFixed: usesIds, innerFixed })
  console.log(`  🔧 ${relPath} — ${usesIds} top-keys + ${innerFixed} inner refs (id→name)`)

  if (APPLY) {
    writeFileSync(file, JSON.stringify(wf, null, 2), 'utf-8')
  }
}

console.log('')
console.log('━'.repeat(80))
console.log(`📊 Summary: ${fixedCount} need fix, ${skippedCount} already OK`)
if (!APPLY) {
  console.log('\n⚠️  DRY-RUN — no files written. Run with --apply to persist fixes.')
} else {
  console.log(`\n✅ Wrote ${fixedCount} JSONs to disk.`)
  console.log('\nNext step: re-import those 14 workflows to n8n (via update-workflow.mjs or delete+re-import).')
}
