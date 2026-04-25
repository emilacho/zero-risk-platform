#!/usr/bin/env node
/**
 * Surgical patcher for the Landing Page A/B Deployer workflow.
 * Redirects Vercel and PostHog calls to internal stubs so smoke runs are
 * cost-free and don't require external credentials.
 *
 * Idempotent — safe to re-run. Only writes if changes are detected.
 *
 * Usage:
 *   node scripts/smoke-test/patch-wf-vercel-stub.mjs
 *   node scripts/smoke-test/patch-wf-vercel-stub.mjs --dry-run
 */
import { endpoints } from './lib/env.mjs'
import { fetchJson } from './lib/fetch.mjs'
import { listN8nWorkflows, fetchWorkflowDetail } from './lib/workflows.mjs'

const ep = endpoints()
const H = { 'X-N8N-API-KEY': ep.N8N_API_KEY, 'Content-Type': 'application/json', 'Accept': 'application/json' }
const DRY = process.argv.includes('--dry-run')

// Stub URLs — override with env vars in n8n to bypass stubs in production.
// VERCEL_DEPLOY_URL  → full deployment endpoint (real: https://api.vercel.com/v13/deployments)
// POSTHOG_EXPERIMENTS_URL → full experiments endpoint (real: https://us.i.posthog.com/api/experiments)
const VERCEL  = `={{ $env.VERCEL_DEPLOY_URL || 'https://zero-risk-platform.vercel.app/api/stubs/vercel/deployments' }}`
const POSTHOG = `={{ $env.POSTHOG_EXPERIMENTS_URL || 'https://zero-risk-platform.vercel.app/api/stubs/posthog/experiments' }}`
const SLACK   = `={{ $env.SLACK_WEBHOOK_URL || 'https://zero-risk-platform.vercel.app/api/stubs/slack-webhook' }}`

// Node ref helpers — use display-name syntax to avoid broken $node['id'] refs
const VB      = `$('Code: Validate Brief').item.json`
const VARA    = `$('Vercel: Deploy Variant A').item.json`
const VARB    = `$('Vercel: Deploy Variant B').item.json`

// FIXED_PARAMS: keys are node display names. Only specified fields are overwritten;
// all other parameters are preserved from the existing workflow definition.
const FIXED_PARAMS = {
  // Fix: replace real Vercel API with stub fallback
  'Vercel: Deploy Variant A': {
    url: VERCEL,
  },
  'Vercel: Deploy Variant B': {
    url: VERCEL,
  },

  // Fix: replace real PostHog API with stub fallback
  'PostHog: Create Experiment': {
    url: POSTHOG,
  },

  // Fix: add stub fallback for Slack (currently has no fallback → empty URL if env not set).
  // Cross-branch refs (VARB from Variant A path) cause n8n_node_not_executed.
  // Use only $json (PostHog output) + VB for safe single-path access.
  'Slack: Notify Deployment': {
    url: SLACK,
    sendBody: true,
    specifyBody: 'json',
    jsonBody: `={\n  "text": "🔄 A/B Test Deployed: {{ ${VB}.task_id }} | client={{ ${VB}.client_id }} | experiment={{ $json.id }} | flag={{ $json.feature_flag_key }}"\n}`,
    options: { timeout: 10000 },
  },

  // Store: only reference data reachable in current execution path.
  // Cross-branch refs ($('Vercel: Deploy Variant B') from Variant A path) cause
  // n8n_node_not_executed. Use $json (PostHog output) + VB for safe access.
  'Store: Experiment Metadata': {
    sendBody: true,
    specifyBody: 'json',
    jsonBody: `={\n  "client_id": "{{ ${VB}.client_id }}",\n  "experiment_id": "{{ ${VB}.task_id }}",\n  "posthog_flag_key": "ab_test_{{ ${VB}.task_id }}",\n  "posthog_experiment_id": "{{ $json.id }}",\n  "traffic_split": {{ JSON.stringify(${VB}.traffic_split || 50) }},\n  "kpi": "{{ ${VB}.kpi || 'conversion' }}",\n  "task_id": "{{ ${VB}.task_id }}"\n}`,
    options: { timeout: 30000 },
  },
}

const { workflows } = await listN8nWorkflows()
const targets = workflows.filter(w => /Landing Page A\/B Deployer/i.test(w.name))
if (!targets.length) {
  console.error('No "Landing Page A/B Deployer" workflow found in n8n.')
  process.exit(1)
}

for (const w of targets) {
  console.log(`\n=== ${w.name} (${w.id})`)
  const detail = await fetchWorkflowDetail(w.id)
  if (!detail.ok || !detail.json?.nodes) {
    console.error(`   ✗ fetch failed: ${detail.status}`)
    continue
  }
  const wf = detail.json
  let changed = 0
  const missing = []

  const CLEAR_ON_REWRITE = ['formData', 'bodyParameters', 'queryParameters', 'authentication']

  for (const node of wf.nodes) {
    const fix = FIXED_PARAMS[node.name]
    if (!fix) continue
    const before = JSON.stringify(node.parameters)
    const baseParams = { ...(node.parameters || {}) }
    for (const key of CLEAR_ON_REWRITE) delete baseParams[key]
    node.parameters = { ...baseParams, ...fix }
    if (JSON.stringify(node.parameters) !== before) {
      changed++
      console.log(`   rewrote: ${node.name}`)
    } else {
      console.log(`   (unchanged): ${node.name}`)
    }
  }

  for (const name of Object.keys(FIXED_PARAMS)) {
    if (!wf.nodes.some(n => n.name === name)) missing.push(name)
  }
  if (missing.length) console.log('   ⚠ missing nodes (skipped):', missing.join(', '))

  if (!changed) {
    console.log('   (no changes needed)')
    continue
  }
  if (DRY) {
    console.log(`   [DRY] would PUT ${changed} node rewrites`)
    continue
  }

  const put = await fetchJson(ep.n8n + '/api/v1/workflows/' + w.id, {
    method: 'PUT', headers: H,
    body: JSON.stringify({
      name: wf.name, nodes: wf.nodes, connections: wf.connections,
      settings: wf.settings || { executionOrder: 'v1' },
      staticData: wf.staticData || null,
    }),
  })

  if (put.ok) {
    console.log(`   ✓ PUT 200 — ${changed} nodes patched`)
    if (w.active) {
      await fetchJson(ep.n8n + '/api/v1/workflows/' + w.id + '/deactivate', { method: 'POST', headers: H, body: '{}' })
      await new Promise(r => setTimeout(r, 800))
      await fetchJson(ep.n8n + '/api/v1/workflows/' + w.id + '/activate', { method: 'POST', headers: H, body: '{}' })
      console.log(`   ✓ reactivated`)
    }
  } else {
    console.log(`   ✗ PUT ${put.status}: ${(put.text || put.error || '').slice(0, 400)}`)
  }
}

console.log('\nDone.')
