/**
 * sync-registry-identities.ts
 *
 * Reads each row from `managed_agents_registry`, follows `system_prompt_ref`
 * to the .md file on disk, and UPDATEs `identity_md` with its content.
 *
 * Run this ONCE after `schema_v3_agents_alignment.sql` is applied,
 * and again whenever an identity .md changes.
 *
 * Run: npx tsx scripts/sync-registry-identities.ts
 *
 * Required env (in .env.local):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'fs'
import { join, resolve } from 'path'
import { config } from 'dotenv'

config({ path: join(process.cwd(), '.env.local') })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

// system_prompt_ref is relative to the project ROOT (Agentic Business Agency).
// Resolve from process.cwd() (zero-risk-platform/) by going one level up.
const PROJECT_ROOT = resolve(process.cwd(), '..')

async function main() {
  const { data: rows, error } = await supabase
    .from('managed_agents_registry')
    .select('slug, system_prompt_ref, identity_md')
    .eq('status', 'active')

  if (error) {
    console.error('Error fetching registry:', error.message)
    process.exit(1)
  }

  if (!rows || rows.length === 0) {
    console.error('Registry is empty — apply schema_v3_agents_alignment.sql first.')
    process.exit(1)
  }

  let updated = 0
  let skipped = 0
  let failed = 0

  for (const row of rows) {
    if (!row.system_prompt_ref) {
      console.log(`  [skip] ${row.slug} — no system_prompt_ref`)
      skipped++
      continue
    }

    const fullPath = join(PROJECT_ROOT, row.system_prompt_ref)
    if (!existsSync(fullPath)) {
      console.log(`  [fail] ${row.slug} — file not found: ${row.system_prompt_ref}`)
      failed++
      continue
    }

    const content = readFileSync(fullPath, 'utf-8')

    if (row.identity_md && row.identity_md.length === content.length) {
      console.log(`  [skip] ${row.slug} — already in sync (${content.length} chars)`)
      skipped++
      continue
    }

    const { error: updErr } = await supabase
      .from('managed_agents_registry')
      .update({ identity_md: content })
      .eq('slug', row.slug)

    if (updErr) {
      console.log(`  [fail] ${row.slug} — ${updErr.message}`)
      failed++
    } else {
      console.log(`  [ ok ] ${row.slug} — ${content.length} chars`)
      updated++
    }
  }

  console.log(`\nDone. updated=${updated} skipped=${skipped} failed=${failed}`)
  if (failed > 0) process.exit(1)
}

main().catch(err => {
  console.error('Fatal:', err)
  process.exit(1)
})
