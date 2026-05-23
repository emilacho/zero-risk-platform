#!/usr/bin/env node
/**
 * Sprint 7 A4 + A5 · patch 2 n8n workflow bugs.
 *
 * A4 · Cost Watchdog Multi-Service v2 (Gi2wq9baSRB3jQ0L) ·
 *      "Fetch Anthropic" node hits api.anthropic.com/v1/usage which
 *      doesn't exist · replace with Supabase agent_invocations_daily_rollup
 *      MV query (sums today's total_cost_usd across all agents).
 *
 * A5 · HITL Inbox Processor (ZrMZpnLxurnJPnJH) ·
 *      "Notify Mission Control" node has no retry config · add
 *      retryOnFail:true + maxTries:3 so transient MC outages don't drop
 *      HITL notifications.
 */
import fs from 'node:fs'

const env = fs.readFileSync('../zero-risk-platform/.env.local', 'utf8')
  .split('\n').reduce((acc, l) => {
    const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m) acc[m[1]] = m[2]; return acc
  }, {})
const N8N_KEY = env.N8N_API_KEY
const SUPA_URL = env.NEXT_PUBLIC_SUPABASE_URL
const SUPA_KEY = env.SUPABASE_SERVICE_ROLE_KEY

const N8N_BASE = 'https://n8n-production-72be.up.railway.app'

const ALLOWED_SETTINGS = [
  'executionOrder', 'errorWorkflow', 'callerPolicy',
  'executionTimeout', 'saveExecutionProgress',
  'saveManualExecutions', 'saveDataErrorExecution',
  'saveDataSuccessExecution', 'timezone',
]

async function fetchWf(id) {
  const r = await fetch(`${N8N_BASE}/api/v1/workflows/${id}`, {
    headers: { 'X-N8N-API-KEY': N8N_KEY, Accept: 'application/json' },
  })
  if (!r.ok) throw new Error(`GET ${id} → ${r.status}`)
  return r.json()
}

async function putWf(id, body) {
  const r = await fetch(`${N8N_BASE}/api/v1/workflows/${id}`, {
    method: 'PUT',
    headers: { 'X-N8N-API-KEY': N8N_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const text = await r.text()
  if (!r.ok) throw new Error(`PUT ${id} → ${r.status} · ${text.slice(0, 300)}`)
  return { status: r.status }
}

function cleanSettings(settings) {
  const out = {}
  for (const k of ALLOWED_SETTINGS) if (settings?.[k] !== undefined) out[k] = settings[k]
  return out
}

async function patchCostWatchdog() {
  const id = 'Gi2wq9baSRB3jQ0L'
  const wf = await fetchWf(id)
  const node = wf.nodes.find((n) => n.name === 'Fetch Anthropic')
  if (!node) throw new Error('Cost Watchdog · Fetch Anthropic node not found')
  // Replace URL · canon Supabase rollup MV query for today's spend across all agents.
  // The downstream "Aggregate Costs" code node sums total_cost_usd from the array.
  node.parameters.url = `=${SUPA_URL}/rest/v1/agent_invocations_daily_rollup?day=eq.{{ $now.format('yyyy-MM-dd') }}&select=agent_id,model,total_cost_usd,invocations_count`
  node.parameters.method = 'GET'
  node.parameters.sendHeaders = true
  node.parameters.headerParameters = {
    parameters: [
      { name: 'apikey', value: '={{ $env.SUPABASE_SERVICE_ROLE_KEY }}' },
      { name: 'Authorization', value: '=Bearer {{ $env.SUPABASE_SERVICE_ROLE_KEY }}' },
      { name: 'Accept', value: 'application/json' },
    ],
  }
  // Strip stale Anthropic-specific params (Authorization Bearer ANTHROPIC_API_KEY etc) that may have been there.
  // Already overwritten by headerParameters above.
  const putBody = {
    name: wf.name,
    nodes: wf.nodes,
    connections: wf.connections,
    settings: cleanSettings(wf.settings),
  }
  await putWf(id, putBody)
  console.log('✔ A4 · Cost Watchdog · Fetch Anthropic URL → Supabase rollup MV')
}

async function patchHitlInbox() {
  const id = 'ZrMZpnLxurnJPnJH'
  const wf = await fetchWf(id)
  const node = wf.nodes.find((n) => n.name === 'Notify Mission Control')
  if (!node) throw new Error('HITL Inbox · Notify Mission Control node not found')
  // n8n REST PUT shape for retry fields · top-level on node object
  node.retryOnFail = true
  node.maxTries = 3
  node.waitBetweenTries = 5000 // 5 seconds backoff
  const putBody = {
    name: wf.name,
    nodes: wf.nodes,
    connections: wf.connections,
    settings: cleanSettings(wf.settings),
  }
  await putWf(id, putBody)
  console.log('✔ A5 · HITL Inbox · Notify Mission Control retry config (3 tries · 5s backoff)')
}

await patchCostWatchdog()
await patchHitlInbox()

console.log('\n[bugs] complete · verify · re-GET workflows and inspect modified node fields')
