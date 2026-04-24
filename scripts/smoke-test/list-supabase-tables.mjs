#!/usr/bin/env node
// Lists all public tables in Supabase + maps them against tables referenced
// by workflow backend routes. Output: which tables exist, which need to be created.

import { endpoints } from './lib/env.mjs'
import { fetchJson } from './lib/fetch.mjs'

const ep = endpoints()
const H = { apikey: ep.SUPABASE_SERVICE_ROLE_KEY, Authorization: 'Bearer ' + ep.SUPABASE_SERVICE_ROLE_KEY }

// Use Supabase's internal schema introspection via a raw SQL call through PostgREST.
// We'll use the `information_schema.tables` via a stored procedure, OR just try fetching
// metadata on each table name.

// First: list via the OpenAPI root (PostgREST exposes all tables there).
const res = await fetchJson(ep.supabase + '/rest/v1/', { headers: H })
if (!res.ok) {
  console.error('Failed to fetch OpenAPI:', res.status)
  process.exit(1)
}
const openapi = res.json
const tables = Object.keys(openapi.definitions || openapi.components?.schemas || {})
console.log(`Supabase has ${tables.length} tables/views:\n`)
for (const t of tables.sort()) console.log('  -', t)

// Tables that workflow backend routes would need (derived from find-missing-routes.mjs output)
const expected = [
  'client_brain_snapshots',
  'client_brain_embeddings',
  'content_fetch_cache',
  'agent_outcomes',
  'subject_line_tests',
  'influencer_approved_list',
  'influencer_rejections',
  'review_metrics',
  'review_responses_queue',
  'uptime_incidents',
  'error_events',
  'email_sequences',
  'seo_engagements',
  'seo_cannibalization_audits',
  'churn_predictions',
  'rfm_segments',
  'community_health',
  'expansion_opportunities',
  'tracking_attribution_audits',
  'creative_performance_insights',
  'content_refresh_queue',
  'content_queue',
  'social_queue',
  'campaigns',
  'experiments',
  'clients',
  'meta_ads_campaigns',
  'google_ads_campaigns',
  'tiktok_ads_campaigns',
  'linkedin_ads_campaigns',
  'incrementality_tests',
  'hitl_approvals',
  'phase_gate_audits',
  'campaign_pipeline_state',
  'agent_routing_log',
  'agent_health_metrics',
  'identity_improvements',
  'headlines_library',
  'managed_agents_registry',
]

const existingSet = new Set(tables)
const missing = expected.filter(t => !existingSet.has(t))
const existing = expected.filter(t => existingSet.has(t))

console.log(`\n── Required-by-workflows tables ──`)
console.log(`  ✓ Exist (${existing.length}):  ${existing.join(', ')}`)
console.log(`  ✗ Missing (${missing.length}):`)
for (const t of missing) console.log(`      - ${t}`)
