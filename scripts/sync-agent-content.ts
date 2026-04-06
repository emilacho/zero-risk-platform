/**
 * sync-agent-content.ts
 *
 * Carga el contenido REAL de identidades y skills en Supabase.
 * Reemplaza los placeholders "Loaded from filesystem..." con el contenido .md real.
 *
 * Ejecutar: npx tsx scripts/sync-agent-content.ts
 *
 * Requiere:
 *   SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en .env.local
 *   o como variables de entorno
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { config } from 'dotenv'

// Load .env.local
config({ path: join(process.cwd(), '.env.local') })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  console.error('   Set them in .env.local or as environment variables')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

const IDENTITIES_DIR = join(process.cwd(), 'src', 'agents', 'identities')
const SKILLS_DIR = join(process.cwd(), 'src', 'agents', 'skills')

async function syncIdentities() {
  console.log('\n📋 Syncing agent identities...\n')

  const { data: agents, error } = await supabase
    .from('agents')
    .select('id, name, identity_content')

  if (error) {
    console.error('❌ Error fetching agents:', error.message)
    return
  }

  let updated = 0
  let skipped = 0
  let failed = 0

  for (const agent of agents || []) {
    const filePath = join(IDENTITIES_DIR, `${agent.name}.md`)

    if (!existsSync(filePath)) {
      console.log(`  ⚠️  ${agent.name}: no .md file found, skipping`)
      skipped++
      continue
    }

    const content = readFileSync(filePath, 'utf-8')

    // Check if already has real content (not placeholder)
    if (agent.identity_content &&
        !agent.identity_content.startsWith('Loaded from filesystem') &&
        agent.identity_content.length > 100) {
      console.log(`  ✅ ${agent.name}: already has real content (${agent.identity_content.length} chars), skipping`)
      skipped++
      continue
    }

    const { error: updateError } = await supabase
      .from('agents')
      .update({ identity_content: content })
      .eq('id', agent.id)

    if (updateError) {
      console.error(`  ❌ ${agent.name}: update failed —`, updateError.message)
      failed++
    } else {
      console.log(`  ✅ ${agent.name}: updated (${content.length} chars)`)
      updated++
    }
  }

  console.log(`\n  Identities: ${updated} updated, ${skipped} skipped, ${failed} failed`)
}

async function syncSkills() {
  console.log('\n📚 Syncing agent skills...\n')

  const { data: skills, error } = await supabase
    .from('agent_skills')
    .select('id, skill_name, skill_content')

  if (error) {
    console.error('❌ Error fetching skills:', error.message)
    return
  }

  let updated = 0
  let skipped = 0
  let failed = 0

  for (const skill of skills || []) {
    const filePath = join(SKILLS_DIR, skill.skill_name, 'SKILL.md')

    if (!existsSync(filePath)) {
      console.log(`  ⚠️  ${skill.skill_name}: no SKILL.md found, skipping`)
      skipped++
      continue
    }

    const content = readFileSync(filePath, 'utf-8')

    // Check if already has real content
    if (skill.skill_content &&
        !skill.skill_content.startsWith('Loaded from filesystem') &&
        skill.skill_content.length > 100) {
      console.log(`  ✅ ${skill.skill_name}: already has real content (${skill.skill_content.length} chars), skipping`)
      skipped++
      continue
    }

    const { error: updateError } = await supabase
      .from('agent_skills')
      .update({ skill_content: content })
      .eq('id', skill.id)

    if (updateError) {
      console.error(`  ❌ ${skill.skill_name}: update failed —`, updateError.message)
      failed++
    } else {
      console.log(`  ✅ ${skill.skill_name}: updated (${content.length} chars)`)
      updated++
    }
  }

  console.log(`\n  Skills: ${updated} updated, ${skipped} skipped, ${failed} failed`)
}

async function main() {
  console.log('🚀 Zero Risk — Agent Content Sync')
  console.log(`   Supabase: ${SUPABASE_URL}`)
  console.log(`   Identities: ${IDENTITIES_DIR}`)
  console.log(`   Skills: ${SKILLS_DIR}`)

  await syncIdentities()
  await syncSkills()

  console.log('\n✅ Sync complete!\n')
}

main().catch(console.error)
