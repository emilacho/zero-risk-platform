#!/usr/bin/env node
/**
 * Backfill 35 placeholder identity_content rows in `agents` table.
 *
 * Dispatched per [DISPATCH-CC2-BACKFILL-35-IDENTITIES] 2026-05-16. Per the
 * CLAUDE.md `agents.identity_content` WRITE protocol, this script is the
 * official sync path for canonical re-seed (cascade · canonical
 * msitarzewski/agency-agents → managed_agents_registry.identity_md →
 * leave deferred with audit tag).
 *
 * Each write carries a provenance tag in `identity_source`. Idempotent —
 * re-running fetches the same canonical content and writes the same data.
 *
 * Usage · `node scripts/backfill-35-placeholder-identities.mjs`
 *
 * Requires env · NEXT_PUBLIC_SUPABASE_URL · SUPABASE_SERVICE_ROLE_KEY.
 *
 * Read · zero-risk-platform/CLAUDE.md (governance section) before invoking.
 */

import fs from 'node:fs/promises'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'

const ENV_FILE = path.resolve(process.cwd(), '.env.local')
const env = Object.fromEntries(
  (await fs.readFile(ENV_FILE, 'utf8'))
    .split(/\r?\n/)
    .filter(l => /^[A-Z_]+=/.test(l))
    .map(l => {
      const i = l.indexOf('=')
      return [l.slice(0, i), l.slice(i + 1)]
    }),
)

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE = env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPABASE_URL || !SERVICE_ROLE) throw new Error('Missing Supabase env')

const supa = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// --- Slug classification (audit 2026-05-16 · see Slack msg_ts 1778923327.832389)

// 24 slugs with EXACT canonical match in msitarzewski/agency-agents@main.
// Path pattern · <prefix-hyphen>/<prefix-hyphen>-<rest-hyphen>.md
const CANONICAL_EXACT = [
  'marketing_ai_citation_strategist',
  'marketing_carousel_growth_engine',
  'marketing_growth_hacker',
  'marketing_instagram_curator',
  'marketing_seo_specialist',
  'marketing_short_video_editing_coach',
  'marketing_social_media_strategist',
  'marketing_twitter_engager',
  'marketing_video_optimization_specialist',
  'paid_media_auditor',
  'paid_media_creative_strategist',
  'paid_media_paid_social_strategist',
  'paid_media_ppc_strategist',
  'paid_media_programmatic_buyer',
  'paid_media_search_query_analyst',
  'paid_media_tracking_specialist',
  'sales_account_strategist',
  'sales_coach',
  'sales_deal_strategist',
  'sales_discovery_coach',
  'sales_engineer',
  'sales_outbound_strategist',
  'sales_pipeline_analyst',
  'sales_proposal_strategist',
]

// 7 slugs with no canonical exact but managed_agents_registry has identity_md.
// Registry slug uses hyphens; agents table row uses underscores; alias map bridges.
const REGISTRY_SOURCED = {
  account_manager: 'account-manager',
  brand_strategist: 'brand-strategist',
  community_manager: 'community-manager',
  editor_en_jefe: 'editor-en-jefe',
  jefe_client_success: 'jefe-client-success',
  onboarding_specialist: 'onboarding-specialist',
  reporting_agent: 'reporting-agent',
}

// 4 slugs · no canonical, no registry, no local · stay deferred.
// Update identity_source only with audit tag so the deferral is documented.
const DEFERRED = [
  'customer_research_agent',
  'influencer_partnerships_manager',
  'market_research_analyst',
  'video_editor_motion_designer',
]

const GH_RAW_BASE =
  'https://raw.githubusercontent.com/msitarzewski/agency-agents/main'

// Slug → canonical path. Deterministic transform for the 24 exact matches.
function canonicalPath(slug) {
  if (slug.startsWith('marketing_')) {
    return `marketing/${slug.replace(/_/g, '-')}.md`
  }
  if (slug.startsWith('paid_media_')) {
    return `paid-media/${slug.replace(/_/g, '-')}.md`
  }
  if (slug.startsWith('sales_')) {
    return `sales/${slug.replace(/_/g, '-')}.md`
  }
  throw new Error(`Unexpected slug for canonical path · ${slug}`)
}

async function fetchCanonical(slug) {
  const p = canonicalPath(slug)
  const url = `${GH_RAW_BASE}/${p}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`canonical fetch failed · ${slug} · ${url} · ${res.status}`)
  const text = await res.text()
  return { content: text, path: p }
}

async function backfillCanonical(slug) {
  const { content, path: p } = await fetchCanonical(slug)
  const source = `canonical:msitarzewski/agency-agents@main:${p} · backfill-35-placeholder-identities · 2026-05-16 Emilio approved`
  const { error } = await supa
    .from('agents')
    .update({ identity_content: content, identity_source: source })
    .eq('name', slug)
  if (error) throw new Error(`UPDATE canonical · ${slug} · ${error.message}`)
  return { slug, chars: content.length, source }
}

async function backfillRegistry(agentName, registrySlug) {
  const { data, error: e1 } = await supa
    .from('managed_agents_registry')
    .select('identity_md, slug')
    .eq('slug', registrySlug)
    .single()
  if (e1) throw new Error(`registry read · ${registrySlug} · ${e1.message}`)
  if (!data?.identity_md) throw new Error(`registry identity_md null · ${registrySlug}`)
  const source = `registry:managed_agents_registry:${registrySlug} · backfill-35-placeholder-identities · 2026-05-16 Emilio approved`
  const { error: e2 } = await supa
    .from('agents')
    .update({ identity_content: data.identity_md, identity_source: source })
    .eq('name', agentName)
  if (e2) throw new Error(`UPDATE registry · ${agentName} · ${e2.message}`)
  return { slug: agentName, chars: data.identity_md.length, source }
}

async function markDeferred(slug) {
  const source = `deferred:no-canonical-no-registry-no-local · backfill-35-placeholder-identities audit 2026-05-16 · awaiting project-local authoring decision per CLAUDE.md governance section`
  const { error } = await supa
    .from('agents')
    .update({ identity_source: source }) // identity_content stays "pending-identity"
    .eq('name', slug)
    .eq('identity_content', 'pending-identity') // guard · don't blow away if something else is there
  if (error) throw new Error(`UPDATE deferred · ${slug} · ${error.message}`)
  return { slug, chars: 16, source }
}

async function main() {
  const results = { canonical: [], registry: [], deferred: [], errors: [] }

  console.log(`\n=== canonical (${CANONICAL_EXACT.length}) ===`)
  for (const slug of CANONICAL_EXACT) {
    try {
      const r = await backfillCanonical(slug)
      results.canonical.push(r)
      console.log(`  ✓ ${slug.padEnd(42)} ${String(r.chars).padStart(6)} chars`)
    } catch (e) {
      results.errors.push({ slug, error: e.message })
      console.log(`  ✗ ${slug} · ${e.message}`)
    }
  }

  console.log(`\n=== registry-sourced (${Object.keys(REGISTRY_SOURCED).length}) ===`)
  for (const [agentName, registrySlug] of Object.entries(REGISTRY_SOURCED)) {
    try {
      const r = await backfillRegistry(agentName, registrySlug)
      results.registry.push(r)
      console.log(`  ✓ ${agentName.padEnd(42)} ${String(r.chars).padStart(6)} chars (registry:${registrySlug})`)
    } catch (e) {
      results.errors.push({ slug: agentName, error: e.message })
      console.log(`  ✗ ${agentName} · ${e.message}`)
    }
  }

  console.log(`\n=== deferred · source-tag only (${DEFERRED.length}) ===`)
  for (const slug of DEFERRED) {
    try {
      const r = await markDeferred(slug)
      results.deferred.push(r)
      console.log(`  ✓ ${slug.padEnd(42)} stays pending-identity · source tag updated`)
    } catch (e) {
      results.errors.push({ slug, error: e.message })
      console.log(`  ✗ ${slug} · ${e.message}`)
    }
  }

  console.log(
    `\n=== summary === canonical=${results.canonical.length}/${CANONICAL_EXACT.length} · registry=${results.registry.length}/${Object.keys(REGISTRY_SOURCED).length} · deferred=${results.deferred.length}/${DEFERRED.length} · errors=${results.errors.length}`,
  )

  if (results.errors.length) {
    console.error('\nErrors:')
    for (const e of results.errors) console.error(`  ${e.slug} · ${e.error}`)
    process.exit(1)
  }
}

main().catch(e => {
  console.error('fatal · ', e)
  process.exit(1)
})
