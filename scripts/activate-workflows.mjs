#!/usr/bin/env node
/**
 * Zero Risk — Bulk Workflow Activator for n8n Railway self-host
 *
 * Lists all workflows via /api/v1/workflows, filters by cluster tag in name,
 * and activates each via /api/v1/workflows/{id}/activate.
 *
 * Usage:
 *   cd zero-risk-platform
 *   node scripts/activate-workflows.mjs                                 # dry-run, all clusters
 *   node scripts/activate-workflows.mjs --cluster=01-orchestration      # filter by cluster
 *   node scripts/activate-workflows.mjs --cluster=01-orchestration --apply  # actually activate
 *   node scripts/activate-workflows.mjs --deactivate --apply            # flip to inactive
 *
 * Reads N8N_API_KEY and N8N_BASE_URL from .env.local.
 */

import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

const args = process.argv.slice(2)
const APPLY = args.includes('--apply')
const DEACTIVATE = args.includes('--deactivate')
const CLUSTER = args.find(a => a.startsWith('--cluster='))?.slice(10) || null
const NAME_FILTER = args.find(a => a.startsWith('--name='))?.slice(7) || null

// Cluster → name prefixes / keywords mapping
const CLUSTER_MATCHERS = {
  '01-orchestration': ['NEXUS', 'RUFLO', 'Meta-Agent', 'HITL', 'Phase Gate', 'Agent Outcomes'],
  '02-creative': ['Creative Fatigue', 'Video Pipeline', 'RSA', 'Landing Page A/B', 'Content Repurposing', 'Creative Performance'],
  '03-seo-geo': ['Cannibalization', 'GEO', 'Rank-to-One', 'Backlink', 'Topical Authority', 'IndexNow'],
  '04-paid-media': ['Meta Ads', 'Google Ads', 'TikTok', 'Attribution Validator', 'Incrementality', 'CRO', 'Message Match'],
  '05-email-community': ['RFM', 'Email Lifecycle', 'Subject Line', 'Community Health', 'Review Severity', 'Social', 'Influencer'],
  '06-client-success': ['Account Health', 'Churn', 'QBR', 'Onboarding E2E', 'Expansion Readiness', 'Weekly Client Report', 'NPS'],
  '07-ops-monitoring': ['Sentry', 'UptimeRobot', 'Healthchecks', 'Supabase Weekly', 'Cost Watchdog', 'Agent Health'],
}

let N8N_API_KEY = '', N8N_BASE_URL = ''
try {
  const envPath = resolve(__dirname, '..', '.env.local')
  const envContent = readFileSync(envPath, 'utf-8')
  for (const line of envContent.split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const eq = t.indexOf('=')
    if (eq < 0) continue
    const k = t.slice(0, eq).trim()
    const v = t.slice(eq + 1).trim().replace(/^["']|["']$/g, '')
    if (k === 'N8N_API_KEY') N8N_API_KEY = v
    if (k === 'N8N_BASE_URL') N8N_BASE_URL = v
  }
} catch {}
if (!N8N_API_KEY) { console.error('❌ N8N_API_KEY not in .env.local'); process.exit(1) }
if (!N8N_BASE_URL) N8N_BASE_URL = 'https://n8n-production-72be.up.railway.app'

const action = DEACTIVATE ? 'deactivate' : 'activate'
console.log(`🎯 ${APPLY ? 'APPLY' : 'DRY-RUN'} — ${action} ${CLUSTER ? `cluster ${CLUSTER}` : 'all clusters'}${NAME_FILTER ? ` matching "${NAME_FILTER}"` : ''}`)
console.log('')

function matchesCluster(wfName) {
  if (!CLUSTER) return true
  const matchers = CLUSTER_MATCHERS[CLUSTER] || []
  return matchers.some(m => wfName.toLowerCase().includes(m.toLowerCase()))
}

async function listWorkflows() {
  const all = []
  let cursor = null
  do {
    const url = new URL(`${N8N_BASE_URL}/api/v1/workflows`)
    url.searchParams.set('limit', '100')
    if (cursor) url.searchParams.set('cursor', cursor)
    const res = await fetch(url, {
      headers: { 'X-N8N-API-KEY': N8N_API_KEY, Accept: 'application/json' },
      signal: AbortSignal.timeout(20000),
    })
    if (!res.ok) throw new Error(`list failed: ${res.status} ${await res.text()}`)
    const json = await res.json()
    all.push(...(json.data || []))
    cursor = json.nextCursor || null
  } while (cursor)
  return all
}

async function flipWorkflow(id, targetActive) {
  const endpoint = targetActive ? 'activate' : 'deactivate'
  const res = await fetch(`${N8N_BASE_URL}/api/v1/workflows/${id}/${endpoint}`, {
    method: 'POST',
    headers: { 'X-N8N-API-KEY': N8N_API_KEY, Accept: 'application/json' },
    signal: AbortSignal.timeout(15000),
  })
  const text = await res.text()
  return { ok: res.ok, status: res.status, body: text.slice(0, 300) }
}

async function main() {
  const workflows = await listWorkflows()
  console.log(`📋 Found ${workflows.length} workflows in n8n`)

  const targets = workflows
    .filter(w => matchesCluster(w.name))
    .filter(w => !NAME_FILTER || w.name.toLowerCase().includes(NAME_FILTER.toLowerCase()))
    .filter(w => DEACTIVATE ? w.active : !w.active)
    .sort((a, b) => a.name.localeCompare(b.name))

  console.log(`🎯 ${targets.length} match filter and need ${action}`)
  console.log('')

  if (targets.length === 0) {
    console.log('Nothing to do.')
    return
  }

  const results = []
  for (const wf of targets) {
    if (!APPLY) {
      console.log(`  📋 ${wf.name}  (id=${wf.id}, active=${wf.active})`)
      results.push({ ok: true, dryRun: true, name: wf.name })
      continue
    }
    const r = await flipWorkflow(wf.id, !DEACTIVATE)
    const badge = r.ok ? '✅' : '❌'
    const info = r.ok ? '' : ` — ${r.body.slice(0, 120)}`
    console.log(`  ${badge} ${wf.name}${info}`)
    results.push({ ...r, name: wf.name })
  }

  console.log('')
  const ok = results.filter(r => r.ok).length
  const failed = results.filter(r => !r.ok).length
  console.log(`Total: ${results.length}  ✅ ${ok} ${APPLY ? action + 'd' : 'would ' + action}  ❌ ${failed} failed`)

  if (failed > 0) {
    console.log('\nFailed:')
    for (const r of results.filter(r => !r.ok)) {
      console.log(`  - ${r.name}: HTTP ${r.status} ${r.body}`)
    }
    process.exit(1)
  }
}

main().catch(err => { console.error('Fatal:', err); process.exit(1) })
