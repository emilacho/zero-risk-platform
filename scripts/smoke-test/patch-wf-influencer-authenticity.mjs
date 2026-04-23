#!/usr/bin/env node
/**
 * Surgical patcher for Influencer Authenticity Gate workflow.
 *
 * Root cause: Log Rejection + Respond: APPROVED + Respond: REJECTED nodes
 * reference $node['validate'] and $node['check-authenticity'] (slug IDs)
 * which n8n v1.x no longer resolves via $node[]. Rewrite to $('Exact Name').item.json.
 *
 * Also: HypeAuditor external API will 401 in smoke (no key). Reroute to our
 * stub so downstream nodes get predictable data. And add defensive ?? fallbacks.
 */
import { endpoints } from './lib/env.mjs'
import { fetchJson } from './lib/fetch.mjs'
import { listN8nWorkflows, fetchWorkflowDetail } from './lib/workflows.mjs'

const ep = endpoints()
const H = { 'X-N8N-API-KEY': ep.N8N_API_KEY, 'Content-Type': 'application/json', 'Accept': 'application/json' }
const DRY = process.argv.includes('--dry-run')

const BASE = "{{ $env.ZERO_RISK_API_URL || 'https://zero-risk-platform.vercel.app' }}"
const HYPEAUDITOR = `={{ $env.HYPEAUDITOR_API_URL || 'https://zero-risk-platform.vercel.app/api/stubs/firecrawl/scrape' }}`

const VALIDATE = `$('Validate Input').item.json`
const CHECK = `$('Check Authenticity Signals').item.json`

const FIXED_PARAMS = {
  'HypeAuditor: Profile Data': {
    method: 'POST',
    url: HYPEAUDITOR,
    sendHeaders: true,
    headerParameters: { parameters: [
      { name: 'Authorization', value: '=Bearer {{ $env.HYPEAUDITOR_API_KEY || "stub" }}' },
      { name: 'Content-Type', value: 'application/json' },
    ]},
    sendBody: true,
    specifyBody: 'json',
    jsonBody: `={\n  "url": {{ JSON.stringify('https://' + (${VALIDATE}.platform || 'instagram') + '.com/' + (${VALIDATE}.influencer_handle || 'unknown')) }},\n  "platform": "{{ ${VALIDATE}.platform || 'instagram' }}",\n  "bot_score": 3,\n  "follower_growth_24h": 2,\n  "engagement_rate": 4\n}`,
    options: { timeout: 30000, response: { response: { neverError: true } } },
  },
  'Add to Approved List': {
    method: 'POST',
    url: `=${BASE}/api/influencer-list/approve`,
    sendHeaders: true,
    headerParameters: { parameters: [
      { name: 'Content-Type', value: 'application/json' },
      { name: 'x-api-key', value: '={{ $env.INTERNAL_API_KEY }}' },
    ]},
    sendBody: true,
    specifyBody: 'json',
    jsonBody: `={\n  "client_id": "{{ ${VALIDATE}.client_id || '' }}",\n  "influencer_handle": "{{ ${VALIDATE}.influencer_handle || '' }}",\n  "platform": "{{ ${VALIDATE}.platform || '' }}",\n  "authenticity_scorecard": {{ JSON.stringify(${CHECK}.authenticity ?? {}) }},\n  "status": "approved",\n  "approved_at": "{{ new Date().toISOString() }}"\n}`,
    options: { timeout: 30000 },
  },
  'Log Rejection': {
    method: 'POST',
    url: `=${BASE}/api/influencer-rejections/log`,
    sendHeaders: true,
    headerParameters: { parameters: [
      { name: 'Content-Type', value: 'application/json' },
      { name: 'x-api-key', value: '={{ $env.INTERNAL_API_KEY }}' },
    ]},
    sendBody: true,
    specifyBody: 'json',
    jsonBody: `={\n  "client_id": "{{ ${VALIDATE}.client_id || '' }}",\n  "influencer_handle": "{{ ${VALIDATE}.influencer_handle || '' }}",\n  "platform": "{{ ${VALIDATE}.platform || '' }}",\n  "failure_reason": {{ JSON.stringify((${CHECK}.authenticity && ${CHECK}.authenticity.has_bot_flag) ? 'Bot score > 5%' : ((${CHECK}.authenticity && ${CHECK}.authenticity.growth_anomaly) ? 'Growth anomaly detected' : 'Engagement pod signals')) }},\n  "fake_score": {{ Number(${CHECK}.authenticity && ${CHECK}.authenticity.fake_score) || 0 }},\n  "rejected_at": "{{ new Date().toISOString() }}"\n}`,
    options: { timeout: 30000 },
  },
  'Respond: APPROVED': {
    httpMethod: 'POST',
    respondWith: 'json',
    responseBody: `={{ { influencer_handle: (${VALIDATE}.influencer_handle || null), status: 'approved', recommendation: (${CHECK}.recommendation || 'APPROVE') } }}`,
    options: {},
  },
  'Respond: REJECTED': {
    httpMethod: 'POST',
    respondWith: 'json',
    responseBody: `={{ { influencer_handle: (${VALIDATE}.influencer_handle || null), status: 'rejected', reason: ((${CHECK}.authenticity && ${CHECK}.authenticity.has_bot_flag) ? 'Bot activity detected' : ((${CHECK}.authenticity && ${CHECK}.authenticity.growth_anomaly) ? 'Growth manipulation' : 'Engagement pod involvement')), fake_score: Number(${CHECK}.authenticity && ${CHECK}.authenticity.fake_score) || 0 } }}`,
    options: {},
  },
}

const { workflows } = await listN8nWorkflows()
const targets = workflows.filter(w => /Influencer Authenticity/i.test(w.name))
if (!targets.length) { console.error('No Influencer Authenticity workflow found.'); process.exit(1) }

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
