#!/usr/bin/env node
/**
 * Surgical patcher for NEXUS 7-Phase Campaign Orchestrator workflow.
 *
 * Root cause: 3 Code nodes (Parse & Validate Request, Advance to Next Phase,
 * Handle Validation Failure) cause TIMEOUT_NO_EXEC in n8n Railway self-host
 * due to VM2 sandbox issues. Option B (from task #40): rewrite Code → HTTP.
 *
 * This patcher REPLACES the 3 Code nodes with HTTP nodes that call new
 * /api/nexus/* routes which implement the same logic server-side.
 *
 * Also: adds x-smoke-test header + x-api-key to all HTTP nodes so smoke mode
 * triggers and auth works.
 */
import { endpoints } from './lib/env.mjs'
import { fetchJson } from './lib/fetch.mjs'
import { listN8nWorkflows, fetchWorkflowDetail } from './lib/workflows.mjs'

const ep = endpoints()
const H = { 'X-N8N-API-KEY': ep.N8N_API_KEY, 'Content-Type': 'application/json', 'Accept': 'application/json' }
const DRY = process.argv.includes('--dry-run')

const BASE = "{{ $env.ZERO_RISK_API_URL || 'https://zero-risk-platform.vercel.app' }}"

// Full node-object replacements for the Code nodes.
// We preserve name/id/position from the original node so connections don't need rewriting.
const REPLACE_NODES = {
  'Parse & Validate Request': (orig) => ({
    ...orig,
    type: 'n8n-nodes-base.httpRequest',
    typeVersion: 4.2,
    parameters: {
      method: 'POST',
      url: `=${BASE}/api/nexus/parse-request`,
      sendHeaders: true,
      headerParameters: { parameters: [
        { name: 'Content-Type', value: 'application/json' },
        { name: 'x-api-key', value: '={{ $env.INTERNAL_API_KEY }}' },
      ]},
      sendBody: true,
      specifyBody: 'json',
      jsonBody: `={\n  "body": {{ JSON.stringify($json.body ?? $json) }},\n  "client_id": "{{ ($json.body && $json.body.client_id) || $json.client_id || '' }}",\n  "campaign_brief": "{{ ($json.body && $json.body.campaign_brief) || $json.campaign_brief || '' }}",\n  "priority": "{{ ($json.body && $json.body.priority) || $json.priority || 'normal' }}"\n}`,
      options: { timeout: 15000 },
    },
  }),
  'Advance to Next Phase': (orig) => ({
    ...orig,
    type: 'n8n-nodes-base.httpRequest',
    typeVersion: 4.2,
    parameters: {
      method: 'POST',
      url: `=${BASE}/api/nexus/advance-phase`,
      sendHeaders: true,
      headerParameters: { parameters: [
        { name: 'Content-Type', value: 'application/json' },
        { name: 'x-api-key', value: '={{ $env.INTERNAL_API_KEY }}' },
      ]},
      sendBody: true,
      specifyBody: 'json',
      jsonBody: `={\n  "request_id": "{{ $json.request_id || '' }}",\n  "client_id": "{{ $json.client_id || '' }}",\n  "campaign_brief": {{ JSON.stringify($json.campaign_brief ?? '') }},\n  "current_phase": "{{ $json.current_phase || 'DISCOVER' }}",\n  "current_phase_index": {{ Number($json.current_phase_index) || 0 }},\n  "phase_output": {{ JSON.stringify($('Execute Phase (jefe-marketing)').item.json.output ?? $('Execute Phase (jefe-marketing)').item.json.response ?? '') }},\n  "phase_outputs": {{ JSON.stringify($json.phase_outputs || {}) }},\n  "retry_count": {{ Number($json.retry_count) || 0 }},\n  "priority": "{{ $json.priority || 'normal' }}",\n  "started_at": "{{ $json.started_at || new Date().toISOString() }}"\n}`,
      options: { timeout: 15000 },
    },
  }),
  'Handle Validation Failure': (orig) => ({
    ...orig,
    type: 'n8n-nodes-base.httpRequest',
    typeVersion: 4.2,
    parameters: {
      method: 'POST',
      url: `=${BASE}/api/nexus/handle-failure`,
      sendHeaders: true,
      headerParameters: { parameters: [
        { name: 'Content-Type', value: 'application/json' },
        { name: 'x-api-key', value: '={{ $env.INTERNAL_API_KEY }}' },
      ]},
      sendBody: true,
      specifyBody: 'json',
      jsonBody: `={\n  "request_id": "{{ $json.request_id || '' }}",\n  "client_id": "{{ $json.client_id || '' }}",\n  "current_phase": "{{ $json.current_phase || 'UNKNOWN' }}",\n  "retry_count": {{ Number($json.retry_count) || 0 }},\n  "validation_error": {{ JSON.stringify($('Validate Phase Output (Evidence Collector)').item.json.error ?? $('Validate Phase Output (Evidence Collector)').item.json.rationale ?? 'Unknown error') }},\n  "campaign_brief": {{ JSON.stringify($json.campaign_brief ?? '') }},\n  "phases": {{ JSON.stringify($json.phases || []) }},\n  "phase_outputs": {{ JSON.stringify($json.phase_outputs || {}) }},\n  "started_at": "{{ $json.started_at || new Date().toISOString() }}"\n}`,
      options: { timeout: 15000 },
    },
  }),
  'Resolve Phase': (orig) => ({
    ...orig,
    type: 'n8n-nodes-base.httpRequest',
    typeVersion: 4.2,
    parameters: {
      method: 'POST',
      url: `=${BASE}/api/nexus/resolve-phase`,
      sendHeaders: true,
      headerParameters: { parameters: [
        { name: 'Content-Type', value: 'application/json' },
        { name: 'x-api-key', value: '={{ $env.INTERNAL_API_KEY }}' },
      ]},
      sendBody: true,
      specifyBody: 'json',
      // Simple pass-through body: $json already carries state from the
      // previous node (Initialize Pipeline State or Go Back loop).
      // NO IIFE, NO reach-backs to nodes that may not have executed — those
      // crash n8n's expression evaluator on first iteration.
      jsonBody: `={\n  "current_phase": "{{ $json.current_phase || 'DISCOVER' }}",\n  "request_id": "{{ $json.request_id || '' }}",\n  "client_id": "{{ $json.client_id || '' }}",\n  "campaign_brief": {{ JSON.stringify($json.campaign_brief || '') }},\n  "priority": "{{ $json.priority || 'normal' }}",\n  "phases": {{ JSON.stringify($json.phases || ['DISCOVER']) }},\n  "phase_outputs": {{ JSON.stringify($json.phase_outputs || {}) }},\n  "retry_count": {{ Number($json.retry_count) || 0 }}\n}`,
      options: { timeout: 15000 },
    },
  }),
}

// Also patch Execute Phase + Validate Phase + Persist State to fix param issues.
const UPDATE_PARAMETERS = {
  'Persist Phase State to DB': (params) => {
    // Original body missing client_id, uses jinja `|` pipe, uses `now()` instead
    // of $now. Rewrite the body entirely with correct syntax.
    return {
      ...params,
      method: 'POST',
      url: `=${BASE}/api/campaign-pipeline/state`,
      sendHeaders: true,
      headerParameters: { parameters: [
        { name: 'Content-Type', value: 'application/json' },
        { name: 'x-api-key', value: '={{ $env.INTERNAL_API_KEY }}' },
        { name: 'x-internal-key', value: '={{ $env.INTERNAL_API_KEY }}' },
      ]},
      sendBody: true,
      specifyBody: 'json',
      jsonBody: `={\n  "request_id": "{{ $json.request_id || '' }}",\n  "client_id": "{{ $json.client_id || '' }}",\n  "current_phase": "{{ $json.current_phase || 'DISCOVER' }}",\n  "status": "{{ $json.status || 'in_progress' }}",\n  "retry_count": {{ Number($json.retry_count) || 0 }},\n  "updated_at": "{{ new Date().toISOString() }}"\n}`,
      options: { timeout: 15000 },
    }
  },
  'Notify Mission Control (Phase Complete)': (params) => {
    return {
      ...params,
      method: 'POST',
      url: `=${BASE}/api/mc-sync`,
      sendHeaders: true,
      headerParameters: { parameters: [
        { name: 'Content-Type', value: 'application/json' },
        { name: 'x-api-key', value: '={{ $env.MC_API_TOKEN || $env.INTERNAL_API_KEY }}' },
      ]},
      sendBody: true,
      specifyBody: 'json',
      jsonBody: `={\n  "action": "phase_complete",\n  "request_id": "{{ $json.request_id || '' }}",\n  "client_id": "{{ $json.client_id || '' }}",\n  "phase": "{{ $json.current_phase || '' }}",\n  "status": "{{ $json.status || '' }}",\n  "timestamp": "{{ new Date().toISOString() }}"\n}`,
      options: { timeout: 15000, response: { response: { neverError: true } } },
    }
  },
  'Execute Phase (jefe-marketing)': (params) => {
    const existingHeaders = params.headerParameters?.parameters || []
    const hasSmokeHeader = existingHeaders.some(h => h.name === 'x-smoke-test')
    const hasApiKey = existingHeaders.some(h => h.name === 'x-api-key')
    const newHeaders = [...existingHeaders]
    if (!hasApiKey) newHeaders.push({ name: 'x-api-key', value: '={{ $env.INTERNAL_API_KEY }}' })
    if (!hasSmokeHeader) newHeaders.push({ name: 'x-smoke-test', value: `={{ ($json.client_id || "").startsWith("smoke-") ? "1" : "" }}` })
    return {
      ...params,
      headerParameters: { parameters: newHeaders },
      // Shorten timeout to avoid real Claude runs if mock fails to trigger
      options: { ...(params.options || {}), timeout: 60000 },
    }
  },
  'Validate Phase Output (Evidence Collector)': (params) => {
    const existingHeaders = params.headerParameters?.parameters || []
    const hasApiKey = existingHeaders.some(h => h.name === 'x-api-key')
    const newHeaders = [...existingHeaders]
    if (!hasApiKey) newHeaders.push({ name: 'x-api-key', value: '={{ $env.INTERNAL_API_KEY }}' })
    return {
      ...params,
      headerParameters: { parameters: newHeaders },
      options: { ...(params.options || {}), timeout: 30000 },
    }
  },
  'Initialize Pipeline State': (params) => {
    const existingHeaders = params.headerParameters?.parameters || []
    const hasApiKey = existingHeaders.some(h => h.name === 'x-api-key')
    const hasInternalKey = existingHeaders.some(h => h.name === 'x-internal-key')
    const newHeaders = [...existingHeaders]
    if (!hasApiKey && !hasInternalKey) newHeaders.push({ name: 'x-api-key', value: '={{ $env.INTERNAL_API_KEY }}' })
    return { ...params, headerParameters: { parameters: newHeaders } }
  },
  // IDEA 3: All Phases Complete? must read `status` directly from Advance to
  // Next Phase output. Reading from $json.status fails because intermediate
  // nodes (Persist, Notify MC) mutate the shape — Persist maps 'completed' via
  // STATUS_ALIASES and returns a row-shape response where `status` may differ.
  // Anchoring the condition to $('Advance to Next Phase').item.json.status
  // bypasses that corruption and routes correctly when Advance says completed.
  'All Phases Complete?': (params) => {
    const conditions = params.conditions || {}
    const options = conditions.options || {}
    options.typeValidation = 'loose'
    options.caseSensitive = false
    return {
      ...params,
      conditions: {
        ...conditions,
        options,
        conditions: [
          {
            leftValue: `={{ $('Advance to Next Phase').item.json.status }}`,
            rightValue: 'completed',
            operator: { type: 'string', operation: 'equals' },
          },
        ],
        combinator: 'and',
      },
    }
  },
}

const { workflows } = await listN8nWorkflows()
const targets = workflows.filter(w => /NEXUS 7-Phase/i.test(w.name))
if (!targets.length) { console.error('No NEXUS workflow found.'); process.exit(1) }

for (const w of targets) {
  console.log(`\n=== ${w.name} (${w.id})`)
  const detail = await fetchWorkflowDetail(w.id)
  if (!detail.ok || !detail.json?.nodes) { console.error(`   ✗ fetch failed: ${detail.status}`); continue }
  const wf = detail.json
  let changed = 0

  // Replace Code nodes with HTTP nodes
  wf.nodes = wf.nodes.map(node => {
    const replacer = REPLACE_NODES[node.name]
    if (replacer) {
      console.log(`   REPLACED: ${node.name} (Code → HTTP)`)
      changed++
      return replacer(node)
    }
    const updater = UPDATE_PARAMETERS[node.name]
    if (updater) {
      const before = JSON.stringify(node.parameters)
      node.parameters = updater(node.parameters || {})
      if (JSON.stringify(node.parameters) !== before) {
        console.log(`   updated params: ${node.name}`)
        changed++
      }
    }
    return node
  })

  const missing = []
  for (const name of Object.keys(REPLACE_NODES)) {
    if (!wf.nodes.some(n => n.name === name)) missing.push(name)
  }
  if (missing.length) console.log('   ⚠ missing nodes:', missing)

  if (!changed) { console.log('   (no changes)'); continue }
  if (DRY) { console.log(`   [DRY] would PUT ${changed} changes`); continue }

  const put = await fetchJson(ep.n8n + '/api/v1/workflows/' + w.id, {
    method: 'PUT', headers: H,
    body: JSON.stringify({
      name: wf.name, nodes: wf.nodes, connections: wf.connections,
      settings: wf.settings || { executionOrder: 'v1' },
    }),
  })
  if (put.ok) {
    console.log(`   ✓ PUT 200 — ${changed} changes applied`)
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
