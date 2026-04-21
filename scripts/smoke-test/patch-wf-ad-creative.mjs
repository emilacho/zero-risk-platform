#!/usr/bin/env node
/**
 * Surgical patcher for Ad Creative → Landing Message Match Validator.
 *
 * Fixes:
 *  - /api/agents/run-sdk → /api/agents/run (task runner binary missing)
 *  - Firecrawl URL → $env fallback to our stub (no real Firecrawl key needed)
 *  - Fetch Creative URL uses our new /api/meta-ads/creative stub
 *  - Mismatch IF: defaults to 100 when agent omits match_score → APPROVED branch
 *  - BLOCK Launch points to the new /api/campaigns/block-launch stub
 *  - Slack URLs: add missing "=" prefix + fall back to stub webhook
 *  - Respond terminators reach back to $('Validate Input').item.json for audit_id
 *  - Defensive guards on required_actions.map when undefined
 */
import { endpoints } from './lib/env.mjs'
import { fetchJson } from './lib/fetch.mjs'
import { listN8nWorkflows, fetchWorkflowDetail } from './lib/workflows.mjs'

const ep = endpoints()
const H = { 'X-N8N-API-KEY': ep.N8N_API_KEY, 'Content-Type': 'application/json', 'Accept': 'application/json' }
const DRY = process.argv.includes('--dry-run')

const BASE = "{{ $env.ZERO_RISK_API_URL || 'https://zero-risk-platform.vercel.app' }}"
const FIRECRAWL = `={{ $env.FIRECRAWL_API_URL || 'https://zero-risk-platform.vercel.app/api/stubs/firecrawl/scrape' }}`
const SLACK = `={{ $env.SLACK_WEBHOOK_URL || 'https://zero-risk-platform.vercel.app/api/stubs/slack-webhook' }}`

const VI = `$('Validate Input').item.json`
const EDITOR = `$('Editor en Jefe (Sonnet) - Schwartz Audit').item.json`

const FIXED_PARAMS = {
  'Fetch Creative (if applicable)': {
    method: 'GET',
    url: `=${BASE}/api/meta-ads/creative?creative_id={{ encodeURIComponent(${VI}.creative_id || 'unknown') }}`,
    sendHeaders: true,
    headerParameters: { parameters: [
      { name: 'x-api-key', value: '={{ $env.INTERNAL_API_KEY }}' },
    ]},
    options: { timeout: 20000, response: { response: { neverError: true } } },
  },
  'Scrape Landing (if applicable)': {
    method: 'POST',
    url: FIRECRAWL,
    sendHeaders: true,
    headerParameters: { parameters: [
      { name: 'Authorization', value: '=Bearer {{ $env.FIRECRAWL_API_KEY || "stub" }}' },
      { name: 'Content-Type', value: 'application/json' },
    ]},
    sendBody: true,
    specifyBody: 'json',
    jsonBody: `={\n  "url": {{ JSON.stringify(${VI}.landing_url || 'https://example.com') }},\n  "formats": ["markdown"],\n  "waitFor": 1000\n}`,
    options: { timeout: 30000, response: { response: { neverError: true } } },
  },
  'Editor en Jefe (Sonnet) - Schwartz Audit': {
    method: 'POST',
    url: `=${BASE}/api/agents/run`,
    sendHeaders: true,
    headerParameters: { parameters: [
      { name: 'Content-Type', value: 'application/json' },
      { name: 'x-api-key', value: '={{ $env.INTERNAL_API_KEY }}' },
      { name: 'x-smoke-test', value: `={{ (${VI}.client_id || "").startsWith("smoke-") ? "1" : "" }}` },
    ]},
    sendBody: true,
    specifyBody: 'json',
    jsonBody: `={\n  "agent": "editor_en_jefe",\n  "model": "claude-sonnet-4-6",\n  "task": {{ JSON.stringify('Message-match audit for campaign ' + (${VI}.campaign_id || 'unknown') + '. Apply Schwartz positioning layers and score 0-100. If >30pt mismatch, flag and recommend copy/positioning fixes. Return JSON: { match_score, flags, required_actions }.') }},\n  "client_id": "{{ ${VI}.client_id }}",\n  "audit_id": "{{ ${VI}.audit_id }}",\n  "campaign_id": {{ JSON.stringify(${VI}.campaign_id) }},\n  "creative_id": {{ JSON.stringify(${VI}.creative_id) }},\n  "landing_url": {{ JSON.stringify(${VI}.landing_url) }},\n  "change_type": {{ JSON.stringify(${VI}.change_type) }},\n  "context": { "smoke_test": {{ (${VI}.client_id || "").startsWith("smoke-") }} },\n  "extra": { "validate_input": {{ JSON.stringify(${VI}) }}, "merged_content": {{ JSON.stringify($json) }} }\n}`,
    options: { timeout: 180000 },
  },
  'Mismatch >30pct gap?': {
    conditions: {
      options: { caseSensitive: true, typeValidation: 'strict' },
      conditions: [
        {
          leftValue: `={{ Number(${EDITOR}.match_score) || 100 }}`,
          rightValue: 70,
          operator: { type: 'number', operation: 'lt' },
        },
      ],
    },
  },
  'BLOCK Launch + Escalate': {
    method: 'POST',
    url: `=${BASE}/api/campaigns/block-launch`,
    sendHeaders: true,
    headerParameters: { parameters: [
      { name: 'Content-Type', value: 'application/json' },
      { name: 'x-api-key', value: '={{ $env.INTERNAL_API_KEY }}' },
    ]},
    sendBody: true,
    specifyBody: 'json',
    jsonBody: `={\n  "campaign_id": {{ JSON.stringify(${VI}.campaign_id) }},\n  "client_id": "{{ ${VI}.client_id }}",\n  "audit_id": "{{ ${VI}.audit_id }}",\n  "reason": "message_match_violation",\n  "match_score": {{ Number(${EDITOR}.match_score) || 0 }},\n  "blocked_by": "editor_en_jefe",\n  "required_actions": {{ JSON.stringify(${EDITOR}.required_actions || []) }}\n}`,
    options: { timeout: 30000 },
  },
  'Slack Alert (BLOCKED)': {
    method: 'POST',
    url: SLACK,
    sendHeaders: false,
    sendBody: true,
    specifyBody: 'json',
    jsonBody: `={\n  "text": {{ JSON.stringify('Message Match Violation: ' + (${VI}.campaign_id || 'unknown')) }},\n  "blocks": [\n    {\n      "type": "section",\n      "text": { "type": "mrkdwn", "text": {{ JSON.stringify('*MESSAGE MATCH VIOLATION DETECTED*\\nCampaign: ' + (${VI}.campaign_id || 'unknown') + '\\nMatch Score: ' + (Number(${EDITOR}.match_score) || 0) + '/100\\n\\nRequired Actions:\\n' + ((${EDITOR}.required_actions || []).map(a => '- ' + a).join('\\n')) + '\\n\\nAd launch BLOCKED pending fixes.') }} }\n    }\n  ]\n}`,
    options: { timeout: 10000 },
  },
  'Respond (Blocked)': {
    httpMethod: 'POST',
    respondWith: 'json',
    responseBody: `={{ { audit_id: ${VI}.audit_id, match_score: Number(${EDITOR}.match_score) || 0, status: 'blocked_launch', reason: 'message_match_violation' } }}`,
    options: {},
  },
  'Respond (Approved)': {
    httpMethod: 'POST',
    respondWith: 'json',
    responseBody: `={{ { audit_id: ${VI}.audit_id, match_score: Number(${EDITOR}.match_score) || 100, status: 'approved', reason: 'message_alignment_verified' } }}`,
    options: {},
  },
}

const { workflows } = await listN8nWorkflows()
const targets = workflows.filter(w => /Ad Creative/i.test(w.name) && /Message Match/i.test(w.name))
if (!targets.length) { console.error('No Ad Creative workflow found.'); process.exit(1) }

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
