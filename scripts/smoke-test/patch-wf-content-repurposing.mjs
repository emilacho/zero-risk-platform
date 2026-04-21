#!/usr/bin/env node
/**
 * Surgical patcher for the Content Repurposing 1→N workflow.
 * Same playbook as Video Pipeline: reach back to $('Code: Validate Brief') for
 * state, use node NAMES not ids, route /api/agents/run-sdk → /api/agents/run,
 * pipe Slack through stub.
 */
import { endpoints } from './lib/env.mjs'
import { fetchJson } from './lib/fetch.mjs'
import { listN8nWorkflows, fetchWorkflowDetail } from './lib/workflows.mjs'

const ep = endpoints()
const H = { 'X-N8N-API-KEY': ep.N8N_API_KEY, 'Content-Type': 'application/json', 'Accept': 'application/json' }
const DRY = process.argv.includes('--dry-run')

const BASE = "{{ $env.ZERO_RISK_API_URL || 'https://zero-risk-platform.vercel.app' }}"
const SLACK = `={{ $env.SLACK_WEBHOOK_URL || 'https://zero-risk-platform.vercel.app/api/stubs/slack-webhook' }}`

const VB = `$('Code: Validate Brief').item.json`
const PILLAR = `$('Fetch: Pillar Content').item.json`
const BRAIN = `$('Client Brain: Style Guide').item.json`
const AGENT = `$('Agent: Content Creator (Repurpose)').item.json`
const PUBLISH_AGENT = `$('Agent: Growth Hacker (Publish)').item.json`

const FIXED_PARAMS = {
  'Fetch: Pillar Content': {
    method: 'POST',
    url: `=${BASE}/api/content/fetch`,
    sendHeaders: true,
    headerParameters: { parameters: [
      { name: 'Content-Type', value: 'application/json' },
      { name: 'x-api-key', value: '={{ $env.INTERNAL_API_KEY }}' },
    ]},
    sendBody: true,
    specifyBody: 'json',
    jsonBody: `={\n  "client_id": "{{ ${VB}.client_id }}",\n  "pillar_id": "{{ ${VB}.pillar_id }}",\n  "pillar_type": "{{ ${VB}.pillar_type }}",\n  "task_id": "{{ ${VB}.task_id }}",\n  "platforms": {{ JSON.stringify(${VB}.platforms) }},\n  "content_url": {{ JSON.stringify(${VB}.content_url) }},\n  "auto_publish": {{ ${VB}.auto_publish }}\n}`,
    options: { timeout: 30000 },
  },
  'Client Brain: Style Guide': {
    method: 'POST',
    url: `=${BASE}/api/client-brain/rag-search`,
    sendHeaders: true,
    headerParameters: { parameters: [
      { name: 'Content-Type', value: 'application/json' },
      { name: 'x-api-key', value: '={{ $env.INTERNAL_API_KEY }}' },
    ]},
    sendBody: true,
    specifyBody: 'json',
    jsonBody: `={\n  "client_id": "{{ ${VB}.client_id }}",\n  "query": "Brand voice, tone per platform, content style, key messages, repurposing performance",\n  "k": 20,\n  "pillar_id": "{{ ${VB}.pillar_id }}",\n  "task_id": "{{ ${VB}.task_id }}"\n}`,
    options: {},
  },
  'Agent: Content Creator (Repurpose)': {
    method: 'POST',
    url: `=${BASE}/api/agents/run`,
    sendHeaders: true,
    headerParameters: { parameters: [
      { name: 'Content-Type', value: 'application/json' },
      { name: 'x-api-key', value: '={{ $env.INTERNAL_API_KEY }}' },
      { name: 'x-smoke-test', value: `={{ (${VB}.client_id || "").startsWith("smoke-") ? "1" : "" }}` },
    ]},
    sendBody: true,
    specifyBody: 'json',
    jsonBody: `={\n  "agent": "content_creator",\n  "model": "claude-sonnet-4-6",\n  "task": {{ JSON.stringify('Repurpose pillar content into ' + ((${VB}.platforms || []).length) + ' platform-specific formats: ' + (${VB}.platforms || []).join(', ') + '. Each variant adapts tone to platform while preserving core message. Output JSON with platform-keyed variants object.') }},\n  "client_id": "{{ ${VB}.client_id }}",\n  "task_id": "{{ ${VB}.task_id }}",\n  "pillar_id": "{{ ${VB}.pillar_id }}",\n  "platforms": {{ JSON.stringify(${VB}.platforms) }},\n  "context": { "smoke_test": {{ (${VB}.client_id || "").startsWith("smoke-") }} },\n  "extra": { "pillar": {{ JSON.stringify(${PILLAR}) }}, "brand_context": {{ JSON.stringify(${BRAIN}) }}, "brief": {{ JSON.stringify(${VB}) }} }\n}`,
    options: { timeout: 180000 },
  },
  'Store: Repurposing Queue': {
    method: 'POST',
    url: `=${BASE}/api/content-queue/store`,
    sendHeaders: true,
    headerParameters: { parameters: [
      { name: 'Content-Type', value: 'application/json' },
      { name: 'x-api-key', value: '={{ $env.INTERNAL_API_KEY }}' },
    ]},
    sendBody: true,
    specifyBody: 'json',
    jsonBody: `={\n  "client_id": "{{ ${VB}.client_id }}",\n  "source_pillar_id": "{{ ${VB}.pillar_id }}",\n  "repurposing_task_id": "{{ ${VB}.task_id }}",\n  "task_id": "{{ ${VB}.task_id }}",\n  "variants": {{ JSON.stringify(${AGENT}.variants || {}) }},\n  "queue_status": "awaiting_approval",\n  "auto_publish": {{ ${VB}.auto_publish }},\n  "platforms": {{ JSON.stringify(${VB}.platforms) }},\n  "pillar_type": "{{ ${VB}.pillar_type }}",\n  "created_at": "{{ new Date().toISOString() }}"\n}`,
    options: { timeout: 30000 },
  },
  'Agent: Growth Hacker (Publish)': {
    method: 'POST',
    url: `=${BASE}/api/agents/run`,
    sendHeaders: true,
    headerParameters: { parameters: [
      { name: 'Content-Type', value: 'application/json' },
      { name: 'x-api-key', value: '={{ $env.INTERNAL_API_KEY }}' },
      { name: 'x-smoke-test', value: `={{ (${VB}.client_id || "").startsWith("smoke-") ? "1" : "" }}` },
    ]},
    sendBody: true,
    specifyBody: 'json',
    jsonBody: `={\n  "agent": "growth_hacker",\n  "model": "claude-sonnet-4-6",\n  "task": {{ JSON.stringify('Publish repurposed content via GHL Social + Metricool. Target platforms: ' + ((${VB}.platforms || []).join(', '))) }},\n  "client_id": "{{ ${VB}.client_id }}",\n  "task_id": "{{ ${VB}.task_id }}",\n  "context": { "smoke_test": {{ (${VB}.client_id || "").startsWith("smoke-") }} },\n  "extra": { "variants": {{ JSON.stringify(${AGENT}.variants || {}) }}, "auto_schedule": true, "brief": {{ JSON.stringify(${VB}) }} }\n}`,
    options: { timeout: 120000 },
  },
  'Record: Outcome': {
    method: 'POST',
    url: `=${BASE}/api/outcomes/record`,
    sendHeaders: true,
    headerParameters: { parameters: [
      { name: 'Content-Type', value: 'application/json' },
      { name: 'x-api-key', value: '={{ $env.INTERNAL_API_KEY }}' },
    ]},
    sendBody: true,
    specifyBody: 'json',
    jsonBody: `={\n  "task_type": "content_repurposing",\n  "agent_slug": "content_creator",\n  "client_id": "{{ ${VB}.client_id }}",\n  "task_id": "{{ ${VB}.task_id }}",\n  "task_input": {{ JSON.stringify('pillar_id=' + ${VB}.pillar_id + ' type=' + ${VB}.pillar_type) }},\n  "output_summary": {{ JSON.stringify('Repurposed into ' + ((Object.keys(${AGENT}.variants || {})).length) + ' variants across ' + ((${VB}.platforms || []).length) + ' platforms') }},\n  "success": true,\n  "duration_ms": 0,\n  "cost_usd": 0,\n  "platforms": {{ JSON.stringify(${VB}.platforms) }},\n  "auto_publish": {{ ${VB}.auto_publish }}\n}`,
    options: { timeout: 30000 },
  },
  'Slack: Notify Team': {
    method: 'POST',
    url: SLACK,
    sendHeaders: false,
    sendBody: true,
    specifyBody: 'json',
    jsonBody: `={\n  "text": {{ JSON.stringify('Content Repurposed 1->' + ((Object.keys(${AGENT}.variants || {})).length) + ': Task ' + ${VB}.task_id + '. Platforms: ' + ((${VB}.platforms || []).join(', '))) }},\n  "blocks": [\n    { "type": "section", "text": { "type": "mrkdwn", "text": {{ JSON.stringify('*Content Repurposing Complete*\\nTask: ' + ${VB}.task_id + '\\nSource: ' + ${VB}.pillar_type + '\\nVariants: ' + ((Object.keys(${AGENT}.variants || {})).length) + '\\nPlatforms: ' + ((${VB}.platforms || []).join(', ')) + '\\nStatus: ' + (${VB}.auto_publish ? 'Published' : 'Queued for approval')) }} } }\n  ]\n}`,
    options: { timeout: 10000 },
  },
}

const { workflows } = await listN8nWorkflows()
const targets = workflows.filter(w => /Content Repurposing/i.test(w.name))
if (!targets.length) { console.error('No Content Repurposing workflow found.'); process.exit(1) }

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
