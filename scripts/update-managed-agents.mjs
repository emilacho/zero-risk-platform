#!/usr/bin/env node
/**
 * Zero Risk V3 — Update all 33 agents on Anthropic Managed Agents
 *
 * Re-uses existing anthropic_agent_id from Supabase managed_agents_registry.
 * Reads identity_md from Supabase (which must be pre-synced via
 * `sync-registry-identities.ts`), and updates each agent via
 * POST /v1/agents/{id} with the updated system prompt + metadata.
 *
 * NOTE: Anthropic Managed Agents uses POST (not PATCH) for updates.
 * Each update creates a new immutable version; running sessions keep
 * their pinned version, new sessions get the latest by default.
 *
 * Use this script AFTER modifying any identity .md file and after running
 * sync-registry-identities.ts. It updates the LIVE agents in Anthropic
 * so the next session uses the new identity.
 *
 * Complements register-managed-agents.mjs (which CREATES; this UPDATES).
 *
 * Usage:
 *   cd zero-risk-platform
 *   node scripts/update-managed-agents.mjs [--dry-run] [--slugs=ruflo,jefe-marketing]
 *
 * Options:
 *   --dry-run         Preview what would change; don't call Anthropic API
 *   --slugs=a,b,c     Only update these specific agents (comma-separated)
 *
 * Requires: .env.local with CLAUDE_API_KEY + Supabase credentials
 */

import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

// ── Parse CLI args ───────────────────────────────────────────
const args = process.argv.slice(2)
const DRY_RUN = args.includes('--dry-run')
const SLUGS_ARG = args.find(a => a.startsWith('--slugs='))
const SLUG_FILTER = SLUGS_ARG ? SLUGS_ARG.slice(8).split(',').map(s => s.trim()).filter(Boolean) : null

// ── Load .env.local ──────────────────────────────────────────
const envPath = resolve(__dirname, '..', '.env.local')
const envContent = readFileSync(envPath, 'utf-8')
const env = {}
for (const line of envContent.split('\n')) {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith('#')) continue
  const eqIdx = trimmed.indexOf('=')
  if (eqIdx < 0) continue
  env[trimmed.slice(0, eqIdx)] = trimmed.slice(eqIdx + 1)
}

const ANTHROPIC_API_KEY = env.CLAUDE_API_KEY || env.ANTHROPIC_API_KEY
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = env.SUPABASE_SERVICE_ROLE_KEY

if (!ANTHROPIC_API_KEY || !SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ Missing credentials in .env.local (need CLAUDE_API_KEY, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)')
  process.exit(1)
}

// ── Config ───────────────────────────────────────────────────
const ANTHROPIC_BASE = 'https://api.anthropic.com/v1'
const ANTHROPIC_HEADERS = {
  'Content-Type': 'application/json',
  'x-api-key': ANTHROPIC_API_KEY,
  'anthropic-version': '2023-06-01',
  'anthropic-beta': 'managed-agents-2026-04-01',
}

const SUPABASE_HEADERS = {
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
}

// ── Helpers ──────────────────────────────────────────────────

function parseYamlFrontmatter(md) {
  if (!md || !md.startsWith('---')) return { frontmatter: {}, body: md }
  const endIdx = md.indexOf('\n---', 3)
  if (endIdx < 0) return { frontmatter: {}, body: md }
  const yamlBlock = md.slice(4, endIdx)
  const body = md.slice(endIdx + 4).trim()
  const frontmatter = {}
  for (const line of yamlBlock.split('\n')) {
    const m = line.match(/^([a-zA-Z_][a-zA-Z0-9_]*):\s*(.+?)\s*$/)
    if (m && !m[2].startsWith('-') && !m[2].endsWith(':')) {
      frontmatter[m[1]] = m[2].replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, "$1")
    }
  }
  return { frontmatter, body }
}

async function supabaseGet(path) {
  const url = `${SUPABASE_URL}/rest/v1/${path}`
  const res = await fetch(url, { headers: SUPABASE_HEADERS })
  if (!res.ok) throw new Error(`Supabase GET ${path} → ${res.status}: ${await res.text()}`)
  return await res.json()
}

async function anthropicGet(path) {
  const url = `${ANTHROPIC_BASE}${path}`
  const res = await fetch(url, { method: 'GET', headers: ANTHROPIC_HEADERS })
  const text = await res.text()
  if (!res.ok) throw new Error(`Anthropic GET ${path} → ${res.status}: ${text}`)
  try { return JSON.parse(text) } catch { return text }
}

async function anthropicUpdate(path, body) {
  // Anthropic Managed Agents: updates go via POST /v1/agents/{id} (NOT PATCH).
  // The body MUST include the current `version` (optimistic concurrency control).
  // Each successful update creates a new immutable version; running sessions
  // keep their pinned version, new sessions get the latest by default.
  const url = `${ANTHROPIC_BASE}${path}`
  const res = await fetch(url, {
    method: 'POST',
    headers: ANTHROPIC_HEADERS,
    body: JSON.stringify(body),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`Anthropic POST ${path} → ${res.status}: ${text}`)
  try { return JSON.parse(text) } catch { return text }
}

// ── Main ─────────────────────────────────────────────────────

async function main() {
  console.log('🔄 Zero Risk — Update Managed Agents')
  console.log(`   Mode: ${DRY_RUN ? 'DRY-RUN (no API calls)' : 'LIVE (PATCHes Anthropic)'}`)
  if (SLUG_FILTER) console.log(`   Filter: ${SLUG_FILTER.join(', ')}`)
  console.log()

  // 1. Fetch all active agents with anthropic_agent_id
  console.log('📦 Loading agents from managed_agents_registry...')
  let agents = await supabaseGet(
    'managed_agents_registry?status=eq.active&select=slug,display_name,identity_md,anthropic_agent_id&order=slug'
  )

  if (SLUG_FILTER) {
    agents = agents.filter(a => SLUG_FILTER.includes(a.slug))
    console.log(`   Filtered to ${agents.length} agents`)
  }

  const toUpdate = agents.filter(a => a.anthropic_agent_id && a.identity_md)
  const missingId = agents.filter(a => !a.anthropic_agent_id)
  const missingMd = agents.filter(a => a.anthropic_agent_id && !a.identity_md)

  console.log(`   Found ${agents.length} active agents`)
  console.log(`   → ${toUpdate.length} will be updated`)
  if (missingId.length) console.log(`   ⚠️  ${missingId.length} missing anthropic_agent_id (need register-managed-agents.mjs): ${missingId.map(a => a.slug).join(', ')}`)
  if (missingMd.length) console.log(`   ⚠️  ${missingMd.length} missing identity_md (need sync-registry-identities.ts): ${missingMd.map(a => a.slug).join(', ')}`)
  console.log()

  if (toUpdate.length === 0) {
    console.log('✅ Nothing to update.')
    return
  }

  // 2. PATCH each agent
  const results = { success: [], failed: [], skipped: [] }

  for (const agent of toUpdate) {
    const { frontmatter } = parseYamlFrontmatter(agent.identity_md)
    const systemPrompt = agent.identity_md

    process.stdout.write(`▶ ${agent.slug.padEnd(35)} (${agent.anthropic_agent_id.slice(0, 16)}…) `)

    if (DRY_RUN) {
      console.log(`[dry-run] ${systemPrompt.length} chars ready`)
      results.skipped.push({ slug: agent.slug, reason: 'dry-run' })
      continue
    }

    try {
      // Step 1: GET current version (required for optimistic concurrency control)
      const current = await anthropicGet(`/agents/${agent.anthropic_agent_id}`)
      const currentVersion = current.version

      // Step 2: POST with current version — server bumps to version+1
      const updated = await anthropicUpdate(`/agents/${agent.anthropic_agent_id}`, {
        version: currentVersion,
        system: systemPrompt,
        description: `Zero Risk agent: ${agent.display_name}. ${frontmatter.role || ''}`.trim(),
        metadata: {
          zero_risk_slug: agent.slug,
          department: frontmatter.department || '',
          phase: frontmatter.phase || '',
          reports_to: frontmatter.reports_to || '',
          updated_at: new Date().toISOString(),
        },
      })

      console.log(`✅ v${currentVersion}→v${updated.version || '?'} · ${systemPrompt.length} chars`)
      results.success.push({ slug: agent.slug, id: agent.anthropic_agent_id, version: updated.version })
    } catch (err) {
      console.log(`❌ ${err.message}`)
      results.failed.push({ slug: agent.slug, error: err.message })
      // Stop after first failure so we can see the full error
      if (results.failed.length === 1 && !process.argv.includes('--continue-on-error')) {
        console.log('\n⚠️  Stopping after first failure. Pass --continue-on-error to try all 33.')
        break
      }
    }
  }

  // 3. Summary
  console.log()
  console.log('━'.repeat(70))
  console.log(`Done. success=${results.success.length} failed=${results.failed.length} skipped=${results.skipped.length}`)

  if (results.failed.length > 0) {
    console.log('\nFull failure details:')
    for (const f of results.failed) console.log(`  ── ${f.slug} ──\n  ${f.error}\n`)
    process.exit(1)
  }
}

main().catch(err => {
  console.error('Fatal:', err)
  process.exit(1)
})
