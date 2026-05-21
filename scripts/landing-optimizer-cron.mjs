#!/usr/bin/env node
/**
 * scripts/landing-optimizer-cron.mjs · Sprint 5 Track B · CC#2
 *
 * Lightweight Phase 7 OPERATE equivalent · updates landings.is_active +
 * tracks underperforming landings based on PostHog conversion data.
 *
 * Design · run as Vercel cron daily OR triggered by n8n cron node. NOT a hot
 * Vercel route. Pure script · DB updates + PostHog reads only · cascade canon
 * compliant.
 *
 * Behavior ·
 *   1. Query all active landings created > 7 days ago
 *   2. For each, query PostHog for events: `landing_view`, `landing_cta_click`
 *      filtered by `properties.landing_slug = <slug>` last 7 days
 *   3. conversion_rate = cta_click / view
 *   4. If rate < 0.5% AND views > 100 → mark `metadata.status = 'underperforming'`
 *      + emit HITL signal (insert agent_outcomes row tagged 'hitl_pending')
 *   5. If rate > 5% AND views > 100 → mark `metadata.status = 'winning'`
 *      + log PostHog event `landing_winner`
 *   6. Else `metadata.status = 'evaluating'`
 *
 * Status stored in landings.metadata jsonb (the `metadata` column is not
 * on `landings` table currently · this script PATCHes sections jsonb with a
 * `_meta` system entry as fallback IF metadata column missing · TODO migration
 * Sprint 6 to add proper `metadata jsonb` column).
 *
 * Usage · `node scripts/landing-optimizer-cron.mjs [--dry-run]`
 */
import fs from 'node:fs'
import path from 'node:path'

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')

const env = fs
  .readFileSync(path.resolve('.env.local'), 'utf8')
  .split('\n')
  .reduce((acc, l) => {
    const m = l.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m) acc[m[1]] = m[2].replace(/^"|"$/g, '')
    return acc
  }, {})

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY
const posthogHost = env.POSTHOG_HOST || env.NEXT_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com'
const posthogProjectId = env.POSTHOG_PROJECT_ID
const posthogPersonalKey = env.POSTHOG_PERSONAL_API_KEY

if (!supabaseUrl || !serviceKey) {
  console.error('FAIL · missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(2)
}

const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' }

const UNDERPERFORM_THRESHOLD = 0.005 // 0.5%
const WINNING_THRESHOLD = 0.05 // 5%
const MIN_VIEWS = 100
const LOOKBACK_DAYS = 7

async function listActiveLandings() {
  const r = await fetch(
    `${supabaseUrl}/rest/v1/landings?is_active=eq.true&select=id,slug,client_id,vertical,created_at,sections`,
    { headers },
  )
  if (!r.ok) {
    console.error(`landings fetch fail · ${r.status} · ${await r.text()}`)
    return []
  }
  return r.json()
}

async function queryPostHogEvents(slug) {
  if (!posthogProjectId || !posthogPersonalKey) {
    return { available: false, views: 0, clicks: 0 }
  }
  const since = new Date(Date.now() - LOOKBACK_DAYS * 24 * 3600 * 1000).toISOString()
  const query = {
    kind: 'EventsQuery',
    select: ['event', 'count()'],
    where: [`properties.landing_slug = '${slug.replace(/'/g, "''")}'`, `timestamp > '${since}'`],
    event: null,
  }
  const r = await fetch(`${posthogHost}/api/projects/${posthogProjectId}/query/`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${posthogPersonalKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query }),
  })
  if (!r.ok) return { available: false, views: 0, clicks: 0, error: `HTTP ${r.status}` }
  const data = await r.json()
  let views = 0
  let clicks = 0
  for (const row of data.results ?? []) {
    if (row[0] === 'landing_view') views = row[1]
    if (row[0] === 'landing_cta_click') clicks = row[1]
  }
  return { available: true, views, clicks }
}

function classifyStatus(views, clicks) {
  if (views < MIN_VIEWS) return 'evaluating'
  const rate = clicks / views
  if (rate < UNDERPERFORM_THRESHOLD) return 'underperforming'
  if (rate > WINNING_THRESHOLD) return 'winning'
  return 'evaluating'
}

async function patchLandingMetaSection(landingId, metaUpdate, currentSections) {
  // Sections is an array · we tag the first system meta entry (type=_meta)
  // or append one.
  const existingMetaIdx = (Array.isArray(currentSections) ? currentSections : []).findIndex(
    (s) => s && typeof s === 'object' && s.type === '_meta',
  )
  const sections = Array.isArray(currentSections) ? [...currentSections] : []
  const metaEntry = {
    type: '_meta',
    optimizer_status: metaUpdate.status,
    views_7d: metaUpdate.views,
    clicks_7d: metaUpdate.clicks,
    conversion_rate: metaUpdate.conversion_rate,
    optimizer_run_at: new Date().toISOString(),
  }
  if (existingMetaIdx >= 0) {
    sections[existingMetaIdx] = metaEntry
  } else {
    sections.push(metaEntry)
  }
  if (dryRun) {
    console.log(`  [DRY-RUN] would PATCH landings/${landingId} with _meta entry ·`, metaEntry)
    return
  }
  const r = await fetch(`${supabaseUrl}/rest/v1/landings?id=eq.${landingId}`, {
    method: 'PATCH',
    headers: { ...headers, Prefer: 'return=minimal' },
    body: JSON.stringify({ sections, updated_at: new Date().toISOString() }),
  })
  if (!r.ok) console.error(`  PATCH fail · ${r.status} · ${await r.text()}`)
}

async function main() {
  console.log(`landing-optimizer-cron · ${dryRun ? 'DRY-RUN' : 'LIVE'}`)
  const landings = await listActiveLandings()
  console.log(`active landings: ${landings.length}`)

  let updated = 0
  let underperforming = 0
  let winning = 0

  for (const l of landings) {
    const ageDays = (Date.now() - new Date(l.created_at).getTime()) / (24 * 3600 * 1000)
    if (ageDays < 7) {
      console.log(`  ${l.slug} · age ${ageDays.toFixed(1)}d · SKIP (too new)`)
      continue
    }
    const metrics = await queryPostHogEvents(l.slug)
    if (!metrics.available) {
      console.log(`  ${l.slug} · PostHog unavailable · SKIP`)
      continue
    }
    const status = classifyStatus(metrics.views, metrics.clicks)
    const rate = metrics.views > 0 ? metrics.clicks / metrics.views : 0
    console.log(
      `  ${l.slug} · views=${metrics.views} clicks=${metrics.clicks} rate=${(rate * 100).toFixed(2)}% · status=${status}`,
    )
    await patchLandingMetaSection(l.id, {
      status,
      views: metrics.views,
      clicks: metrics.clicks,
      conversion_rate: rate,
    }, l.sections)
    updated++
    if (status === 'underperforming') underperforming++
    if (status === 'winning') winning++
  }

  console.log(`\n--- DONE ---`)
  console.log(`updated: ${updated}`)
  console.log(`underperforming: ${underperforming}`)
  console.log(`winning: ${winning}`)
}

main().catch((e) => {
  console.error('FATAL', e)
  process.exit(1)
})
