#!/usr/bin/env node
/**
 * fetch-workflow-details.mjs
 * Wave 10 · Deep Triage · Cowork autónomo
 *
 * Reads N8N_API_KEY + N8N_BASE_URL from .env.local
 * For each workflow ID in WORKFLOW_IDS array, GET /api/v1/workflows/<id>
 * Writes:
 *   - audit-output/workflows/<id>.json   (full JSON per workflow)
 *   - audit-output/summary.csv           (id,name,active,node_count,trigger_type,
 *                                         has_supabase_calls,has_http_calls,has_webhook,
 *                                         last_updated,complexity_score)
 *
 * Read-only against n8n live. No PATCH/DELETE/POST.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(__dirname, '..', '..')
const ENV_PATH = resolve(REPO_ROOT, '.env.local')
const OUT_DIR = resolve(REPO_ROOT, 'audit-output')
const WORKFLOWS_DIR = resolve(OUT_DIR, 'workflows')
const SUMMARY_CSV = resolve(OUT_DIR, 'summary.csv')

// 22 active sin executions tracked + 21 inactive = 43 IDs
// Source: docs/05-orquestacion/WORKFLOW_TRIAGE_2026-04-28.md secciones 4 y 5
const WORKFLOW_IDS = [
  // Section 4 · active sin executions tracked (22)
  ['dy7tqAHgomdn8zNz', 'active', 'Video Pipeline: Seedance → FFmpeg → Multi-Platform Export'],
  ['VntP71aUsrCi0JPj', 'active', 'Sentry Alert Router'],
  ['ANzKornQDkZuZ3yP', 'active', 'SEO Rank-to-#1 v2 UPGRADED'],
  ['CQBo37jBsyApY8DN', 'active', 'RSA 15-Headline Variant Generator'],
  ['7A4PsaMJUbA1kgvt', 'active', 'Meta-Agent Weekly Learning Cycle (Monday 9am)'],
  ['DGLL7QKudIEVdr0n', 'active', 'Landing Page A/B Deployer'],
  ['VJ367iyVT3F22asQ', 'active', 'Agent Outcomes Writer (Cluster 1)'],
  ['RT1tcru9mysEwKkf', 'active', 'NEXUS 7-Phase Campaign Orchestrator'],
  ['V9pAg0P6AP8aJBx2', 'active', 'Ad Creative → Landing Message Match Validator'],
  ['rX26RJeifPRkH4ny', 'active', 'Content Repurposing 1→N'],
  ['5nOu3EMssRzZwrl6', 'active', 'RUFLO Smart Router'],
  ['qiDpHgO622iHCKwl', 'active', 'Lead → Campaign Pipeline'],
  ['7OMw3lArwxhuyNbH', 'active', 'Subject Line A/B + A/A Validator'],
  ['LyVoKcrypS5uLyuu', 'active', 'Client Onboarding E2E v2 (Webhook: Deal Won)'],
  ['M67zDzb9JZO0fTj5', 'active', 'IndexNow + Real-Time Crawl Signaling'],
  ['QgJGk3W8udRXQAkF', 'active', 'Influencer Authenticity Gate'],
  ['sCcaRT0NNQiE7JaR', 'active', 'Review Severity Tier Router (Real-time)'],
  ['9wwdQX9OtXUaFVNM', 'active', 'Meta-Agent Weekly Analysis'],
  ['Yo1j0LlBqFVqrihh', 'active', 'Email Lifecycle Orchestrator'],
  ['o4B2RvvzJSgZZHNn', 'active', 'Phase Gate Evidence Collector'],
  ['k6rZK9Uaa5sZRdZh', 'active', 'Agent Outcomes Writer (HARDCODED v2)'],
  ['yc2KVcCAx47gEfy8', 'active', 'UptimeRobot Webhook Handler'],

  // Section 5 · inactive (21)
  ['Gi2wq9baSRB3jQ0L', 'inactive', 'Cost Watchdog Multi-Service v2 (Cron Hourly)'],
  ['fe9D7xdk5QpKmBRw', 'inactive', 'Landing Page CRO Optimizer v2 (Weekly Sundays 7am)'],
  ['sTLfpoGyIphApYmO', 'inactive', 'Account Health Score Daily (6am)'],
  ['g0ewNcSKHmgtWFgu', 'inactive', 'Agent Latency + Error Rate Monitor (Cron 10min)'],
  ['EmBEtslgcd2p4Wd7', 'inactive', 'Churn Prediction 90d Pre-Renewal (9am)'],
  ['aWM5tIVU638bDTAn', 'inactive', 'Creative Performance Learner (Daily Cron 4AM UTC)'],
  ['7dwRRNC66cG5pWRU', 'inactive', 'Google Ads Performance Max Optimizer (Daily 4am)'],
  ['M2zQAsAgoqeSxeUm', 'inactive', 'Social Multi-Platform Publisher v2 (Hourly + Webhook)'],
  ['f9cgFfI32GJlYZm0', 'inactive', 'Cross-Platform Attribution Validator (Hourly)'],
  ['9UYoXtIqFvOaNel0', 'inactive', 'SEO Topical Authority Builder Monthly'],
  ['VHmEAgsBhRd5ymgM', 'inactive', 'Supabase Weekly Backup (Cron Sunday 3am UTC)'],
  ['6qh7SDSEvXULXeFp', 'inactive', 'RFM Segmentation Nightly (Daily 2am)'],
  ['F2oUCmxocQmKNP5r', 'inactive', 'GEO Content Freshness Cron'],
  ['3kECbILUvKiHpPmp', 'inactive', 'SEO Cannibalization Audit Weekly'],
  ['8gIdl3jzDZpHLyyq', 'inactive', 'SEO Backlink Opportunity Scanner Weekly'],
  ['uMrqNtzpuasn4vNn', 'inactive', 'QBR Generator Quarterly (1st of Quarter 4am)'],
  ['ohtClKf8B232uQSH', 'inactive', 'Expansion Readiness Scanner (Fridays 2pm)'],
  ['CNlTrfwkhhikPgtE', 'inactive', 'Client NPS + CSAT Monthly Pulse (1st of Month 10am)'],
  ['sdzZU9pj04Sa5LvD', 'inactive', 'Meta Ads Full-Stack Optimizer v2 (Daily 3am)'],
  ['89itIo28xJBrxqd9', 'inactive', 'Weekly Client Report Generator v2 (Mondays 8am)'],
  ['V7onHMA6pYtKjLh4', 'inactive', 'TikTok + LinkedIn Unified Manager (Daily 5am)'],
]

function loadEnv() {
  if (!existsSync(ENV_PATH)) {
    throw new Error(`.env.local not found at ${ENV_PATH}`)
  }
  const raw = readFileSync(ENV_PATH, 'utf8')
  const env = {}
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (!m) continue
    let value = m[2]
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1)
    env[m[1]] = value
  }
  if (!env.N8N_API_KEY) throw new Error('N8N_API_KEY missing in .env.local')
  if (!env.N8N_BASE_URL) throw new Error('N8N_BASE_URL missing in .env.local')
  return env
}

function detectTriggerType(nodes) {
  const triggerTypes = new Set()
  for (const n of nodes || []) {
    const t = n.type || ''
    if (t.includes('webhook')) triggerTypes.add('webhook')
    else if (t.includes('cron') || t.includes('schedule') || t.includes('Schedule')) triggerTypes.add('cron')
    else if (t.includes('Trigger') || t.includes('trigger')) triggerTypes.add('trigger-other')
    else if (t.includes('manualTrigger')) triggerTypes.add('manual')
  }
  if (triggerTypes.size === 0) return 'none'
  return [...triggerTypes].sort().join('+')
}

function detectSupabase(nodes) {
  const blob = JSON.stringify(nodes || [])
  return /supabase|postgres|@supabase|service_role/i.test(blob)
}

function detectHttpCalls(nodes) {
  for (const n of nodes || []) {
    const t = n.type || ''
    if (t.includes('httpRequest') || t.includes('HttpRequest')) return true
  }
  return false
}

function detectWebhook(nodes) {
  for (const n of nodes || []) {
    const t = n.type || ''
    if (t.includes('webhook') || t.includes('Webhook')) return true
  }
  return false
}

function complexityScore(nodes, connectionCount) {
  const nodeCount = (nodes || []).length
  // 1 = trivial (1-3 nodes) · 5 = very complex (40+ nodes or many branches)
  if (nodeCount <= 3) return 1
  if (nodeCount <= 8) return 2
  if (nodeCount <= 18) return 3
  if (nodeCount <= 35) return 4
  return 5
}

function csvEscape(value) {
  const s = String(value ?? '')
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

async function fetchWorkflow(id, baseUrl, apiKey) {
  const url = `${baseUrl.replace(/\/$/, '')}/api/v1/workflows/${id}`
  const resp = await fetch(url, {
    headers: { 'X-N8N-API-KEY': apiKey, 'Accept': 'application/json' },
  })
  if (!resp.ok) {
    const body = await resp.text().catch(() => '')
    throw new Error(`HTTP ${resp.status} for ${id}: ${body.slice(0, 200)}`)
  }
  return await resp.json()
}

async function main() {
  const env = loadEnv()
  mkdirSync(WORKFLOWS_DIR, { recursive: true })

  const summaryRows = [
    ['id', 'name', 'expected_status', 'active', 'node_count', 'connection_count', 'trigger_type',
     'has_supabase_calls', 'has_http_calls', 'has_webhook', 'last_updated', 'complexity_score', 'fetch_status'],
  ]

  let okCount = 0
  let failCount = 0
  const failures = []

  for (const [id, expectedStatus, expectedName] of WORKFLOW_IDS) {
    process.stdout.write(`[${(okCount + failCount + 1).toString().padStart(2, '0')}/${WORKFLOW_IDS.length}] ${id} (${expectedName})... `)
    try {
      const wf = await fetchWorkflow(id, env.N8N_BASE_URL, env.N8N_API_KEY)
      writeFileSync(resolve(WORKFLOWS_DIR, `${id}.json`), JSON.stringify(wf, null, 2))

      const nodes = wf.nodes || []
      const connections = wf.connections || {}
      let connCount = 0
      for (const k of Object.keys(connections)) {
        const arr = connections[k]?.main || []
        for (const branch of arr) connCount += (branch || []).length
      }

      summaryRows.push([
        id,
        wf.name || expectedName,
        expectedStatus,
        wf.active ? 'true' : 'false',
        nodes.length,
        connCount,
        detectTriggerType(nodes),
        detectSupabase(nodes),
        detectHttpCalls(nodes),
        detectWebhook(nodes),
        wf.updatedAt || wf.updated_at || '',
        complexityScore(nodes, connCount),
        'OK',
      ])
      console.log('OK')
      okCount++
    } catch (err) {
      failures.push({ id, name: expectedName, error: err.message })
      summaryRows.push([id, expectedName, expectedStatus, '?', '?', '?', '?', '?', '?', '?', '?', '?', `FAIL:${err.message.slice(0, 80)}`])
      console.log(`FAIL · ${err.message}`)
      failCount++
    }
  }

  const csv = summaryRows.map(row => row.map(csvEscape).join(',')).join('\n')
  writeFileSync(SUMMARY_CSV, csv)

  console.log('\n========================================')
  console.log(`Done. OK=${okCount} · FAIL=${failCount}`)
  console.log(`JSONs: ${WORKFLOWS_DIR}`)
  console.log(`Summary CSV: ${SUMMARY_CSV}`)
  if (failures.length) {
    console.log('\nFailures:')
    for (const f of failures) console.log(`  - ${f.id} (${f.name}): ${f.error}`)
  }
}

main().catch(err => { console.error('FATAL:', err); process.exit(1) })
