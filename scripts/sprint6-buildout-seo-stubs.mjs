#!/usr/bin/env node
/**
 * scripts/sprint6-buildout-seo-stubs.mjs · Sprint 6 Track B3 · CC#2
 *
 * BUILD OUT minimum viable workflows for ·
 *   - 8gId · SEO Backlink Opportunity Scanner Weekly
 *   - 9UYo · SEO Topical Authority Builder Monthly
 *
 * Both stubs are currently 2 nodes (trigger + Initialize · no actual work).
 * This script writes them out to 5 nodes each ·
 *   1. ScheduleTrigger (cron, fixed shape)
 *   2. Load Active Clients (Code → fetch /api/clients)
 *   3. Split Into Each Client (splitOut · fieldToSplitOut=clients)
 *   4. Invoke <SEO agent> (httpRequest → POST /api/agents/run with x-api-key)
 *   5. Persist Deliverable (httpRequest → POST /api/seo-deliverables · x-api-key)
 *
 * Uses SEO sub-agents activated in PR #65 ·
 *   - 8gId → seo-backlink-strategist
 *   - 9UYo → seo-content-strategist
 *
 * Cascade canon compliant · NO agent invocations in Vercel routes · just
 * HTTP fan-out from n8n.
 */
import fs from 'node:fs'
import path from 'node:path'

const env = fs
  .readFileSync(path.resolve('.env.local'), 'utf8')
  .split('\n')
  .reduce((acc, l) => {
    const m = l.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m) acc[m[1]] = m[2].replace(/^"|"$/g, '')
    return acc
  }, {})

const N8N_BASE = env.N8N_BASE_URL || 'https://n8n-production-72be.up.railway.app'
const N8N_KEY = env.N8N_API_KEY
if (!N8N_KEY) { console.error('FAIL · missing N8N_API_KEY'); process.exit(2) }

const headers = { 'X-N8N-API-KEY': N8N_KEY, 'Content-Type': 'application/json' }

const TARGETS = [
  {
    id: '8gIdl3jzDZpHLyyq',
    agent: 'seo-backlink-strategist',
    cron: '0 6 * * 1', // Mondays 6am UTC
    triggerName: 'Trigger: Mondays 6am UTC',
    deliverableType: 'backlink-opportunities',
  },
  {
    id: '9UYoXtIqFvOaNel0',
    agent: 'seo-content-strategist',
    cron: '0 3 1 * *', // 1st of month 3am UTC
    triggerName: 'Trigger: 1st of month 3am UTC',
    deliverableType: 'topical-authority',
  },
]

function buildNodes(t) {
  return [
    {
      parameters: {
        rule: { interval: [{ field: 'cronExpression', expression: t.cron }] },
      },
      id: 'trigger-' + t.id.slice(0, 6),
      name: t.triggerName,
      type: 'n8n-nodes-base.scheduleTrigger',
      typeVersion: 1.2,
      position: [240, 300],
    },
    {
      parameters: {
        jsCode:
          "const resp = await fetch('https://zero-risk-platform.vercel.app/api/clients?active=true', { headers: { 'x-api-key': 'key' } });\nconst data = await resp.json();\nreturn [{ json: { clients: Array.isArray(data) ? data : (data.clients ?? data.rows ?? []) } }];",
      },
      id: 'load-clients-' + t.id.slice(0, 6),
      name: 'Load Active Clients',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [460, 300],
    },
    {
      parameters: { fieldToSplitOut: 'clients' },
      id: 'split-' + t.id.slice(0, 6),
      name: 'Split Into Each Client',
      type: 'n8n-nodes-base.splitOut',
      typeVersion: 1,
      position: [680, 300],
    },
    {
      parameters: {
        method: 'POST',
        url: '={{ $env.ZERO_RISK_API_URL || "https://zero-risk-platform.vercel.app" }}/api/agents/run',
        sendHeaders: true,
        headerParameters: {
          parameters: [
            { name: 'x-api-key', value: '={{ $env.INTERNAL_API_KEY }}' },
            { name: 'Content-Type', value: 'application/json' },
          ],
        },
        sendBody: true,
        specifyBody: 'json',
        jsonBody:
          '={{ JSON.stringify({\n  agent_name: "' +
          t.agent +
          '",\n  client_id: $json.client_id || $json.id || null,\n  task_input: {\n    client_id: $json.client_id || $json.id,\n    client_name: $json.client_name || $json.name,\n    vertical: $json.vertical || $json.industry,\n    domain: $json.domain || null,\n    target_keyword: $json.target_keyword || null,\n    locale: $json.locale || { country: "US", language: "en" },\n    cron_run_at: new Date().toISOString()\n  }\n}) }}',
        options: { timeout: 120000 },
      },
      id: 'invoke-' + t.id.slice(0, 6),
      name: 'Invoke ' + t.agent,
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [900, 300],
    },
    {
      parameters: {
        method: 'POST',
        url: '={{ $env.ZERO_RISK_API_URL || "https://zero-risk-platform.vercel.app" }}/api/cascade/persist-outputs',
        sendHeaders: true,
        headerParameters: {
          parameters: [
            { name: 'x-api-key', value: '={{ $env.INTERNAL_API_KEY }}' },
            { name: 'Content-Type', value: 'application/json' },
          ],
        },
        sendBody: true,
        specifyBody: 'json',
        jsonBody:
          '={{ JSON.stringify({\n  client_id: ($node["Split Into Each Client"].json.client_id || $node["Split Into Each Client"].json.id),\n  slug: ($node["Split Into Each Client"].json.slug || $node["Split Into Each Client"].json.client_id || "unknown"),\n  version: "' +
          t.deliverableType +
          '-" + new Date().toISOString().slice(0, 10),\n  task_id: "' +
          t.deliverableType +
          '-cron-" + Date.now(),\n  outputs: {\n    "' +
          t.agent +
          '": $json\n  }\n}) }}',
        options: { timeout: 30000 },
      },
      id: 'persist-' + t.id.slice(0, 6),
      name: 'Persist Deliverable',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [1120, 300],
      continueOnFail: true,
    },
  ]
}

function buildConnections(t) {
  return {
    [t.triggerName]: {
      main: [[{ node: 'Load Active Clients', type: 'main', index: 0 }]],
    },
    'Load Active Clients': {
      main: [[{ node: 'Split Into Each Client', type: 'main', index: 0 }]],
    },
    'Split Into Each Client': {
      main: [[{ node: 'Invoke ' + t.agent, type: 'main', index: 0 }]],
    },
    ['Invoke ' + t.agent]: {
      main: [[{ node: 'Persist Deliverable', type: 'main', index: 0 }]],
    },
  }
}

for (const t of TARGETS) {
  console.log(`\n=== Build out ${t.id} (agent: ${t.agent}) ===`)
  const getRes = await fetch(`${N8N_BASE}/api/v1/workflows/${t.id}`, { headers })
  if (!getRes.ok) {
    console.error(`  FAIL get · ${getRes.status}`)
    continue
  }
  const detail = await getRes.json()

  const nodes = buildNodes(t)
  const connections = buildConnections(t)

  const putRes = await fetch(`${N8N_BASE}/api/v1/workflows/${t.id}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({
      name: detail.name,
      nodes,
      connections,
      settings: detail.settings ?? {},
    }),
  })
  if (!putRes.ok) {
    console.error(`  PUT FAIL · ${putRes.status} · ${(await putRes.text()).slice(0, 400)}`)
    continue
  }
  console.log(`  PUT OK · ${nodes.length} nodes · status ${putRes.status}`)

  const actRes = await fetch(`${N8N_BASE}/api/v1/workflows/${t.id}/activate`, {
    method: 'POST',
    headers,
  })
  if (actRes.ok) {
    console.log(`  ACTIVATE OK · status ${actRes.status}`)
  } else {
    console.error(`  ACTIVATE FAIL · ${actRes.status} · ${(await actRes.text()).slice(0, 300)}`)
  }
}

const verify = await fetch(`${N8N_BASE}/api/v1/workflows?limit=250&active=true`, { headers })
console.log(`\n--- final active count: ${(await verify.json()).data.length} ---`)
