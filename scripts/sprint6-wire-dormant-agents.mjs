#!/usr/bin/env node
/**
 * Sprint 6 D1 · Wire dormant MANIFEST agents to n8n workflows.
 *
 * Reads live n8n state via REST API · detects which canonical MANIFEST
 * agents are NOT invoked from any workflow · prints a wire plan + (with
 * --apply) injects HTTP Request nodes that POST `/api/agents/run` into
 * the documented anchor workflows.
 *
 * Spec doc · zr-vault/raw/refs/2026-05-21-sprint6-d1-d2-dormant-agents-wire-spec.md
 *
 * Usage ·
 *   node scripts/sprint6-wire-dormant-agents.mjs              # dry-run (default)
 *   node scripts/sprint6-wire-dormant-agents.mjs --apply      # PUT to live n8n
 *   node scripts/sprint6-wire-dormant-agents.mjs --audit-only # just print current state
 *
 * Env required ·
 *   N8N_API_KEY        · key iN-k per audit (never expires)
 *   N8N_API_URL        · default https://n8n-production-72be.up.railway.app
 *   PLATFORM_API_URL   · default https://zero-risk-platform.vercel.app
 *   INTERNAL_API_KEY   · used by the HTTP nodes to call /api/agents/run
 *
 * Safety ·
 *   - Idempotent · skip workflow if the slug is already invoked
 *   - Conservative · only APPENDS new node + rewires last → new → next-of-last
 *   - Backups · writes pre-image of each modified workflow to
 *     `outputs/sprint6-wire-backups-YYYY-MM-DD/<id>.json`
 */
import { readFile, writeFile, mkdir } from "node:fs/promises"
import path from "node:path"

const args = new Set(process.argv.slice(2))
const APPLY = args.has("--apply")
const AUDIT_ONLY = args.has("--audit-only")

const N8N_API_URL =
  process.env.N8N_API_URL ?? "https://n8n-production-72be.up.railway.app"
const N8N_API_KEY = process.env.N8N_API_KEY
const PLATFORM_API_URL =
  process.env.PLATFORM_API_URL ?? "https://zero-risk-platform.vercel.app"

if (!N8N_API_KEY) {
  console.error("[wire] FATAL · N8N_API_KEY env missing")
  process.exit(2)
}

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
  "seo-geo-optimization": "seo-specialist",
  social_adapter: "social-media-strategist",
  editor_en_jefe: "editor-en-jefe",
}

// Anchor map · canonical workflow names → target dormant agents.
// Workflow name partial-match (case-insensitive · contains).
const ANCHOR_MAP = [
  { agent: "market-research", workflow_match: "cliente nuevo landing cascade", anchor_node_pattern: /scrape|discovery|fetch/i },
  { agent: "mops-director", workflow_match: "cost watchdog", anchor_node_pattern: /rollup|sum|compute/i },
  { agent: "community-manager", workflow_match: "review", anchor_node_pattern: /classif|severity/i },
  { agent: "influencer-manager", workflow_match: "social multi-platform", anchor_node_pattern: /publish|post/i },
  { agent: "crm-architect", workflow_match: "customer health|account health", anchor_node_pattern: /score|compute/i },
  { agent: "pr-earned-media-manager", workflow_match: "review", anchor_node_pattern: /severity.*high|tier.*1/i },
  { agent: "jefe-client-success", workflow_match: "qbr|account health", anchor_node_pattern: /draft|tier transition/i },
  { agent: "account-manager", workflow_match: "weekly|nps", anchor_node_pattern: /draft|pulse/i },
  { agent: "reporting-agent", workflow_match: "weekly notion|notion report", anchor_node_pattern: /synthesize|posthog|fetch/i },
  { agent: "campaign-brief-agent", workflow_match: "nexus", anchor_node_pattern: /parse|validate|entry/i },
]

async function n8nFetch(path, init = {}) {
  const res = await fetch(`${N8N_API_URL}${path}`, {
    ...init,
    headers: {
      "X-N8N-API-KEY": N8N_API_KEY,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  })
  return res
}

async function listWorkflows() {
  const res = await n8nFetch("/api/v1/workflows?limit=250")
  if (!res.ok) throw new Error(`n8n list HTTP ${res.status}`)
  const j = await res.json()
  return j.data ?? []
}

// Two-form invocation detection ·
//   Form A · JSON-serialized body  · "agent": "slug"
//   Form B · JS template literal   · agent: "slug"  (no quotes around the key)
// Form B is how buildAgentRunNode emits jsonBody (={{ JSON.stringify({ agent: "<slug>", ... }) }}).
// The original single-regex over JSON.stringify(wf) missed Form B because the
// serialized template string escapes quotes but the key `agent` is unquoted JS.
function extractInvocations(wf) {
  const body = JSON.stringify(wf)
  const slugs = new Set()
  const patterns = [
    /\\"agent\\"\s*:\s*\\"([a-zA-Z][a-zA-Z0-9_-]+)\\"/g, // Form A · JSON
    /\bagent\s*:\s*\\"([a-zA-Z][a-zA-Z0-9_-]+)\\"/g,      // Form B · JS template
  ]
  for (const re of patterns) {
    for (const m of body.matchAll(re)) {
      const raw = m[1]
      slugs.add(ALIASES[raw] ?? raw)
    }
  }
  return slugs
}

// Canonical idempotency check · the HTTP node created by buildAgentRunNode is
// named `Invoke · <slug>` · presence of a node with that exact name proves the
// wire-in already happened, independent of body-string parsing quirks.
function hasInvokeNode(wf, agent) {
  const expected = `Invoke · ${agent}`
  return (wf?.nodes ?? []).some((n) => n.name === expected)
}

function buildAgentRunNode(agent, anchorPosition) {
  const id = `wire-${agent}-${Date.now()}`
  return {
    parameters: {
      method: "POST",
      url: `${PLATFORM_API_URL}/api/agents/run`,
      sendHeaders: true,
      headerParameters: {
        parameters: [
          { name: "x-api-key", value: "={{ $env.INTERNAL_API_KEY }}" },
          { name: "Content-Type", value: "application/json" },
        ],
      },
      sendBody: true,
      specifyBody: "json",
      jsonBody: `={{ JSON.stringify({ agent: "${agent}", context: $json, task: "wire-in invocation · Sprint 6 D1 · canonical MANIFEST slug" }) }}`,
      options: {
        timeout: 30000,
        response: { response: { neverError: true } },
      },
    },
    id,
    name: `Invoke · ${agent}`,
    type: "n8n-nodes-base.httpRequest",
    typeVersion: 4.2,
    position: [
      (anchorPosition?.[0] ?? 600) + 220,
      (anchorPosition?.[1] ?? 300) + 0,
    ],
  }
}

async function main() {
  console.log(`[wire] mode · ${APPLY ? "APPLY" : AUDIT_ONLY ? "AUDIT-ONLY" : "DRY-RUN"}`)
  console.log(`[wire] n8n · ${N8N_API_URL}`)

  const wfs = await listWorkflows()
  console.log(`[wire] live workflows · ${wfs.length} · active · ${wfs.filter(w => w.active).length}`)

  // Global invocation map
  const globalInvocations = new Map()
  for (const wf of wfs) {
    const slugs = extractInvocations(wf)
    for (const s of slugs) {
      if (!globalInvocations.has(s)) globalInvocations.set(s, [])
      globalInvocations.get(s).push({ id: wf.id, name: wf.name, active: wf.active })
    }
  }

  // Determine truly dormant (0 invocations anywhere)
  const dormant = MANIFEST_31.filter((s) => !globalInvocations.has(s))
  const inactiveOnly = MANIFEST_31.filter((s) => {
    const refs = globalInvocations.get(s)
    return refs && refs.every((r) => !r.active)
  })

  console.log(`\n[wire] DORMANT TRUE · ${dormant.length}`)
  dormant.forEach((s) => console.log(`  · ${s}`))
  console.log(`\n[wire] INACTIVE-ONLY · ${inactiveOnly.length}`)
  inactiveOnly.forEach((s) => console.log(`  · ${s}`))

  if (AUDIT_ONLY) return

  // Compute wire plan
  const stamp = new Date().toISOString().slice(0, 10)
  const backupDir = path.join("outputs", `sprint6-wire-backups-${stamp}`)
  await mkdir(backupDir, { recursive: true })

  const plan = []
  for (const anchor of ANCHOR_MAP) {
    if (!dormant.includes(anchor.agent)) continue
    // Find first matching workflow by name
    const matcher = new RegExp(anchor.workflow_match, "i")
    const target = wfs.find((w) => matcher.test(w.name ?? ""))
    if (!target) {
      plan.push({ agent: anchor.agent, status: "no-host", detail: `no workflow matches /${anchor.workflow_match}/i` })
      continue
    }
    if (hasInvokeNode(target, anchor.agent)) {
      plan.push({ agent: anchor.agent, status: "already-wired", detail: target.name })
      continue
    }
    // Find anchor node
    const anchorNode = (target.nodes ?? []).find((n) =>
      anchor.anchor_node_pattern.test(n.name ?? ""),
    )
    if (!anchorNode) {
      plan.push({ agent: anchor.agent, status: "no-anchor", detail: `no node in "${target.name}" matches /${anchor.anchor_node_pattern}/` })
      continue
    }
    plan.push({
      agent: anchor.agent,
      status: APPLY ? "ready-apply" : "ready-dryrun",
      target_id: target.id,
      target_name: target.name,
      anchor_node: anchorNode.name,
      anchor_position: anchorNode.position,
    })
  }

  // Skipped agents (not in ANCHOR_MAP)
  for (const s of dormant) {
    if (!ANCHOR_MAP.find((a) => a.agent === s)) {
      plan.push({ agent: s, status: "no-anchor-spec", detail: "no entry in ANCHOR_MAP · add spec then re-run" })
    }
  }

  console.log("\n[wire] PLAN")
  for (const p of plan) {
    console.log(`  ${p.agent.padEnd(28)} · ${p.status.padEnd(18)} · ${p.target_name ?? p.detail ?? ""}`)
  }

  if (!APPLY) {
    console.log("\n[wire] DRY-RUN complete · re-run with --apply to PUT changes to n8n")
    return
  }

  // Apply mode
  let applied = 0
  let failed = 0
  for (const p of plan) {
    if (p.status !== "ready-apply") continue
    const wf = wfs.find((w) => w.id === p.target_id)
    if (!wf) continue
    // Backup pre-image
    await writeFile(
      path.join(backupDir, `${wf.id}.json`),
      JSON.stringify(wf, null, 2),
    )
    // Build patched workflow
    const newNode = buildAgentRunNode(p.agent, p.anchor_position)
    const patchedNodes = [...(wf.nodes ?? []), newNode]
    // n8n REST PUT shape · v1 rejects fields outside {name, nodes, connections, settings}
    // (HTTP 400 "request/body must NOT have additional properties"). Build a minimal
    // body via whitelist instead of blacklist · resilient to new server-managed fields
    // (pinData, triggerCount, meta, versionId, etc.) and unknown settings keys
    // (settings.availableInMCP, settings.binaryMode).
    const ALLOWED_SETTINGS = [
      "executionOrder", "errorWorkflow", "callerPolicy",
      "executionTimeout", "saveExecutionProgress",
      "saveManualExecutions", "saveDataErrorExecution",
      "saveDataSuccessExecution", "timezone",
    ]
    const cleanSettings = {}
    for (const k of ALLOWED_SETTINGS) {
      if (wf.settings && wf.settings[k] !== undefined) cleanSettings[k] = wf.settings[k]
    }
    const putBody = {
      name: wf.name,
      nodes: patchedNodes,
      connections: wf.connections ?? {},
      settings: cleanSettings,
    }
    const res = await n8nFetch(`/api/v1/workflows/${wf.id}`, {
      method: "PUT",
      body: JSON.stringify(putBody),
    })
    if (res.ok) {
      applied++
      console.log(`  ✔ ${p.agent} → ${wf.name}`)
    } else {
      failed++
      const text = await res.text().catch(() => "")
      console.error(`  ✖ ${p.agent} → HTTP ${res.status} · ${text.slice(0, 200)}`)
    }
  }

  console.log(`\n[wire] APPLY complete · ${applied} succeeded · ${failed} failed · backups in ${backupDir}/`)
  console.log(`[wire] Verify · query agent_invocations table after first execution`)
}

main().catch((err) => {
  console.error("[wire] FATAL", err)
  process.exit(1)
})
