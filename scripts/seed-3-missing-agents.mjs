#!/usr/bin/env node
/**
 * Zero Risk — Seed 3 missing managed_agents_registry rows
 *
 * crm-architect, mops-director, pr-earned-media-manager were defined in S33p5
 * but were NOT included in the original schema_v3_agents_alignment.sql seed.
 * This script UPSERTs them with identity_md populated from disk.
 *
 * Usage:
 *   node scripts/seed-3-missing-agents.mjs             # dry-run (default)
 *   node scripts/seed-3-missing-agents.mjs --apply     # write to Supabase
 *
 * Requires: .env.local with NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
 *
 * NOTE: On Windows, Node may print "Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)"
 * after the script exits cleanly. This is a libuv handle-cleanup bug on Windows
 * (libuv issue #3644 / Node issue). It does NOT affect execution — all UPSERTs
 * complete before the crash. If the "RESULT: N upserted" line appears, the run succeeded.
 * Fix deferred to Sprint #3 if it becomes disruptive.
 */

import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const APPLY = process.argv.includes('--apply')

// ── Load .env.local (CRLF-safe) ──────────────────────────────────────────────
const envPath = resolve(__dirname, '..', '.env.local')
const env = {}
for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith('#')) continue
  const eqIdx = trimmed.indexOf('=')
  if (eqIdx < 0) continue
  env[trimmed.slice(0, eqIdx).trim()] = trimmed.slice(eqIdx + 1).trim()
}

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}

const SB_HEADERS = {
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
  Prefer: 'resolution=merge-duplicates,return=representation',
}

// ── Identity files are relative to the project root (one level up from zero-risk-platform/)
const PROJECT_ROOT = resolve(__dirname, '..', '..')

function readIdentity(ref) {
  const absPath = resolve(PROJECT_ROOT, ref)
  if (!existsSync(absPath)) {
    throw new Error(`Identity file not found: ${absPath}`)
  }
  return readFileSync(absPath, 'utf-8')
}

// ── Agent definitions ─────────────────────────────────────────────────────────
const AGENTS = [
  {
    slug: 'crm-architect',
    managed_agent_id: 'crm-architect',
    display_name: 'CRM Architect & MarTech Admin',
    default_model: 'claude-sonnet-4-6',
    layer: 'marketing-activation',
    description: 'Platform administration of CRM (GHL primary), workflow automation cross-channel, data management & hygiene, integration governance, and MarTech stack architecture.',
    system_prompt_ref: 'docs/04-agentes/identidades/crm-architect.md',
    aliases: ['crm_architect'],
    status: 'active',
  },
  {
    slug: 'mops-director',
    managed_agent_id: 'mops-director',
    display_name: 'Marketing Operations Director',
    default_model: 'claude-sonnet-4-6',
    layer: 'marketing-planning',
    description: 'Lead of Marketing Operations sub-department — owns MarTech stack governance, marketing data infrastructure architecture, automation strategy, and cross-functional integration coherence.',
    system_prompt_ref: 'docs/04-agentes/identidades/mops-director.md',
    aliases: ['mops_director'],
    status: 'active',
  },
  {
    slug: 'pr-earned-media-manager',
    managed_agent_id: 'pr-earned-media-manager',
    display_name: 'PR & Earned Media Manager',
    default_model: 'claude-sonnet-4-6',
    layer: 'marketing-activation',
    description: 'Press releases, media relations, journalist outreach, thought leadership ghost-writing, industry analyst relations, awards submissions, and earned media measurement.',
    system_prompt_ref: 'docs/04-agentes/identidades/pr-earned-media-manager.md',
    aliases: ['pr_earned_media_manager'],
    status: 'active',
  },
]

// ── Main ─────────────────────────────────────────────────────────────────────
console.log('═══════════════════════════════════════════════════════')
console.log(' Zero Risk — Seed 3 Missing Managed Agents')
console.log(` Mode: ${APPLY ? 'APPLY (writes to Supabase)' : 'DRY-RUN (no writes)'}`)
console.log('═══════════════════════════════════════════════════════\n')

// 1. Check current state
console.log('📡 Checking current registry state...')
const checkRes = await fetch(
  `${SUPABASE_URL}/rest/v1/managed_agents_registry?slug=in.(crm-architect,mops-director,pr-earned-media-manager)&select=slug,status,identity_md`,
  { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
)
const existingRows = await checkRes.json()
const existingSlugs = new Set((existingRows || []).map(r => r.slug))

if (existingSlugs.size > 0) {
  console.log(`⚠️  Already in registry (will UPSERT/overwrite): ${[...existingSlugs].join(', ')}`)
} else {
  console.log('   None of the 3 agents exist in registry — clean INSERT.')
}
console.log()

// 2. Prepare payloads
const payloads = []
for (const agent of AGENTS) {
  process.stdout.write(`  Loading identity: ${agent.slug}... `)
  try {
    const identity_md = readIdentity(agent.system_prompt_ref)
    payloads.push({ ...agent, identity_md })
    console.log(`✓ (${identity_md.length} chars)`)
  } catch (err) {
    console.log(`❌ ${err.message}`)
    process.exit(1)
  }
}
console.log()

// 3. Show plan
console.log('📋 Plan (UPSERTs):')
for (const p of payloads) {
  const existFlag = existingSlugs.has(p.slug) ? ' [EXISTS — will overwrite]' : ' [NEW]'
  console.log(`   ${p.slug.padEnd(28)} model=${p.default_model}  layer=${p.layer}${existFlag}`)
  console.log(`   aliases: [${p.aliases.join(', ')}]`)
}
console.log()

if (!APPLY) {
  console.log('ℹ️  DRY-RUN complete. Pass --apply to execute UPSERTs.\n')
  process.exit(0)
}

// 4. UPSERT each agent
console.log('⬆️  Upserting...\n')
let success = 0
let failed = 0

for (const payload of payloads) {
  process.stdout.write(`  ▶ ${payload.slug.padEnd(28)} `)
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/managed_agents_registry`, {
      method: 'POST',
      headers: SB_HEADERS,
      body: JSON.stringify(payload),
    })
    const body = await res.json()
    if (!res.ok) {
      console.log(`❌ HTTP ${res.status}: ${JSON.stringify(body).slice(0, 120)}`)
      failed++
    } else {
      const returned = Array.isArray(body) ? body[0] : body
      console.log(`✅ id=${returned?.id || '?'} slug=${returned?.slug || payload.slug}`)
      success++
    }
  } catch (err) {
    console.log(`❌ ${err.message}`)
    failed++
  }
}

console.log()
console.log('═══════════════════════════════════════════════════════')
console.log(` RESULT: ${success} upserted, ${failed} failed`)
console.log('═══════════════════════════════════════════════════════')

if (failed > 0) {
  console.log('\n❌ Some agents failed to upsert. Check errors above.')
  process.exit(1)
}

console.log('\n✅ Done. Run smoke to verify:')
console.log('   node scripts/smoke-test/run.mjs agents')
console.log('   Expected: 36/36 PASS\n')
