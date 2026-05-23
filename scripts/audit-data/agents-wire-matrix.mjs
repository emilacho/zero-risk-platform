#!/usr/bin/env node
/**
 * scripts/audit-data/agents-wire-matrix.mjs
 *
 * Sprint 7.6 D2 · canonical "wire matrix" audit. Outputs honest 🟢/🟡/🔴
 * status per MANIFEST-31 agent · derived from live ground truth ·
 *
 *   🟢 GREEN   · agent has ≥1 n8n workflow invocation in ACTIVE state
 *               + ≥1 row en `agent_invocations` last 30 days
 *   🟡 YELLOW  · agent has invocation in some workflow OR Supabase row
 *               BUT not both (partial wire)
 *   🔴 RED     · 0 references en n8n workflows live AND 0 rows en
 *               agent_invocations · truly dormant
 *
 * Usage ·
 *   node scripts/audit-data/agents-wire-matrix.mjs
 *
 * Env required ·
 *   N8N_API_KEY        · iN-k token (never expires per audit)
 *   N8N_API_URL        · default https://n8n-production-72be.up.railway.app
 *   SUPABASE_URL       · default https://ordaeyxvvvdqsznsecjx.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY · per .env.local
 *
 * Exits with code 0 if matrix returned successfully · 1 on fetch errors.
 */
const MANIFEST_31 = [
  "ruflo", "jefe-marketing", "campaign-brief-agent", "brand-strategist",
  "market-research", "customer-research", "competitive-intelligence-agent",
  "mops-director", "content-creator", "seo-specialist", "media-buyer",
  "web-designer", "video-editor", "creative-director",
  "social-media-strategist", "editor-en-jefe", "community-manager",
  "influencer-manager", "tracking-specialist", "email-marketer",
  "crm-architect", "review-responder", "pr-earned-media-manager",
  "cro-specialist", "optimization-agent", "growth-hacker",
  "sales-enablement", "jefe-client-success", "account-manager",
  "onboarding-specialist", "reporting-agent",
]
const ALIASES = {
  media_buyer: "media-buyer",
  cro_specialist: "cro-specialist",
  optimization_agent: "optimization-agent",
  competitive_intelligence: "competitive-intelligence-agent",
  competitive_intelligence_agent: "competitive-intelligence-agent",
  "seo-geo-optimization": "seo-specialist",
  social_adapter: "social-media-strategist",
  editor_en_jefe: "editor-en-jefe",
  customer_research_agent: "customer-research",
  market_research_analyst: "market-research",
  marketing_content_creator: "content-creator",
  marketing_growth_hacker: "growth-hacker",
  marketing_seo_specialist: "seo-specialist",
  marketing_social_media_strategist: "social-media-strategist",
  paid_media_tracking_specialist: "tracking-specialist",
  influencer_partnerships_manager: "influencer-manager",
  video_editor_motion_designer: "video-editor",
}

const N8N_API_URL =
  process.env.N8N_API_URL ?? "https://n8n-production-72be.up.railway.app"
const N8N_API_KEY = process.env.N8N_API_KEY
const SUPABASE_URL =
  process.env.SUPABASE_URL ?? "https://ordaeyxvvvdqsznsecjx.supabase.co"
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!N8N_API_KEY) {
  console.error("[wire-matrix] FATAL · N8N_API_KEY missing")
  process.exit(1)
}
if (!SUPABASE_KEY) {
  console.error("[wire-matrix] FATAL · SUPABASE_SERVICE_ROLE_KEY missing")
  process.exit(1)
}

async function fetchN8n() {
  const res = await fetch(`${N8N_API_URL}/api/v1/workflows?limit=250`, {
    headers: { "X-N8N-API-KEY": N8N_API_KEY },
  })
  if (!res.ok) throw new Error(`n8n HTTP ${res.status}`)
  return res.json()
}

async function fetchAgentInvocations() {
  // Last 30 days
  const since = new Date(Date.now() - 30 * 86400000).toISOString()
  const url = `${SUPABASE_URL}/rest/v1/agent_invocations?select=agent_name&created_at=gte.${since}`
  const res = await fetch(url, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
  })
  if (!res.ok) throw new Error(`supabase HTTP ${res.status}`)
  return res.json()
}

function extractInvocations(wf) {
  const body = JSON.stringify(wf)
  const slugs = new Set()
  for (const m of body.matchAll(/\\"agent\\"\s*:\s*\\"([a-zA-Z][a-zA-Z0-9_-]+)\\"/g)) {
    slugs.add(ALIASES[m[1]] ?? m[1])
  }
  return slugs
}

async function main() {
  const n8n = await fetchN8n()
  const wfs = n8n.data ?? []
  const inv = await fetchAgentInvocations()

  // Build per-slug active-workflow count
  const n8nMap = new Map()
  for (const wf of wfs) {
    const slugs = extractInvocations(wf)
    for (const s of slugs) {
      const entry = n8nMap.get(s) ?? { total: 0, active: 0 }
      entry.total++
      if (wf.active) entry.active++
      n8nMap.set(s, entry)
    }
  }

  // Build per-slug invocation count last 30 days
  const supaMap = new Map()
  for (const row of inv) {
    const s = ALIASES[row.agent_name] ?? row.agent_name
    supaMap.set(s, (supaMap.get(s) ?? 0) + 1)
  }

  // Score per MANIFEST-31 slug
  const matrix = MANIFEST_31.map((slug) => {
    const n = n8nMap.get(slug) ?? { total: 0, active: 0 }
    const s = supaMap.get(slug) ?? 0
    let status
    if (n.active >= 1 && s >= 1) status = "🟢"
    else if (n.active >= 1 || s >= 1) status = "🟡"
    else status = "🔴"
    return { slug, n8n_active: n.active, n8n_total: n.total, invocations_30d: s, status }
  })

  // Output
  console.log(`Total workflows live · ${wfs.length} · active ${wfs.filter(w => w.active).length}`)
  console.log(`agent_invocations last 30d · ${inv.length} rows`)
  console.log("")
  console.log("slug                                    n8n A/T  inv30d  status")
  console.log("─".repeat(70))
  for (const r of matrix) {
    console.log(
      `${r.slug.padEnd(40)} ${String(r.n8n_active).padStart(2)}/${String(r.n8n_total).padStart(2)}    ${String(r.invocations_30d).padStart(4)}    ${r.status}`,
    )
  }
  const counts = { "🟢": 0, "🟡": 0, "🔴": 0 }
  for (const r of matrix) counts[r.status]++
  console.log("")
  console.log(`Score · 🟢 ${counts["🟢"]} · 🟡 ${counts["🟡"]} · 🔴 ${counts["🔴"]} / 31 MANIFEST`)
}

main().catch((err) => {
  console.error("[wire-matrix] FATAL", err)
  process.exit(1)
})
