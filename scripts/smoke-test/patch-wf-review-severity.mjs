#!/usr/bin/env node
/**
 * Surgical patcher for Review Severity Tier Router workflow.
 *
 * Root cause: $node['validate'|'classify-tier'|'draft-tier2'] refs use node IDs
 * which n8n v1.x no longer resolves. Rewrite to $('Exact Name').item.json.
 */
import { endpoints } from './lib/env.mjs'
import { fetchJson } from './lib/fetch.mjs'
import { listN8nWorkflows, fetchWorkflowDetail } from './lib/workflows.mjs'

const ep = endpoints()
const H = { 'X-N8N-API-KEY': ep.N8N_API_KEY, 'Content-Type': 'application/json', 'Accept': 'application/json' }
const DRY = process.argv.includes('--dry-run')

const BASE = "{{ $env.ZERO_RISK_API_URL || 'https://zero-risk-platform.vercel.app' }}"
const SLACK = `={{ $env.SLACK_WEBHOOK_URL || 'https://zero-risk-platform.vercel.app/api/stubs/slack-webhook' }}`

const VAL = `$('Validate Review').item.json`
const CLASSIFY = `$('Classify Severity Tier').item.json`
const DRAFT = `$('Draft Tier 2 Response (Haiku)').item.json`

const FIXED_PARAMS = {
  'Slack: Tier 1 Alert (No Auto-Response)': {
    method: 'POST',
    url: SLACK,
    sendHeaders: false,
    sendBody: true,
    specifyBody: 'json',
    jsonBody: `={\n  "text": "TIER 1 LEGAL/SAFETY ALERT",\n  "attachments": [{\n    "color": "danger",\n    "fields": [\n      { "title": "Platform", "value": "{{ ${VAL}.platform || '' }}" },\n      { "title": "Rating", "value": "{{ (${VAL}.rating || '?') + 'star' }}" },\n      { "title": "Review", "value": {{ JSON.stringify(${VAL}.text || ${VAL}.review_text || '') }} },\n      { "title": "Action", "value": "IMMEDIATE HITL REQUIRED. No auto-response. Route to legal team." }\n    ]\n  }]\n}`,
    options: { timeout: 10000 },
  },
  'Draft Tier 2 Response (Haiku)': {
    method: 'POST',
    url: `=${BASE}/api/agents/run`,
    sendHeaders: true,
    headerParameters: { parameters: [
      { name: 'Content-Type', value: 'application/json' },
      { name: 'x-api-key', value: '={{ $env.INTERNAL_API_KEY }}' },
      { name: 'x-smoke-test', value: `={{ (${VAL}.client_id || "").startsWith("smoke-") ? "1" : "" }}` },
    ]},
    sendBody: true,
    specifyBody: 'json',
    jsonBody: `={\n  "agent": "review_responder",\n  "model": "claude-haiku-4-5",\n  "task": {{ JSON.stringify('Draft 2 response variants for negative review (' + (${VAL}.rating || '?') + 'star) using Birdeye 4-step. Review: ' + (${VAL}.text || ${VAL}.review_text || '')) }},\n  "client_id": "{{ ${VAL}.client_id || '' }}",\n  "context": { "smoke_test": {{ (${VAL}.client_id || "").startsWith("smoke-") }} },\n  "extra": {{ JSON.stringify(${VAL} ?? {}) }}\n}`,
    options: { timeout: 120000 },
  },
  'Queue Tier 2 for HITL': {
    method: 'POST',
    url: `=${BASE}/api/review-responses/queue-hitl`,
    sendHeaders: true,
    headerParameters: { parameters: [
      { name: 'Content-Type', value: 'application/json' },
      { name: 'x-api-key', value: '={{ $env.INTERNAL_API_KEY }}' },
    ]},
    sendBody: true,
    specifyBody: 'json',
    jsonBody: `={\n  "client_id": "{{ ${VAL}.client_id || '' }}",\n  "review_id": "{{ ${VAL}.review_id || '' }}",\n  "platform": "{{ ${VAL}.platform || '' }}",\n  "severity_tier": "{{ ${CLASSIFY}.severity_tier || 'tier2' }}",\n  "response_variants": {{ JSON.stringify(${DRAFT} ?? {}) }},\n  "sla_hours": {{ Number(${CLASSIFY}.response_sla_hours) || 24 }}\n}`,
    options: { timeout: 30000 },
  },
  'Post Tier 3 Auto-Response': {
    method: 'POST',
    url: SLACK,
    sendHeaders: true,
    headerParameters: { parameters: [
      { name: 'Content-Type', value: 'application/json' },
    ]},
    sendBody: true,
    specifyBody: 'json',
    jsonBody: `={\n  "type": "review_response",\n  "contactId": "{{ ${VAL}.author || 'unknown' }}",\n  "message": "{{ $json.auto_response || '' }}",\n  "platform": "{{ ${VAL}.platform || '' }}"\n}`,
    options: { timeout: 30000 },
  },
  'Log Review Metric': {
    method: 'POST',
    url: `=${BASE}/api/review-metrics/upsert`,
    sendHeaders: true,
    headerParameters: { parameters: [
      { name: 'Content-Type', value: 'application/json' },
      { name: 'x-api-key', value: '={{ $env.INTERNAL_API_KEY }}' },
    ]},
    sendBody: true,
    specifyBody: 'json',
    jsonBody: `={\n  "client_id": "{{ ${VAL}.client_id || '' }}",\n  "review_id": "{{ ${VAL}.review_id || '' }}",\n  "external_id": "{{ ${VAL}.review_id || '' }}",\n  "platform": "{{ ${VAL}.platform || 'google' }}",\n  "rating": {{ Number(${VAL}.rating) || 3 }},\n  "severity_tier": "{{ ${CLASSIFY}.severity_tier || 'tier3' }}",\n  "sentiment": "{{ ${CLASSIFY}.sentiment || 'neutral' }}",\n  "body": {{ JSON.stringify(${VAL}.text || ${VAL}.review_text || '') }},\n  "status": "new",\n  "posted_at": "{{ new Date().toISOString() }}"\n}`,
    options: { timeout: 30000 },
  },
  'Respond to Webhook': {
    httpMethod: 'POST',
    respondWith: 'json',
    responseBody: `={{ { review_id: (${VAL}.review_id || null), tier: (${CLASSIFY}.severity_tier || 'tier3'), status: 'processed' } }}`,
    options: {},
  },
}

const { workflows } = await listN8nWorkflows()
const targets = workflows.filter(w => /Review Severity Tier/i.test(w.name))
if (!targets.length) { console.error('No Review Severity Tier workflow found.'); process.exit(1) }

const CLEAR_ON_REWRITE = ['formData', 'bodyParameters', 'queryParameters', 'authentication']
for (const w of targets) {
  console.log(`\n=== ${w.name} (${w.id})`)
  const detail = await fetchWorkflowDetail(w.id)
  if (!detail.ok || !detail.json?.nodes) { console.error(`   ✗ fetch failed: ${detail.status}`); continue }
  const wf = detail.json
  let changed = 0
  const missing = []
  for (const node of wf.nodes) {
    const fix = FIXED_PARAMS[node.name]
    if (!fix) continue
    const before = JSON.stringify(node.parameters)
    const baseParams = { ...(node.parameters || {}) }
    for (const key of CLEAR_ON_REWRITE) delete baseParams[key]
    node.parameters = { ...baseParams, ...fix }
    if (JSON.stringify(node.parameters) !== before) { changed++; console.log(`   rewrote: ${node.name}`) }
  }
  for (const name of Object.keys(FIXED_PARAMS)) {
    if (!wf.nodes.some(n => n.name === name)) missing.push(name)
  }
  if (missing.length) console.log('   ⚠ missing nodes:', missing)
  if (!changed) { console.log('   (no changes)'); continue }
  if (DRY) { console.log(`   [DRY] would PUT ${changed} node rewrites`); continue }
  const put = await fetchJson(ep.n8n + '/api/v1/workflows/' + w.id, {
    method: 'PUT', headers: H,
    body: JSON.stringify({
      name: wf.name, nodes: wf.nodes, connections: wf.connections,
      settings: wf.settings || { executionOrder: 'v1' },
    }),
  })
  if (put.ok) {
    console.log(`   ✓ PUT 200 — ${changed} nodes patched`)
    if (w.active) {
      await fetchJson(ep.n8n + '/api/v1/workflows/' + w.id + '/deactivate', { method:'POST', headers:H, body:'{}' })
      await new Promise(r => setTimeout(r, 800))
      await fetchJson(ep.n8n + '/api/v1/workflows/' + w.id + '/activate', { method:'POST', headers:H, body:'{}' })
      console.log(`   ✓ reactivated`)
    }
  } else {
    console.log(`   ✗ PUT ${put.status}: ${put.text?.slice(0, 400) || put.error}`)
  }
}
console.log('\nDone.')
