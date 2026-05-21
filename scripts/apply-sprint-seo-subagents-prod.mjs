#!/usr/bin/env node
/**
 * scripts/apply-sprint-seo-subagents-prod.mjs · sprint-seo activate · CC#sprint-seo
 *
 * Apply the 5-SEO-sub-agent migration to prod Supabase via Management API.
 *
 * Per CC dispatch [CC-ACTIVATE-5-SEO-SUBAGENTS] · companion to PR migration
 * `supabase/migrations/202605210000_seed_5_seo_subagents.sql`.
 *
 * Usage · `node scripts/apply-sprint-seo-subagents-prod.mjs`
 *
 * Idempotent · migration uses ON CONFLICT DO UPDATE guarded by identity_source.
 * If PAT 401 · prints SQL fallback to paste in Supabase SQL Editor.
 *
 * Requires .env.local · NEXT_PUBLIC_SUPABASE_URL + SUPABASE_ACCESS_TOKEN.
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

const url = env.NEXT_PUBLIC_SUPABASE_URL
const pat = env.SUPABASE_ACCESS_TOKEN
if (!url || !pat) {
  console.error('FAIL · missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_ACCESS_TOKEN in .env.local')
  process.exit(2)
}
const ref = url.match(/^https:\/\/([a-z0-9]+)\.supabase\.co/i)[1]
console.log(`project_ref: ${ref}`)

const runQuery = async (query) => {
  const r = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${pat}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  })
  return { status: r.status, body: await r.text() }
}

const preflight = await runQuery('SELECT 1 AS ok;')
if (preflight.status === 401) {
  console.error('FAIL · PAT 401 · refresh SUPABASE_ACCESS_TOKEN in .env.local')
  console.error(
    'fallback · paste supabase/migrations/202605210000_seed_5_seo_subagents.sql into Supabase SQL Editor',
  )
  process.exit(1)
}
console.log(`preflight ok · status ${preflight.status}`)

console.log('\n--- applying 202605210000_seed_5_seo_subagents.sql ---')
const sql = fs.readFileSync(
  path.resolve('supabase/migrations/202605210000_seed_5_seo_subagents.sql'),
  'utf8',
)
const res = await runQuery(sql)
const ok = res.status >= 200 && res.status < 300
console.log(`${ok ? 'OK ' : 'FAIL'}  status ${res.status}`)
if (!ok) {
  console.error(`body: ${res.body.slice(0, 800)}`)
  process.exit(1)
}

console.log('\n--- verify · 5 agents rows ---')
const v1 = await runQuery(
  `SELECT name, identity_source, char_length(identity_content) AS chars FROM agents WHERE name IN ('seo-orchestrator','seo-content-strategist','seo-technical','seo-geo-optimization','seo-backlink-strategist') ORDER BY name;`,
)
console.log(v1.body)

console.log('\n--- verify · 5 registry rows ---')
const v2 = await runQuery(
  `SELECT slug, default_model, status, char_length(identity_md) AS chars FROM managed_agents_registry WHERE slug LIKE 'seo-%' AND slug != 'seo-specialist' ORDER BY slug;`,
)
console.log(v2.body)

console.log('\n--- DONE ---')
console.log('Post-apply · run `node scripts/register-managed-agents.mjs` to register each on Anthropic Managed Agents API.')
