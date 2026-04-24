// Workflow inventory + single-workflow smoke tester.
// Strategy: fire webhook (if workflow is webhook-triggered), poll n8n executions
// API until the execution finishes (or timeout), return normalized diagnostic.

import { readdirSync } from 'fs'
import { resolve, dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { readFileSync } from 'fs'
import { fetchJson } from './fetch.mjs'
import { endpoints } from './env.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PROPOSED = resolve(__dirname, '..', '..', '..', 'n8n-workflows', 'proposed-sesion27b')

// Cheap-to-call default payloads for each known workflow name pattern.
// Fixtures were inferred from the Validate Input Code nodes of each workflow.
const DEFAULT_PAYLOAD = {
  // Cluster 1 — Orchestration
  'NEXUS': { client_id: 'smoke-test', campaign_brief: 'smoke test run', priority: 'normal' },
  'RUFLO': { client_id: 'smoke-test', request: 'analyze', context_type: 'general' },
  'Phase Gate': {
    request_id: 'smoke-' + Date.now(),
    phase_name: 'DISCOVER',
    phase_output: JSON.stringify({ market_opportunity: 'smoke', competitive_landscape: 'smoke', client_objectives: 'smoke' }),
    success_criteria: ['market_opportunity', 'competitive_landscape', 'client_objectives'],
    client_id: 'smoke-test',
  },
  'Agent Outcomes Writer': { agent_slug: 'smoke-test-agent', task_id: 'smoke-' + Date.now(), input_text: 'smoke', output_text: 'smoke', tokens_used: 0, latency_ms: 10, success: true, error: null },
  'HITL Inbox': { action: 'process_pending' },

  // Cluster 2 — Creative
  'Video Pipeline': { client_id: 'smoke-test', video_brief: 'smoke test video brief 30s', duration_s: 30 },
  'RSA': { client_id: 'smoke-test', campaign_brief: 'smoke test SEM campaign', target_keywords: ['smoke'] },
  'Landing Page A/B': { client_id: 'smoke-test', variant_a_code: '<div>A</div>', variant_b_code: '<div>B</div>', url: 'https://example.com/smoke' },
  'Content Repurposing': { client_id: 'smoke-test', pillar_id: 'smoke-pillar', pillar_type: 'blog_post', task_id: 'smoke-crp-' + Date.now(), platforms: ['linkedin', 'twitter', 'instagram'], content_url: 'https://example.com/pillar', auto_publish: false, source_content: 'smoke test content' },
  'Creative Fatigue': { client_id: 'smoke-test' },
  'Ad Creative': { client_id: 'smoke-test', audit_id: 'smoke-audit-' + Date.now(), campaign_id: 'smoke-campaign-001', creative_id: 'smoke-creative', landing_url: 'https://example.com', change_type: 'new_launch' },

  // Cluster 3 — SEO/GEO
  'SEO Rank-to-#1': { client_id: 'smoke-test', target_keyword: 'smoke', url: 'https://example.com' },
  'IndexNow': { client_id: 'smoke-test', urls: ['https://example.com'], host: 'example.com' },
  'SEO': { client_id: 'smoke-test', url: 'https://example.com' },
  'GEO': { client_id: 'smoke-test', url: 'https://example.com' },

  // Cluster 4 — Paid
  'Meta Ads': { client_id: 'smoke-test', ad_account_id: 'smoke-acct' },
  'Google Ads': { client_id: 'smoke-test', customer_id: 'smoke-acct' },
  'TikTok': { client_id: 'smoke-test' },
  'Attribution': { client_id: 'smoke-test' },
  'Incrementality': { client_id: 'smoke-test', test_id: 'smoke-test-001' },

  // Cluster 5 — Email/Community/Social
  'Email Lifecycle': { event_type: 'contact_created', client_id: 'smoke-test', contact_id: 'smoke-contact-001', contact_email: 'smoke@example.com' },
  'Subject Line': { client_id: 'smoke-test', subject_a: 'Subject A smoke', subject_b: 'Subject B smoke', segment_size: 100 },
  'Review Severity': { client_id: 'smoke-test', review_text: 'smoke test review', platform: 'google', rating: 3, review_id: 'smoke-review-001' },
  'Influencer Authenticity': { client_id: 'smoke-test', influencer_handle: '@smokeinfluencer', platform: 'instagram' },
  'Social Multi-Platform': { client_id: 'smoke-test', posts: [] },
  'Community Health': { client_id: 'smoke-test' },

  // Cluster 6 — Client Success
  'Client Onboarding': { client_id: 'smoke-client-' + Date.now(), client_name: 'Smoke Test Co', website: 'https://example.com', domain: 'example.com', industry: 'technology', contract_scope: ['paid_ads', 'email'], deal_value: 0, deal_id: 'smoke-deal-001', primary_contact_id: 'smoke-contact-001' },
  // Legacy "Onboarding New Client" workflow: Code node validates name/website/industry
  'Onboarding New Client': { client_id: 'smoke-client-new-' + Date.now(), name: 'Smoke Test Co', website: 'https://example.com', domain: 'example.com', industry: 'technology', email: 'smoke@example.com' },
  'Churn Prediction': { client_id: 'smoke-test' },
  'NPS': { client_id: 'smoke-test' },
  'QBR': { client_id: 'smoke-test', quarter: 'Q1-2026' },
  'Expansion Readiness': { client_id: 'smoke-test' },
  'Weekly Client Report': { client_id: 'smoke-test' },
  'RFM Segmentation': { client_id: 'smoke-test' },
  'Account Health': { client_id: 'smoke-test' },

  // Cluster 7 — Ops/Monitoring
  'Sentry Alert': { action: 'created', data: { issue: { title: 'smoke test alert', level: 'info', environment: 'smoke-test', url: 'https://sentry.io/smoke' } } },
  'UptimeRobot': { monitorURL: 'https://example.com', alertType: 1, alertDetails: 'smoke test', monitorFriendlyName: 'smoke-monitor' },
  'Cost Watchdog': {},
  'Healthchecks': {},
  'Supabase Weekly Backup': {},

  // default
  'default': { client_id: 'smoke-test', test_run: true },
}

function pickPayload(workflowName) {
  for (const k of Object.keys(DEFAULT_PAYLOAD)) {
    if (k === 'default') continue
    if (workflowName.includes(k)) return DEFAULT_PAYLOAD[k]
  }
  return DEFAULT_PAYLOAD.default
}

// Fetch n8n workflow list + identify webhook paths.
// Each entry: { id, name, active, webhook_paths: [...] }
export async function listN8nWorkflows() {
  const ep = endpoints()
  if (!ep.N8N_API_KEY) {
    return { error: 'N8N_API_KEY not set in .env.local', workflows: [] }
  }
  const res = await fetchJson(ep.n8n + '/api/v1/workflows?limit=100', {
    headers: { 'X-N8N-API-KEY': ep.N8N_API_KEY },
  })
  if (!res.ok) return { error: `n8n list failed: ${res.status}`, workflows: [] }
  const wfs = res.json?.data || []
  // We can't cheaply extract webhook paths without full fetch per workflow.
  // Return names + ids; tester fetches single workflow when needed.
  return {
    workflows: wfs.map(w => ({ id: w.id, name: w.name, active: w.active })),
  }
}

export async function fetchWorkflowDetail(id, { retries = 3 } = {}) {
  const ep = endpoints()
  let lastRes = null
  for (let i = 0; i < retries; i++) {
    const res = await fetchJson(ep.n8n + '/api/v1/workflows/' + id, {
      headers: { 'X-N8N-API-KEY': ep.N8N_API_KEY },
      timeoutMs: 30000,
    })
    lastRes = res
    if (res.ok) return res
    // Back off on transient errors (status 0 = dropped, 429 = rate limit, 502/503/504 = transient)
    const backoff = 500 + i * 1500 + Math.random() * 500
    await new Promise(r => setTimeout(r, backoff))
  }
  return lastRes
}

// Find the webhook trigger node's `path` (if any) within a workflow definition.
export function findWebhookPath(wf) {
  const nodes = wf?.nodes || []
  for (const n of nodes) {
    if (n.type === 'n8n-nodes-base.webhook') {
      return {
        path: n.parameters?.path || null,
        method: (n.parameters?.httpMethod || 'POST').toUpperCase(),
      }
    }
  }
  return null
}

// Test a single workflow. If the workflow has a webhook trigger, fire it;
// otherwise skip with "NO_WEBHOOK" status (cron-only workflows).
export async function testWorkflow(entry, { pollMs = 3000, maxWaitMs = 60000 } = {}) {
  const ep = endpoints()
  const t0 = Date.now()
  const detail = await fetchWorkflowDetail(entry.id)
  if (!detail.ok) {
    return {
      type: 'workflow', name: entry.name, id: entry.id,
      status: 'FAIL', error: `fetch_detail: ${detail.status}`,
      duration_ms: Date.now() - t0,
    }
  }
  const wf = detail.json
  const wh = findWebhookPath(wf)
  if (!wh) {
    return {
      type: 'workflow', name: entry.name, id: entry.id,
      status: 'SKIP_NO_WEBHOOK', duration_ms: Date.now() - t0,
      note: 'cron or manual trigger — cannot smoke-test via webhook',
    }
  }
  if (!entry.active) {
    return {
      type: 'workflow', name: entry.name, id: entry.id,
      status: 'SKIP_INACTIVE', duration_ms: Date.now() - t0,
      note: 'workflow deactivated — activate before testing',
    }
  }
  // Fire webhook. Cap at 60s — workflows that take longer will be polled via the
  // executions API instead (cheaper than holding a webhook connection open).
  // Long-running multi-Claude workflows = too expensive in smoke test context.
  const payload = pickPayload(entry.name)
  const fireRes = await fetchJson(ep.n8n + '/webhook/' + wh.path, {
    method: wh.method,
    // x-smoke-test tells /api/agents/run to return mock responses (zero cost).
    // Workflows' HTTP nodes don't natively forward this header, BUT our default
    // fixtures prefix client_id with "smoke-" which is also detected as smoke mode.
    headers: { 'Content-Type': 'application/json', 'x-smoke-test': '1' },
    body: JSON.stringify(payload),
    timeoutMs: 60000,
  })
  if (!fireRes.ok) {
    const detail = fireRes.text
      || (fireRes.json ? JSON.stringify(fireRes.json).slice(0, 600) : '')
      || fireRes.error
      || `status ${fireRes.status}`
    return {
      type: 'workflow', name: entry.name, id: entry.id,
      status: 'FAIL', http_status: fireRes.status,
      error: `webhook_fire[${fireRes.status}]: ${detail}`,
      duration_ms: Date.now() - t0,
    }
  }
  // Poll executions until finished or timeout
  const deadline = t0 + maxWaitMs
  let exec = null
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, pollMs))
    const execList = await fetchJson(
      ep.n8n + '/api/v1/executions?workflowId=' + entry.id + '&limit=1',
      { headers: { 'X-N8N-API-KEY': ep.N8N_API_KEY } }
    )
    const latest = execList.json?.data?.[0]
    if (!latest) continue
    // Only care about execs started at/after our webhook fire.
    if (new Date(latest.startedAt).getTime() < t0) continue
    exec = latest
    if (exec.finished || exec.status === 'error' || exec.status === 'crashed' || exec.status === 'success') break
  }
  if (!exec) {
    return {
      type: 'workflow', name: entry.name, id: entry.id,
      status: 'TIMEOUT_NO_EXEC', duration_ms: Date.now() - t0,
      note: 'webhook returned 200 but no execution appeared — container stuck or queue backlog',
    }
  }
  // Pull full detail to analyze nodes
  const execDetail = await fetchJson(
    ep.n8n + '/api/v1/executions/' + exec.id + '?includeData=true',
    { headers: { 'X-N8N-API-KEY': ep.N8N_API_KEY } }
  )
  const runData = execDetail.json?.data?.resultData?.runData || {}
  const nodesRan = Object.keys(runData)
  const errs = {}
  for (const n of nodesRan) {
    const arr = runData[n]
    if (arr?.[0]?.error) {
      errs[n] = {
        message: arr[0].error.message?.slice(0, 120),
        description: (arr[0].error.description || '').slice(0, 120),
      }
    }
  }
  const topErr = execDetail.json?.data?.resultData?.error?.message
  const ok = exec.status === 'success' && Object.keys(errs).length === 0
  return {
    type: 'workflow', name: entry.name, id: entry.id,
    status: ok ? 'PASS' : 'FAIL',
    exec_id: exec.id,
    exec_status: exec.status,
    nodes_ran: nodesRan.length,
    last_node: execDetail.json?.data?.resultData?.lastNodeExecuted,
    error: topErr || (Object.keys(errs)[0] ? `${Object.keys(errs)[0]}: ${errs[Object.keys(errs)[0]].message}` : null),
    duration_ms: Date.now() - t0,
  }
}
