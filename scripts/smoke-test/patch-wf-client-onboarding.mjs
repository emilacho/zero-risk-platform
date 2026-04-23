#!/usr/bin/env node
/**
 * Surgical patcher for Client Onboarding E2E v2 workflow.
 *
 * Fixes:
 *   - Agent call: body uses `agent_id` which /api/agents/run didn't accept →
 *     add `agent` field (and /api/agents/run also now tolerates agent_id).
 *     Also add top-level client_id so mock mode triggers on "smoke-" prefix.
 *   - Add defensive string fallbacks in body templates.
 *   - Reroute Slack URL to stub fallback.
 *   - All HTTP nodes use $('Exact Name').item.json for state reach-back.
 */
import { endpoints } from './lib/env.mjs'
import { fetchJson } from './lib/fetch.mjs'
import { listN8nWorkflows, fetchWorkflowDetail } from './lib/workflows.mjs'

const ep = endpoints()
const H = { 'X-N8N-API-KEY': ep.N8N_API_KEY, 'Content-Type': 'application/json', 'Accept': 'application/json' }
const DRY = process.argv.includes('--dry-run')

const BASE = "{{ $env.ZERO_RISK_API_URL || 'https://zero-risk-platform.vercel.app' }}"
const SLACK = `={{ $env.SLACK_WEBHOOK_URL || 'https://zero-risk-platform.vercel.app/api/stubs/slack-webhook' }}`

const VD = `$('Validate Deal Data').item.json`
const DISCOVERY = `$('Call Onboarding Specialist: Auto-Discovery').item.json`
const NOTION_WS = `$('Create Notion Client Workspace').item.json`
const SUCCESS_PLAN = `$('Build Success Plan Template').item.json`
const NOTION_PLAN = `$('Create Success Plan in Notion').item.json`

const FIXED_PARAMS = {
  'Call Onboarding Specialist: Auto-Discovery': {
    method: 'POST',
    url: `=${BASE}/api/agents/run`,
    sendHeaders: true,
    headerParameters: { parameters: [
      { name: 'Content-Type', value: 'application/json' },
      { name: 'x-api-key', value: '={{ $env.INTERNAL_API_KEY }}' },
      { name: 'x-smoke-test', value: `={{ (${VD}.client_id || "").startsWith("smoke-") ? "1" : "" }}` },
    ]},
    sendBody: true,
    specifyBody: 'json',
    jsonBody: `={\n  "agent": "onboarding-specialist",\n  "agent_id": "onboarding-specialist",\n  "client_id": "{{ ${VD}.client_id || '' }}",\n  "task": {{ JSON.stringify('Auto-discover and populate Client Brain for ' + (${VD}.client_name || 'new client') + ' (industry: ' + (${VD}.industry || 'unknown') + ', website: ' + (${VD}.website || 'unknown') + '). Research brand voice, ICP, competitive landscape, VOC. Return discovery report.') }},\n  "context": { "smoke_test": {{ (${VD}.client_id || "").startsWith("smoke-") }}, "client_id": "{{ ${VD}.client_id || '' }}", "client_name": "{{ ${VD}.client_name || '' }}", "website": "{{ ${VD}.website || '' }}", "industry": "{{ ${VD}.industry || '' }}" }\n}`,
    options: { timeout: 180000 },
  },
  'Create Notion Client Workspace': {
    method: 'POST',
    url: `=${BASE}/api/notion/create-client-workspace`,
    sendHeaders: true,
    headerParameters: { parameters: [
      { name: 'Content-Type', value: 'application/json' },
      { name: 'x-api-key', value: '={{ $env.INTERNAL_API_KEY }}' },
    ]},
    sendBody: true,
    specifyBody: 'json',
    jsonBody: `={\n  "client_name": "{{ ${VD}.client_name || '' }}",\n  "client_id": "{{ ${VD}.client_id || ('temp-' + Date.now()) }}",\n  "industry": "{{ ${VD}.industry || '' }}",\n  "parent_page_id": "{{ $env.NOTION_PARENT_PAGE_ID || 'stub-parent' }}"\n}`,
    options: { timeout: 30000 },
  },
  'Create Success Plan in Notion': {
    method: 'POST',
    url: `=${BASE}/api/notion/create-success-plan`,
    sendHeaders: true,
    headerParameters: { parameters: [
      { name: 'Content-Type', value: 'application/json' },
      { name: 'x-api-key', value: '={{ $env.INTERNAL_API_KEY }}' },
    ]},
    sendBody: true,
    specifyBody: 'json',
    jsonBody: `={\n  "client_name": "{{ ${VD}.client_name || '' }}",\n  "client_id": "{{ ${VD}.client_id || '' }}",\n  "workspace_id": "{{ ${NOTION_WS}.workspace_id || '' }}",\n  "plan": {{ JSON.stringify(${SUCCESS_PLAN} ?? {}) }}\n}`,
    options: { timeout: 30000 },
  },
  'Schedule Kickoff Call (GHL Calendar)': {
    method: 'POST',
    url: `=${BASE}/api/ghl/create-calendar-event`,
    sendHeaders: true,
    headerParameters: { parameters: [
      { name: 'Content-Type', value: 'application/json' },
      { name: 'x-api-key', value: '={{ $env.INTERNAL_API_KEY }}' },
    ]},
    sendBody: true,
    specifyBody: 'json',
    jsonBody: `={\n  "contact_id": "{{ ${VD}.primary_contact_id || ('stub-contact-' + Date.now()) }}",\n  "event_title": {{ JSON.stringify('Kickoff Call: ' + (${VD}.client_name || 'new client')) }},\n  "duration_minutes": 60,\n  "scheduled_at": "{{ new Date(Date.now() + 3*24*60*60*1000).toISOString() }}",\n  "description": "Welcome to Zero Risk! Success plan alignment + team intro."\n}`,
    options: { timeout: 30000 },
  },
  'GHL: Create AM Handoff Task': {
    method: 'POST',
    url: `=${BASE}/api/ghl/add-task`,
    sendHeaders: true,
    headerParameters: { parameters: [
      { name: 'Content-Type', value: 'application/json' },
      { name: 'x-api-key', value: '={{ $env.INTERNAL_API_KEY }}' },
    ]},
    sendBody: true,
    specifyBody: 'json',
    jsonBody: `={\n  "contact_id": "{{ ${VD}.primary_contact_id || ('stub-contact-' + Date.now()) }}",\n  "title": {{ JSON.stringify('Account Manager Handoff: ' + (${VD}.client_name || 'new client')) }},\n  "description": "Onboarding initiated. Client Brain auto-populated. Success plan drafted. Ready for AM ownership.",\n  "due_date": "{{ new Date(Date.now() + 5*24*60*60*1000).toISOString().split('T')[0] }}",\n  "priority": "high"\n}`,
    options: { timeout: 30000 },
  },
  'Alert Slack: Onboarding Initiated': {
    method: 'POST',
    url: SLACK,
    sendHeaders: false,
    sendBody: true,
    specifyBody: 'json',
    jsonBody: `={\n  "text": {{ JSON.stringify('ONBOARDING INITIATED\\nClient: ' + (${VD}.client_name || 'unknown') + '\\nIndustry: ' + (${VD}.industry || 'unknown') + '\\nContract: ' + (Array.isArray(${VD}.contract_scope) ? (${VD}.contract_scope.join(', ')) : String(${VD}.contract_scope || ''))) }}\n}`,
    options: { timeout: 10000 },
  },
}

const { workflows } = await listN8nWorkflows()
const targets = workflows.filter(w => /Client Onboarding E2E/i.test(w.name))
if (!targets.length) { console.error('No Client Onboarding E2E workflow found.'); process.exit(1) }

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
