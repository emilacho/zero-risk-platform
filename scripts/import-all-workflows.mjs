#!/usr/bin/env node
/**
 * Zero Risk — Bulk Workflow Importer for n8n Railway self-host
 *
 * Reads all workflow JSONs from n8n-workflows/proposed-sesion27b/,
 * applies the 5 patches we learned manually in session 28, and POSTs
 * each workflow to the n8n REST API (/api/v1/workflows).
 *
 * Patches applied automatically:
 *   1. Webhook node: httpMethod default → 'POST' if missing
 *   2. Webhook node: responseMode 'immediately' → 'onReceived' (n8n 1.x)
 *   3. PostHog HTTP nodes: disabled = true (until FASE B signup)
 *   4. Slack alert HTTP nodes: disabled = true (until webhook configured)
 *   5. Strip non-importable fields (id, versionId, tags top-level, webhookId)
 *
 * Usage:
 *   cd zero-risk-platform
 *   node scripts/import-all-workflows.mjs             # dry-run, shows what would import
 *   node scripts/import-all-workflows.mjs --apply     # actually POST to n8n
 *   node scripts/import-all-workflows.mjs --apply --cluster=01-orchestration  # filter
 *   node scripts/import-all-workflows.mjs --apply --activate  # also activate each
 *
 * Reads N8N_API_KEY and N8N_BASE_URL from .env.local.
 */

import { readFileSync, readdirSync, statSync } from 'fs'
import { resolve, dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

// ── Args ─────────────────────────────────────────────────────
const args = process.argv.slice(2)
const APPLY = args.includes('--apply')
const ACTIVATE = args.includes('--activate')
const CLUSTER = args.find(a => a.startsWith('--cluster='))?.slice(10) || null
const VERBOSE = args.includes('-v') || args.includes('--verbose')

// ── Load env ──────────────────────────────────────────────────
let N8N_API_KEY = ''
let N8N_BASE_URL = ''
try {
  const envPath = resolve(__dirname, '..', '.env.local')
  const envContent = readFileSync(envPath, 'utf-8')
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq < 0) continue
    const k = trimmed.slice(0, eq).trim()
    const v = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '')
    if (k === 'N8N_API_KEY') N8N_API_KEY = v
    if (k === 'N8N_BASE_URL') N8N_BASE_URL = v
  }
} catch (e) {
  console.error('⚠️  .env.local not found:', e.message)
}

if (!N8N_API_KEY) {
  console.error('❌ N8N_API_KEY not found in .env.local.')
  console.error('   Generate one at: https://n8n-production-72be.up.railway.app/settings/api')
  process.exit(1)
}
if (!N8N_BASE_URL) N8N_BASE_URL = 'https://n8n-production-72be.up.railway.app'

console.log(`🚀 n8n API: ${N8N_BASE_URL}`)
console.log(`   API key: ${N8N_API_KEY.slice(0, 20)}...${N8N_API_KEY.slice(-8)}`)
console.log(`   Mode: ${APPLY ? 'APPLY (will POST to n8n)' : 'DRY-RUN (no POSTs)'}`)
if (ACTIVATE) console.log('   Will also activate each workflow after import')
if (CLUSTER) console.log(`   Filter: only cluster ${CLUSTER}`)
console.log('')

// ── Collect workflow files ────────────────────────────────────
const ROOT = resolve(__dirname, '..', 'n8n-workflows', 'proposed-sesion27b')
const SKIP_FILES = new Set([
  '06-agent-outcomes-stream-writer.json',         // superseded by LIVE variant
  '06-agent-outcomes-stream-writer-LIVE.json',    // already imported manually as HARDCODED v2
])

function walk(dir) {
  const out = []
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    const stat = statSync(full)
    if (stat.isDirectory()) out.push(...walk(full))
    else if (name.endsWith('.json') && !name.endsWith('.meta.json')) out.push(full)
  }
  return out
}

const allFiles = walk(ROOT)
  .filter(f => !SKIP_FILES.has(f.split(/[/\\]/).pop()))
  .filter(f => !CLUSTER || f.includes(`/${CLUSTER}/`) || f.includes(`\\${CLUSTER}\\`))
  .sort()

console.log(`📂 Found ${allFiles.length} workflow files to process`)
console.log('')

// ── Patch function ────────────────────────────────────────────
function patchWorkflow(wf) {
  const patches = []

  for (const node of wf.nodes || []) {
    // Patch 1 + 2: Webhook nodes
    if (node.type === 'n8n-nodes-base.webhook') {
      if (!node.parameters) node.parameters = {}
      if (!node.parameters.httpMethod) {
        node.parameters.httpMethod = 'POST'
        patches.push(`added POST to webhook '${node.name}'`)
      }
      if (node.parameters.responseMode === 'immediately') {
        node.parameters.responseMode = 'onReceived'
        patches.push(`fixed responseMode on '${node.name}'`)
      }
    }

    // Patch 3: Disable PostHog nodes (env var POSTHOG_API_KEY not configured)
    if (node.type === 'n8n-nodes-base.httpRequest' && node.parameters?.url?.includes?.('posthog.com')) {
      node.disabled = true
      patches.push(`disabled PostHog node '${node.name}'`)
    }

    // Patch 4: Disable Slack webhook nodes (SLACK_WEBHOOK_URL not configured)
    if (node.type === 'n8n-nodes-base.httpRequest' &&
        (node.parameters?.url?.includes?.('$env.SLACK_WEBHOOK_URL') ||
         node.parameters?.url?.includes?.('hooks.slack.com'))) {
      node.disabled = true
      patches.push(`disabled Slack node '${node.name}'`)
    }
  }

  // Patch 5: Strip fields that n8n API rejects
  const apiPayload = {
    name: wf.name,
    nodes: wf.nodes,
    connections: wf.connections,
    settings: wf.settings || { executionOrder: 'v1' },
  }

  // Remove webhookId from webhook nodes (n8n will assign new ones)
  for (const node of apiPayload.nodes) {
    if (node.webhookId) delete node.webhookId
  }

  return { payload: apiPayload, patches, skipReason: null }
}

// ── Import + activate ─────────────────────────────────────────
async function importWorkflow(filePath) {
  const fileName = filePath.split(/[/\\]/).pop()
  const cluster = filePath.match(/proposed-sesion27b[/\\]([^/\\]+)/)?.[1] || 'unknown'

  let raw
  try {
    raw = readFileSync(filePath, 'utf-8')
  } catch (e) {
    return { fileName, cluster, ok: false, error: 'read_fail: ' + e.message }
  }

  let wf
  try {
    wf = JSON.parse(raw)
  } catch (e) {
    return { fileName, cluster, ok: false, error: 'parse_fail: ' + e.message }
  }

  const { payload, patches, skipReason } = patchWorkflow(wf)
  if (skipReason) {
    return { fileName, cluster, ok: true, skipped: skipReason, patches }
  }

  if (!APPLY) {
    return { fileName, cluster, ok: true, patches, dryRun: true, name: payload.name }
  }

  // POST to n8n
  try {
    const res = await fetch(`${N8N_BASE_URL}/api/v1/workflows`, {
      method: 'POST',
      headers: {
        'X-N8N-API-KEY': N8N_API_KEY,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(20000),
    })
    const text = await res.text()
    if (!res.ok) {
      return { fileName, cluster, ok: false, error: `HTTP ${res.status}: ${text.slice(0, 300)}`, patches }
    }
    const parsed = JSON.parse(text)
    const newId = parsed.id || parsed.data?.id

    // Activate if requested
    let activated = null
    if (ACTIVATE && newId) {
      try {
        const aRes = await fetch(`${N8N_BASE_URL}/api/v1/workflows/${newId}/activate`, {
          method: 'POST',
          headers: { 'X-N8N-API-KEY': N8N_API_KEY, Accept: 'application/json' },
          signal: AbortSignal.timeout(15000),
        })
        activated = aRes.ok
      } catch (e) {
        activated = false
      }
    }

    return { fileName, cluster, ok: true, id: newId, name: payload.name, patches, activated }
  } catch (e) {
    return { fileName, cluster, ok: false, error: 'fetch_fail: ' + e.message, patches }
  }
}

// ── Main ──────────────────────────────────────────────────────
async function main() {
  const results = []
  for (const file of allFiles) {
    const r = await importWorkflow(file)
    results.push(r)
    const badge = r.ok ? (r.dryRun ? '📋' : r.skipped ? '⊘' : '✅') : '❌'
    const info = r.id ? ` (id=${r.id})` : r.error ? ` — ${r.error.slice(0, 80)}` : ''
    const activeInfo = r.activated === true ? ' + active' : r.activated === false ? ' (activate failed)' : ''
    console.log(`  ${badge} [${r.cluster}] ${r.fileName}${info}${activeInfo}`)
    if (VERBOSE && r.patches?.length) {
      for (const p of r.patches) console.log(`       · ${p}`)
    }
  }

  console.log('')
  console.log('━'.repeat(80))
  const ok = results.filter(r => r.ok && !r.skipped).length
  const skipped = results.filter(r => r.skipped).length
  const failed = results.filter(r => !r.ok).length
  const activated = results.filter(r => r.activated === true).length

  console.log(`Total: ${results.length}  ✅ ${ok} ok  ⊘ ${skipped} skipped  ❌ ${failed} failed${ACTIVATE ? `  ⚡ ${activated} activated` : ''}`)

  if (!APPLY) {
    console.log('')
    console.log('⚠️  DRY-RUN mode — no workflows were imported.')
    console.log('   Run with --apply to actually import to n8n.')
  }

  if (failed > 0) {
    console.log('\n❌ Failed imports:')
    for (const r of results.filter(r => !r.ok)) {
      console.log(`   - ${r.fileName}: ${r.error}`)
    }
    process.exit(1)
  }
}

main().catch(err => {
  console.error('Fatal:', err)
  process.exit(1)
})
