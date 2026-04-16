#!/usr/bin/env node
/**
 * Zero Risk V3 — Register all 33 agents on Anthropic Managed Agents
 *
 * Reads identities from Supabase managed_agents_registry,
 * creates each agent via POST /v1/agents, and stores the
 * returned agent_id back in Supabase (anthropic_agent_id column).
 *
 * Also creates:
 *  - 1 Environment (cloud, unrestricted networking)
 *
 * Usage:
 *   cd zero-risk-platform
 *   node scripts/register-managed-agents.mjs
 *
 * Requires: .env.local with CLAUDE_API_KEY + Supabase credentials
 */

import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

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

const ANTHROPIC_API_KEY = env.CLAUDE_API_KEY
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = env.SUPABASE_SERVICE_ROLE_KEY

if (!ANTHROPIC_API_KEY || !SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ Missing credentials in .env.local')
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

// Model mapping: identity_md frontmatter → Anthropic model ID
const MODEL_MAP = {
  'claude-haiku-4-5': 'claude-haiku-4-5-20251001',
  'claude-sonnet-4-6': 'claude-sonnet-4-6',
  'claude-opus-4-6': 'claude-opus-4-6',
  // Fallbacks for short names
  'claude-haiku': 'claude-haiku-4-5-20251001',
  'claude-sonnet': 'claude-sonnet-4-6',
  'claude-opus': 'claude-opus-4-6',
}

// ── Helpers ──────────────────────────────────────────────────

function parseYamlFrontmatter(md) {
  if (!md || !md.startsWith('---')) return { frontmatter: {}, body: md }
  const endIdx = md.indexOf('\n---', 3)
  if (endIdx < 0) return { frontmatter: {}, body: md }
  const yamlBlock = md.slice(4, endIdx)
  const body = md.slice(endIdx + 4).trim()

  // Simple YAML parser for flat keys we need
  const fm = {}
  for (const line of yamlBlock.split('\n')) {
    const match = line.match(/^(\w[\w_-]*)\s*:\s*(.+)$/)
    if (match) {
      let val = match[2].trim()
      if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1)
      fm[match[1]] = val
    }
  }
  return { frontmatter: fm, body }
}

async function anthropicPost(path, body) {
  const res = await fetch(`${ANTHROPIC_BASE}${path}`, {
    method: 'POST',
    headers: ANTHROPIC_HEADERS,
    body: JSON.stringify(body),
  })
  const data = await res.json()
  if (!res.ok) {
    throw new Error(`Anthropic ${path} ${res.status}: ${JSON.stringify(data)}`)
  }
  return data
}

async function supabaseGet(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: SUPABASE_HEADERS,
  })
  return res.json()
}

async function supabasePatch(table, filter, body) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${filter}`, {
    method: 'PATCH',
    headers: { ...SUPABASE_HEADERS, Prefer: 'return=minimal' },
    body: JSON.stringify(body),
  })
  return res.status
}

// ── Main ─────────────────────────────────────────────────────

async function main() {
  console.log('═══════════════════════════════════════════════════')
  console.log(' Zero Risk V3 — Register Managed Agents')
  console.log('═══════════════════════════════════════════════════\n')

  // 1. Fetch all active agents from registry
  console.log('📦 Loading agents from managed_agents_registry...')
  const agents = await supabaseGet(
    'managed_agents_registry?status=eq.active&select=slug,display_name,default_model,identity_md,anthropic_agent_id&order=slug'
  )
  console.log(`   Found ${agents.length} active agents\n`)

  // 2. Check which already have anthropic_agent_id
  const alreadyRegistered = agents.filter(a => a.anthropic_agent_id)
  const toRegister = agents.filter(a => !a.anthropic_agent_id)

  if (alreadyRegistered.length > 0) {
    console.log(`⏭️  Skipping ${alreadyRegistered.length} already registered:`)
    for (const a of alreadyRegistered) {
      console.log(`   - ${a.slug} → ${a.anthropic_agent_id}`)
    }
    console.log()
  }

  if (toRegister.length === 0) {
    console.log('✅ All agents already registered!')
  }

  // 3. Register each agent
  const results = { success: [], failed: [] }

  for (const agent of toRegister) {
    const { frontmatter, body } = parseYamlFrontmatter(agent.identity_md || '')

    // Resolve model
    const modelKey = frontmatter.model || agent.default_model || 'claude-sonnet-4-6'
    const modelId = MODEL_MAP[modelKey] || modelKey

    // Build system prompt (full identity_md as system prompt)
    const systemPrompt = agent.identity_md || `You are ${agent.display_name}.`

    // Build tools array: agent toolset + custom Client Brain tools
    const tools = [
      { type: 'agent_toolset_20260401' },
      // Custom tool: query Client Brain (Supabase)
      {
        type: 'custom',
        name: 'query_client_brain',
        description: 'Search the Client Brain for relevant brand context, ICP documents, voice-of-customer data, competitive landscape, and historical outputs using semantic RAG. Call this before generating any client-facing content.',
        input_schema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'The search query describing what context you need' },
            sections: {
              type: 'array',
              items: {
                type: 'string',
                enum: ['brand_books', 'icp_documents', 'voc_library', 'competitive_landscape', 'historical_outputs'],
              },
              description: 'Which brain sections to search (default: all)',
            },
            match_count: { type: 'integer', description: 'How many results to return (default: 5)', minimum: 1, maximum: 20 },
          },
          required: ['query'],
        },
      },
      // Custom tool: get guardrails
      {
        type: 'custom',
        name: 'get_client_guardrails',
        description: 'Fetch the client brand guardrails: forbidden words, required terminology, voice description, competitor mention policy, and compliance notes. Call this before any content generation to ensure brand compliance.',
        input_schema: {
          type: 'object',
          properties: {},
        },
      },
    ]

    // Create the agent
    const agentName = `ZR-${agent.display_name}`
    process.stdout.write(`▶ Creating ${agent.slug} (${modelId})...`)

    try {
      const created = await anthropicPost('/agents', {
        name: agentName,
        model: modelId,
        system: systemPrompt,
        tools,
        description: `Zero Risk agent: ${agent.display_name}. ${frontmatter.role || ''}`.trim(),
        metadata: {
          zero_risk_slug: agent.slug,
          department: frontmatter.department || '',
          phase: frontmatter.phase || '',
          reports_to: frontmatter.reports_to || '',
        },
      })

      // Store the Anthropic agent ID back in Supabase
      const patchStatus = await supabasePatch(
        'managed_agents_registry',
        `slug=eq.${agent.slug}`,
        { anthropic_agent_id: created.id }
      )

      console.log(` ✅ ${created.id} (v${created.version}) [DB: ${patchStatus}]`)
      results.success.push({ slug: agent.slug, id: created.id })
    } catch (err) {
      console.log(` ❌ ${err.message.substring(0, 120)}`)
      results.failed.push({ slug: agent.slug, error: err.message })
    }
  }

  // 4. Create Environment (if not exists)
  console.log('\n🌐 Creating Environment...')
  try {
    const environment = await anthropicPost('/environments', {
      name: 'zero-risk-production',
      config: {
        type: 'cloud',
        networking: { type: 'unrestricted' },
      },
    })
    console.log(`   ✅ Environment: ${environment.id}`)

    // Also store environment ID in a known place
    console.log(`\n   💾 Save this Environment ID for later:`)
    console.log(`   ANTHROPIC_ENVIRONMENT_ID=${environment.id}`)
  } catch (err) {
    console.log(`   ⚠️  ${err.message.substring(0, 120)}`)
    console.log('   (Environment may already exist — check Console)')
  }

  // 5. Summary
  console.log('\n═══════════════════════════════════════════════════')
  console.log(` RESULTS: ${results.success.length} created, ${results.failed.length} failed, ${alreadyRegistered.length} skipped`)
  console.log('═══════════════════════════════════════════════════')

  if (results.failed.length > 0) {
    console.log('\n❌ Failed agents:')
    for (const f of results.failed) {
      console.log(`   ${f.slug}: ${f.error.substring(0, 100)}`)
    }
  }

  if (results.success.length > 0) {
    console.log('\n✅ Registered agents:')
    for (const s of results.success) {
      console.log(`   ${s.slug} → ${s.id}`)
    }
  }

  console.log('\n📋 Next steps:')
  console.log('   1. Go to console.anthropic.com → Managed Agents → Agents to see them')
  console.log('   2. Create a Vault with your API credentials (Supabase, etc.)')
  console.log('   3. Test a session: node scripts/test-managed-agent-session.mjs')
  console.log()
}

main().catch(err => {
  console.error('💥 Fatal error:', err)
  process.exit(1)
})
