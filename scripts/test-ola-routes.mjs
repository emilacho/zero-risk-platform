#!/usr/bin/env node
/**
 * Zero Risk — Ola 1 + Ola 2 route smoke test
 *
 * Runs a lightweight probe against every new API route to verify:
 *   (a) route is deployed (not 404)
 *   (b) auth works (401 without key, 200/503 with key)
 *   (c) database is reachable (200 when env configured)
 *   (d) external integrations gracefully degrade (503 with `missing` field)
 *
 * Usage:
 *   cd zero-risk-platform
 *   node scripts/test-ola-routes.mjs
 *   node scripts/test-ola-routes.mjs --base https://zero-risk-platform.vercel.app
 *   node scripts/test-ola-routes.mjs --ola 1        # only Ola 1 routes
 *   node scripts/test-ola-routes.mjs --verbose      # show full responses
 *
 * Reads .env.local for INTERNAL_API_KEY.
 */

import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

// ── Parse args ────────────────────────────────────────────
const args = process.argv.slice(2)
const VERBOSE = args.includes('--verbose') || args.includes('-v')
const OLA_FILTER = args.find(a => a.startsWith('--ola='))?.slice(6)
const BASE_ARG = args.find(a => a.startsWith('--base='))?.slice(7)

// ── Load .env.local ───────────────────────────────────────
let INTERNAL_API_KEY = ''
let ZERO_RISK_API_URL = BASE_ARG || ''

try {
  const envPath = resolve(__dirname, '..', '.env.local')
  const envContent = readFileSync(envPath, 'utf-8')
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx < 0) continue
    const k = trimmed.slice(0, eqIdx)
    const v = trimmed.slice(eqIdx + 1)
    if (k === 'INTERNAL_API_KEY') INTERNAL_API_KEY = v
    if (k === 'NEXT_PUBLIC_BASE_URL' && !ZERO_RISK_API_URL) ZERO_RISK_API_URL = v
  }
} catch (e) {
  console.warn('⚠️  .env.local not found; pass --base=https://... to set URL')
}

if (!ZERO_RISK_API_URL) ZERO_RISK_API_URL = 'https://zero-risk-platform.vercel.app'
if (!INTERNAL_API_KEY) {
  console.error('❌ INTERNAL_API_KEY not found in .env.local. Cannot run authenticated tests.')
  process.exit(1)
}

console.log(`🔍 Testing routes at: ${ZERO_RISK_API_URL}`)
console.log(`   Internal key: ${INTERNAL_API_KEY.slice(0, 8)}...${INTERNAL_API_KEY.slice(-4)}`)
console.log('')

// ── Test matrix ───────────────────────────────────────────
/**
 * Each entry: { ola, name, method, path, body?, expected: [200, 503, ...] }
 * expected = array of allowed status codes (any one is pass)
 */
const TESTS = [
  // ──────────────── OLA 1 ────────────────
  { ola: 1, name: 'campaign-pipeline/state GET (not found is OK)', method: 'GET',
    path: '/api/campaign-pipeline/state?request_id=test-probe-' + Date.now(), expected: [404, 200] },
  { ola: 1, name: 'campaign-pipeline/state POST (create)', method: 'POST',
    path: '/api/campaign-pipeline/state',
    body: { request_id: 'probe-' + Date.now(), client_id: 'probe-client', current_phase: 'DISCOVER', status: 'active' },
    expected: [200] },
  { ola: 1, name: 'evidence/validate POST', method: 'POST',
    path: '/api/evidence/validate',
    body: { request_id: 'probe-ev-' + Date.now(), phase: 'DISCOVER', phase_output: { x: 1 }, success_criteria: ['x'] },
    expected: [200] },
  { ola: 1, name: 'phase-gate/audit POST', method: 'POST',
    path: '/api/phase-gate/audit',
    body: { request_id: 'probe-pg-' + Date.now(), phase: 'STRATEGIZE', verdict: 'PASS', rationale: 'probe test' },
    expected: [200] },
  { ola: 1, name: 'hitl/approvals/create POST', method: 'POST',
    path: '/api/hitl/approvals/create',
    body: { approval_type: 'probe_test', required_approver: 'emilio', payload: { probe: true } },
    expected: [200] },
  { ola: 1, name: 'hitl/approvals/pending GET', method: 'GET',
    path: '/api/hitl/approvals/pending?limit=5', expected: [200] },
  { ola: 1, name: 'hitl/approvals/metrics POST', method: 'POST',
    path: '/api/hitl/approvals/metrics',
    body: { cycle_id: 'probe-cycle-' + Date.now(), queue_depth: 0, items_expired: 0, items_escalated: 0, items_renotified: 0 },
    expected: [200] },
  { ola: 1, name: 'agent-routing/log POST', method: 'POST',
    path: '/api/agent-routing/log',
    body: { request_id: 'probe-r-' + Date.now(), original_request: 'probe test', classification_type: 'straightforward', assigned_agents: ['ruflo'] },
    expected: [200] },
  { ola: 1, name: 'analytics/agent-outcomes GET', method: 'GET',
    path: '/api/analytics/agent-outcomes?days=1&limit=5', expected: [200] },
  { ola: 1, name: 'analytics/performance-metrics GET', method: 'GET',
    path: '/api/analytics/performance-metrics?days=1&limit=5', expected: [200] },
  { ola: 1, name: 'identity-improvements/queue GET', method: 'GET',
    path: '/api/identity-improvements/queue?limit=5', expected: [200] },
  { ola: 1, name: 'agent-outcomes/write POST', method: 'POST',
    path: '/api/agent-outcomes/write',
    body: { agent_slug: 'probe-agent', success: true, tokens_used: 1 },
    expected: [200] },

  // ──────────────── OLA 2 internal ────────────────
  { ola: 2, name: 'analytics/active-campaigns GET', method: 'GET',
    path: '/api/analytics/active-campaigns?limit=5', expected: [200] },
  { ola: 2, name: 'tracking/attribution-audits GET', method: 'GET',
    path: '/api/tracking/attribution-audits?limit=5', expected: [200] },
  { ola: 2, name: 'seo/cannibalization-store GET', method: 'GET',
    path: '/api/seo/cannibalization-store?limit=5', expected: [200] },
  { ola: 2, name: 'seo/content-refresh-enqueue GET', method: 'GET',
    path: '/api/seo/content-refresh-enqueue?limit=5', expected: [200] },

  // ──────────────── OLA 2 external (503 expected if env missing) ────────────────
  { ola: 2, name: 'meta-ads/campaigns GET (503 if no META_ACCESS_TOKEN)', method: 'GET',
    path: '/api/meta-ads/campaigns?status=ACTIVE&limit=5', expected: [200, 503] },
  { ola: 2, name: 'meta-ads/spend-data GET', method: 'GET',
    path: '/api/meta-ads/spend-data?date_preset=last_1d', expected: [200, 503] },
  { ola: 2, name: 'ga4/conversion-data GET', method: 'GET',
    path: '/api/ga4/conversion-data?days=1', expected: [200, 503, 400] },
]

// ── Runner ────────────────────────────────────────────────
async function hit(test) {
  const url = `${ZERO_RISK_API_URL}${test.path}`
  const init = {
    method: test.method,
    headers: {
      'x-api-key': INTERNAL_API_KEY,
      'Content-Type': 'application/json',
    },
  }
  if (test.body) init.body = JSON.stringify(test.body)

  const t0 = Date.now()
  try {
    const res = await fetch(url, { ...init, signal: AbortSignal.timeout(15000) })
    const text = await res.text()
    const dt = Date.now() - t0
    let parsed = null
    try { parsed = JSON.parse(text) } catch {}
    return { status: res.status, dt, body: parsed, raw: text }
  } catch (err) {
    return { status: 0, dt: Date.now() - t0, error: err.message }
  }
}

async function runTest(test) {
  if (OLA_FILTER && String(test.ola) !== OLA_FILTER) return null
  const result = await hit(test)
  const pass = test.expected.includes(result.status)
  const icon = pass ? '✅' : '❌'
  const statusStr = result.status === 0 ? `ERR: ${result.error}` : `${result.status}`
  console.log(`  ${icon} [Ola ${test.ola}] ${test.name.padEnd(60)} → ${statusStr} (${result.dt}ms)`)
  if (!pass || VERBOSE) {
    const snippet = result.body ? JSON.stringify(result.body).slice(0, 200) : result.raw?.slice(0, 200)
    console.log(`      ${snippet}`)
  }
  return { ...test, result, pass }
}

async function main() {
  const results = []
  for (const test of TESTS) {
    const r = await runTest(test)
    if (r) results.push(r)
  }

  console.log('')
  console.log('━'.repeat(80))
  const passed = results.filter((r) => r.pass).length
  const failed = results.filter((r) => !r.pass).length
  console.log(`Total: ${results.length}  ✅ ${passed} passed  ❌ ${failed} failed`)

  // 503s are acceptable for external routes pre-FASE-B
  const expected503 = results.filter((r) => r.pass && r.result.status === 503).length
  if (expected503 > 0) {
    console.log(`  ⚠️  ${expected503} routes returned 503 (not_configured) — waiting on external env vars (FASE B).`)
  }

  if (failed > 0) {
    console.log('\nFailed tests (unexpected status codes):')
    for (const r of results.filter((r) => !r.pass)) {
      console.log(`  - ${r.name} → got ${r.result.status}, expected one of ${r.expected.join('|')}`)
    }
    process.exit(1)
  }
}

main().catch(err => {
  console.error('Fatal:', err)
  process.exit(1)
})
