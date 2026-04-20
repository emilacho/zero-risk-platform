#!/usr/bin/env node
// Activate every Zero Risk workflow that has a webhook trigger AND is currently inactive.
// Cron-only workflows are left alone (they don't benefit from activation for smoke testing).
// Uses 1s delay between calls to avoid n8n API rate limiting.

import { endpoints } from './lib/env.mjs'
import { fetchJson } from './lib/fetch.mjs'
import { listN8nWorkflows, fetchWorkflowDetail, findWebhookPath } from './lib/workflows.mjs'

const ep = endpoints()
const H = { 'X-N8N-API-KEY': ep.N8N_API_KEY, 'Content-Type': 'application/json', 'Accept': 'application/json' }

const { workflows } = await listN8nWorkflows()
console.log(`Total workflows: ${workflows.length}`)

const zrOnly = workflows.filter(w => w.name.toLowerCase().includes('zero risk') || w.name.toLowerCase().startsWith('zr'))
console.log(`Zero Risk workflows: ${zrOnly.length}`)

let activated = 0, skipped_active = 0, skipped_no_webhook = 0, failed = 0
for (const w of zrOnly) {
  if (w.active) { skipped_active++; continue }
  const detail = await fetchWorkflowDetail(w.id)
  if (!detail.ok) {
    console.log(`  [fetch fail] ${w.name}`)
    failed++
    continue
  }
  const wh = findWebhookPath(detail.json)
  if (!wh) { skipped_no_webhook++; continue }
  const act = await fetchJson(ep.n8n + '/api/v1/workflows/' + w.id + '/activate', { method:'POST', headers:H, body:'{}' })
  if (act.ok) {
    console.log(`  [OK] Activated: ${w.name}`)
    activated++
  } else {
    console.log(`  [FAIL ${act.status}] ${w.name}: ${act.text || act.error}`)
    failed++
  }
  await new Promise(r => setTimeout(r, 1000))  // rate limit buffer
}

console.log(`\nSummary: ${activated} activated, ${skipped_active} already active, ${skipped_no_webhook} cron-only skipped, ${failed} failed`)
