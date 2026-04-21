#!/usr/bin/env node
/**
 * Surgical patcher for the UptimeRobot Webhook Handler workflow.
 *
 * Bugs fixed:
 *  - Parse Alert accepts both camelCase (UptimeRobot real payloads) AND
 *    snake_case (smoke test fixture uses alertType / monitorFriendlyName).
 *  - Slack webhook URL falls back to our stub when $env.SLACK_WEBHOOK_URL
 *    is unset (was producing "undefined" → invalid URL).
 *  - `downtime_seconds` coerced to a Number in the incident body so the JSON
 *    stays valid when the field is missing from the alert.
 *
 * Idempotent, safe to re-run.
 */
import { endpoints } from './lib/env.mjs'
import { fetchJson } from './lib/fetch.mjs'
import { listN8nWorkflows, fetchWorkflowDetail } from './lib/workflows.mjs'

const ep = endpoints()
const H = { 'X-N8N-API-KEY': ep.N8N_API_KEY, 'Content-Type': 'application/json', 'Accept': 'application/json' }
const DRY = process.argv.includes('--dry-run')

const BASE = "{{ $env.ZERO_RISK_API_URL || 'https://zero-risk-platform.vercel.app' }}"
const SLACK = `={{ $env.SLACK_WEBHOOK_URL || 'https://zero-risk-platform.vercel.app/api/stubs/slack-webhook' }}`

const PARSE_ALERT_JS = `// Parse UptimeRobot alert and extract service name + status.
// Accepts both snake_case (real UptimeRobot webhook) and camelCase (smoke fixture).
const payload = $input.first().json;
const body = payload.body || payload;
const statusRaw = body.alert_type_id ?? body.alertType ?? body.alert_type;
const status = typeof statusRaw === 'number' ? statusRaw : Number(statusRaw) || 0;
const monitorName = body.monitor_friendly_name || body.monitorFriendlyName || body.monitorName || 'Unknown';
const monitorUrl = body.monitor_url || body.monitorURL || body.url || '';
const downtimeSeconds = Number(
  (body.alert_details && body.alert_details.downtime_seconds) ||
  body.alert_duration || body.alertDuration || body.downtime_seconds || 0
) || 0;
const timestamp = new Date().toISOString();

let serviceType = 'unknown';
let slackChannel = '#ops-alerts';

if (monitorName.includes('Vercel') || monitorName.includes('Platform')) {
  serviceType = 'Zero Risk Platform (Vercel)';
  slackChannel = '#ops-critical';
} else if (monitorName.includes('Mission Control') || monitorName.includes('Railway')) {
  serviceType = 'Mission Control (Railway)';
  slackChannel = '#ops-critical';
} else if (monitorName.toLowerCase().includes('n8n')) {
  serviceType = 'n8n';
  slackChannel = '#ops-alerts';
} else if (monitorName.includes('Supabase')) {
  serviceType = 'Supabase (DB)';
  slackChannel = '#ops-critical';
} else if (monitorName.startsWith('smoke-')) {
  serviceType = 'smoke-test';
  slackChannel = '#ops-smoke';
}

// UptimeRobot: 1 = down, 2 = up
const isDown = status === 1;
const emoji = isDown ? 'DOWN' : 'UP';

return [{
  json: {
    monitor_name: monitorName,
    service_type: serviceType,
    monitor_url: monitorUrl,
    is_down: isDown,
    status_emoji: emoji,
    slack_channel: slackChannel,
    timestamp,
    downtime_seconds: downtimeSeconds,
    raw_payload: body
  }
}];`

const FIXED_PARAMS = {
  'Parse Alert': { jsCode: PARSE_ALERT_JS },
  'DOWN: Alert Slack': {
    method: 'POST',
    url: SLACK,
    sendHeaders: true,
    headerParameters: { parameters: [
      { name: 'Content-Type', value: 'application/json' },
    ]},
    sendBody: true,
    specifyBody: 'json',
    jsonBody: `={\n  "channel": "{{ $json.slack_channel }}",\n  "text": {{ JSON.stringify($json.status_emoji + ' ' + $json.service_type) }},\n  "blocks": [\n    {\n      "type": "section",\n      "text": { "type": "mrkdwn", "text": {{ JSON.stringify('*' + $json.service_type + ' DOWN*\\n_' + $json.monitor_name + '_\\nDetected: ' + $json.timestamp) }} }\n    },\n    {\n      "type": "actions",\n      "elements": [\n        { "type": "button", "text": { "type": "plain_text", "text": "View Monitor" }, "url": {{ JSON.stringify($json.monitor_url || 'https://example.com') }} }\n      ]\n    }\n  ]\n}`,
    options: { timeout: 10000 },
  },
  'DOWN: Create MC Task': {
    method: 'POST',
    url: `=${BASE}/api/mc-sync`,
    sendHeaders: true,
    headerParameters: { parameters: [
      { name: 'Content-Type', value: 'application/json' },
      { name: 'x-api-key', value: '={{ $env.INTERNAL_API_KEY }}' },
    ]},
    sendBody: true,
    specifyBody: 'json',
    jsonBody: `={\n  "action": "create_task",\n  "task": {\n    "title": {{ JSON.stringify('INCIDENT: ' + $json.service_type + ' DOWN') }},\n    "description": {{ JSON.stringify('Service detected DOWN at ' + $json.timestamp + '. Monitor: ' + $json.monitor_name + '. Check UptimeRobot and service status page.') }},\n    "assignee": "Emilio",\n    "priority": "critical",\n    "tags": ["uptime", "incident", "auto-created"]\n  },\n  "monitor_name": {{ JSON.stringify($json.monitor_name) }},\n  "service_type": {{ JSON.stringify($json.service_type) }},\n  "is_down": {{ $json.is_down }},\n  "downtime_seconds": {{ Number($json.downtime_seconds) || 0 }},\n  "timestamp": "{{ $json.timestamp }}"\n}`,
    options: { timeout: 30000 },
  },
  'UP: Notify Slack': {
    method: 'POST',
    url: SLACK,
    sendHeaders: true,
    headerParameters: { parameters: [
      { name: 'Content-Type', value: 'application/json' },
    ]},
    sendBody: true,
    specifyBody: 'json',
    jsonBody: `={\n  "channel": "{{ $json.slack_channel }}",\n  "text": {{ JSON.stringify($json.status_emoji + ' ' + $json.service_type + ' RECOVERED') }},\n  "blocks": [\n    {\n      "type": "section",\n      "text": { "type": "mrkdwn", "text": {{ JSON.stringify('*' + $json.service_type + ' UP*\\n_Recovered at ' + $json.timestamp + '_\\nDowntime: ' + Math.floor((Number($json.downtime_seconds) || 0) / 60) + ' minutes') }} }\n    }\n  ],\n  "monitor_name": {{ JSON.stringify($json.monitor_name) }},\n  "is_down": {{ $json.is_down }},\n  "downtime_seconds": {{ Number($json.downtime_seconds) || 0 }},\n  "timestamp": "{{ $json.timestamp }}"\n}`,
    options: { timeout: 10000 },
  },
  'Log to uptime_incidents': {
    method: 'POST',
    url: `=${BASE}/api/uptime-incidents`,
    sendHeaders: true,
    headerParameters: { parameters: [
      { name: 'Content-Type', value: 'application/json' },
      { name: 'x-api-key', value: '={{ $env.INTERNAL_API_KEY }}' },
    ]},
    sendBody: true,
    specifyBody: 'json',
    jsonBody: `={\n  "service_type": {{ JSON.stringify($('Parse Alert').item.json.service_type) }},\n  "monitor_name": {{ JSON.stringify($('Parse Alert').item.json.monitor_name) }},\n  "monitor_url": {{ JSON.stringify($('Parse Alert').item.json.monitor_url) }},\n  "status": {{ JSON.stringify($('Parse Alert').item.json.is_down ? 'down' : 'recovered') }},\n  "is_down": {{ $('Parse Alert').item.json.is_down }},\n  "incident_timestamp": {{ JSON.stringify($('Parse Alert').item.json.timestamp) }},\n  "downtime_seconds": {{ Number($('Parse Alert').item.json.downtime_seconds) || 0 }},\n  "detected_at": {{ JSON.stringify($('Parse Alert').item.json.timestamp) }},\n  "alert_type": {{ $('Parse Alert').item.json.is_down ? 1 : 2 }}\n}`,
    options: { timeout: 30000 },
  },
}

const { workflows } = await listN8nWorkflows()
const targets = workflows.filter(w => /UptimeRobot/i.test(w.name))
if (!targets.length) {
  console.error('No UptimeRobot workflow found.')
  process.exit(1)
}

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
