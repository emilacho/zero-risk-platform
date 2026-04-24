#!/usr/bin/env node
/**
 * Zero Risk — Sync all local workflow JSONs → n8n Railway via API.
 *
 * For each JSON in n8n-workflows/proposed-sesion27b/:
 *   1. Apply same patches as import-all-workflows.mjs
 *   2. Look up existing workflow in n8n by name
 *   3. If found → PUT update; if not → POST create
 *
 * Usage:
 *   node scripts/sync-workflows.mjs                          # dry-run
 *   node scripts/sync-workflows.mjs --apply                  # apply
 *   node scripts/sync-workflows.mjs --apply --cluster=01-orchestration
 */

import { readFileSync, readdirSync, statSync } from 'fs'
import { resolve, dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const args = process.argv.slice(2)
const APPLY = args.includes('--apply')
const CLUSTER = args.find(a => a.startsWith('--cluster='))?.slice(10) || null

let N8N_API_KEY = '', N8N_BASE_URL = 'https://n8n-production-72be.up.railway.app'
try {
  const env = readFileSync(resolve(__dirname, '..', '.env.local'), 'utf-8')
  for (const l of env.split('\n')) {
    const t = l.trim()
    if (!t || t.startsWith('#')) continue
    const eq = t.indexOf('='); if (eq < 0) continue
    const k = t.slice(0, eq).trim(), v = t.slice(eq + 1).trim().replace(/^["']|["']$/g, '')
    if (k === 'N8N_API_KEY') N8N_API_KEY = v
    if (k === 'N8N_BASE_URL') N8N_BASE_URL = v
  }
} catch {}
if (!N8N_API_KEY) { console.error('❌ N8N_API_KEY not in .env.local'); process.exit(1) }

const ROOT = resolve(__dirname, '..', 'n8n-workflows', 'proposed-sesion27b')
const SKIP = new Set([
  '06-agent-outcomes-stream-writer.json',
  '06-agent-outcomes-stream-writer-LIVE.json',
])

function walk(dir) {
  const out = []
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    const s = statSync(full)
    if (s.isDirectory()) out.push(...walk(full))
    else if (name.endsWith('.json') && !name.endsWith('.meta.json')) out.push(full)
  }
  return out
}

function patchWorkflow(wf) {
  for (const node of wf.nodes || []) {
    if (node.type === 'n8n-nodes-base.webhook') {
      if (!node.parameters) node.parameters = {}
      if (!node.parameters.httpMethod) node.parameters.httpMethod = 'POST'
      if (node.parameters.responseMode === 'immediately') node.parameters.responseMode = 'onReceived'
    }
    if (node.type === 'n8n-nodes-base.httpRequest' && node.parameters?.url?.includes?.('posthog.com')) node.disabled = true
    if (node.type === 'n8n-nodes-base.httpRequest' &&
        (node.parameters?.url?.includes?.('$env.SLACK_WEBHOOK_URL') || node.parameters?.url?.includes?.('hooks.slack.com')))
      node.disabled = true
    if (node.webhookId) delete node.webhookId
  }
  return {
    name: wf.name,
    nodes: wf.nodes,
    connections: wf.connections,
    settings: wf.settings || { executionOrder: 'v1' },
  }
}

async function listExisting() {
  const all = []; let cursor = null
  do {
    const url = new URL(`${N8N_BASE_URL}/api/v1/workflows`)
    url.searchParams.set('limit', '100')
    if (cursor) url.searchParams.set('cursor', cursor)
    const r = await fetch(url, { headers: { 'X-N8N-API-KEY': N8N_API_KEY, Accept: 'application/json' } })
    if (!r.ok) throw new Error('list failed: ' + r.status)
    const j = await r.json()
    all.push(...(j.data || []))
    cursor = j.nextCursor
  } while (cursor)
  return all
}

async function main() {
  const existing = await listExisting()
  const byName = new Map(existing.map(w => [w.name, w]))
  console.log(`📋 Found ${existing.length} workflows already in n8n`)

  const files = walk(ROOT)
    .filter(f => !SKIP.has(f.split(/[/\\]/).pop()))
    .filter(f => !CLUSTER || f.includes(`${CLUSTER}`))
    .sort()

  console.log(`📂 Processing ${files.length} local JSONs${CLUSTER ? ` in cluster ${CLUSTER}` : ''}`)
  console.log('')

  const results = { updated: 0, created: 0, failed: 0 }
  for (const f of files) {
    const wf = JSON.parse(readFileSync(f, 'utf-8'))
    const payload = patchWorkflow(wf)
    const existingWf = byName.get(payload.name)
    const action = existingWf ? 'UPDATE' : 'CREATE'
    const relPath = f.replace(ROOT + '/', '').replace(ROOT + '\\', '')

    if (!APPLY) {
      console.log(`  📋 ${action}: ${payload.name}  (${relPath})`)
      continue
    }

    try {
      const url = existingWf
        ? `${N8N_BASE_URL}/api/v1/workflows/${existingWf.id}`
        : `${N8N_BASE_URL}/api/v1/workflows`
      const method = existingWf ? 'PUT' : 'POST'
      const r = await fetch(url, {
        method,
        headers: { 'X-N8N-API-KEY': N8N_API_KEY, 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(20000),
      })
      if (!r.ok) {
        const txt = await r.text()
        console.log(`  ❌ ${action} ${payload.name}: HTTP ${r.status} ${txt.slice(0, 150)}`)
        results.failed++
      } else {
        console.log(`  ✅ ${action} ${payload.name}`)
        existingWf ? results.updated++ : results.created++
      }
    } catch (e) {
      console.log(`  ❌ ${action} ${payload.name}: ${e.message}`)
      results.failed++
    }
  }

  console.log('')
  console.log('━'.repeat(80))
  console.log(`✅ ${results.updated} updated  ➕ ${results.created} created  ❌ ${results.failed} failed`)
  if (!APPLY) console.log('\n⚠️  DRY-RUN — run with --apply to sync.')
  if (results.failed > 0) process.exit(1)
}

main().catch(e => { console.error('Fatal:', e); process.exit(1) })
