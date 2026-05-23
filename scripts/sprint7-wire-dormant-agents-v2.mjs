#!/usr/bin/env node
/**
 * Sprint 7 A1 · enhanced wire-dormant-agents.
 *
 * Improvements over CC#4 PR #67 baseline (`sprint6-wire-dormant-agents.mjs`) ·
 *   1. Connection edge wiring · adds the new node as a side-output of the
 *      anchor node so n8n actually executes it (vs orphan node).
 *   2. Minimal PUT body · {name, nodes, connections, settings} only ·
 *      avoids n8n rejecting read-only fields (per Sprint 6 patcher canon).
 *   3. Detects pre-existing wired-name to avoid duplicate node injection
 *      across multiple runs.
 *   4. Default = APPLY when --apply flag present (no behavior change).
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import path from 'node:path'

const args = new Set(process.argv.slice(2))
const APPLY = args.has('--apply')
const AUDIT_ONLY = args.has('--audit-only')

const N8N_API_URL = process.env.N8N_API_URL ?? 'https://n8n-production-72be.up.railway.app'
const N8N_API_KEY = process.env.N8N_API_KEY
const PLATFORM_API_URL = process.env.PLATFORM_API_URL ?? 'https://zero-risk-platform.vercel.app'
if (!N8N_API_KEY) {
  console.error('FATAL · N8N_API_KEY missing')
  process.exit(2)
}

const ALIASES = {
  media_buyer: 'media-buyer',
  cro_specialist: 'cro-specialist',
  optimization_agent: 'optimization-agent',
  competitive_intelligence: 'competitive-intelligence-agent',
  'seo-geo-optimization': 'seo-specialist',
  social_adapter: 'social-media-strategist',
  editor_en_jefe: 'editor-en-jefe',
}

const MANIFEST_31 = [
  'ruflo', 'jefe-marketing', 'campaign-brief-agent', 'brand-strategist',
  'market-research', 'customer-research', 'competitive-intelligence-agent',
  'mops-director', 'content-creator', 'seo-specialist', 'media-buyer',
  'web-designer', 'video-editor', 'creative-director',
  'social-media-strategist', 'editor-en-jefe', 'community-manager',
  'influencer-manager', 'tracking-specialist', 'email-marketer',
  'crm-architect', 'review-responder', 'pr-earned-media-manager',
  'cro-specialist', 'optimization-agent', 'growth-hacker',
  'sales-enablement', 'jefe-client-success', 'account-manager',
  'onboarding-specialist', 'reporting-agent',
]

// Anchor map · canonical workflow names → target dormant agents.
// Use distinctive workflow_match patterns so a single agent's anchor doesn't
// accidentally hit Landing CRO when we mean Weekly Report (both contain
// "weekly" but only Weekly Report has "client report").
const ANCHOR_MAP = [
  { agent: 'market-research', workflow_match: 'landing cascade master', anchor_node_pattern: /scrape|discovery|fetch|extract/i },
  { agent: 'mops-director', workflow_match: 'cost watchdog', anchor_node_pattern: /aggregate|detect anomalies/i },
  { agent: 'community-manager', workflow_match: 'review severity', anchor_node_pattern: /classif|severity|tier|router/i },
  { agent: 'influencer-manager', workflow_match: 'social multi-platform', anchor_node_pattern: /publish|post|generate/i },
  { agent: 'crm-architect', workflow_match: 'account health', anchor_node_pattern: /score|compute|fetch/i },
  { agent: 'pr-earned-media-manager', workflow_match: 'review severity', anchor_node_pattern: /severity|tier|classif|router/i },
  { agent: 'jefe-client-success', workflow_match: 'account health', anchor_node_pattern: /score|tier transition|fetch/i },
  { agent: 'account-manager', workflow_match: 'weekly client report', anchor_node_pattern: /create notion|merge report/i },
  { agent: 'reporting-agent', workflow_match: 'weekly client report', anchor_node_pattern: /reporting agent|generate report|posthog/i },
  { agent: 'campaign-brief-agent', workflow_match: 'nexus 7-phase', anchor_node_pattern: /parse|validate|entry|webhook|brief/i },
]

async function n8nFetch(p, init = {}) {
  return fetch(`${N8N_API_URL}${p}`, {
    ...init,
    headers: {
      'X-N8N-API-KEY': N8N_API_KEY,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  })
}

async function listWorkflows() {
  const r = await n8nFetch('/api/v1/workflows?limit=250')
  if (!r.ok) throw new Error(`n8n list HTTP ${r.status}`)
  const j = await r.json()
  return j.data ?? []
}

function extractInvocations(wf) {
  const slugs = new Set()
  function walk(node) {
    if (typeof node === 'string') {
      for (const m of node.matchAll(/"agent"\s*:\s*"([a-zA-Z][a-zA-Z0-9_-]+)"/g)) {
        const raw = m[1]
        slugs.add(ALIASES[raw] ?? raw)
      }
    } else if (Array.isArray(node)) {
      for (const v of node) walk(v)
    } else if (node && typeof node === 'object') {
      for (const k of Object.keys(node)) walk(node[k])
    }
  }
  walk(wf)
  return slugs
}

function buildAgentRunNode(agent, anchorPosition, hostWorkflowName) {
  const nodeName = `Invoke · ${agent}`
  return {
    parameters: {
      method: 'POST',
      url: `${PLATFORM_API_URL}/api/agents/run`,
      sendHeaders: true,
      headerParameters: {
        parameters: [
          { name: 'x-api-key', value: '={{ $env.INTERNAL_API_KEY }}' },
          { name: 'Content-Type', value: 'application/json' },
        ],
      },
      sendBody: true,
      specifyBody: 'json',
      jsonBody: `={{ JSON.stringify({ agent: "${agent}", context: $json, task: "Sprint 7 A1 wire-in side-effect invocation from ${hostWorkflowName.replace(/"/g, '\\"').slice(0, 80)}" }) }}`,
      options: {
        timeout: 30000,
        response: { response: { neverError: true } },
      },
    },
    id: `wire-${agent}-${Math.random().toString(36).slice(2, 10)}`,
    name: nodeName,
    type: 'n8n-nodes-base.httpRequest',
    typeVersion: 4.2,
    position: [
      (anchorPosition?.[0] ?? 600) + 220,
      (anchorPosition?.[1] ?? 300) + 120,
    ],
  }
}

function wireAsSecondaryOutput(connections, anchorNodeName, newNodeName) {
  const out = JSON.parse(JSON.stringify(connections ?? {}))
  if (!out[anchorNodeName]) out[anchorNodeName] = { main: [] }
  if (!Array.isArray(out[anchorNodeName].main)) out[anchorNodeName].main = []
  // n8n connection shape · `main` is array-of-arrays-of-targets ·
  // outer index = output port · we add a NEW output port (parallel side-effect)
  out[anchorNodeName].main.push([{ node: newNodeName, type: 'main', index: 0 }])
  return out
}

async function main() {
  const mode = APPLY ? 'APPLY' : AUDIT_ONLY ? 'AUDIT-ONLY' : 'DRY-RUN'
  console.log(`[wire-v2] mode · ${mode}`)
  console.log(`[wire-v2] n8n · ${N8N_API_URL}`)

  const wfs = await listWorkflows()
  console.log(`[wire-v2] live workflows · ${wfs.length} · active · ${wfs.filter((w) => w.active).length}`)

  const globalInvocations = new Map()
  for (const wf of wfs) {
    const slugs = extractInvocations(wf)
    for (const s of slugs) {
      if (!globalInvocations.has(s)) globalInvocations.set(s, [])
      globalInvocations.get(s).push({ id: wf.id, name: wf.name, active: wf.active })
    }
  }
  const dormant = MANIFEST_31.filter((s) => !globalInvocations.has(s))

  console.log(`\n[wire-v2] DORMANT TRUE · ${dormant.length}`)
  dormant.forEach((s) => console.log(`  · ${s}`))
  if (AUDIT_ONLY) return

  const stamp = new Date().toISOString().slice(0, 10)
  const backupDir = path.join('outputs', `sprint7-wire-backups-${stamp}`)
  await mkdir(backupDir, { recursive: true })

  const plan = []
  for (const anchor of ANCHOR_MAP) {
    if (!dormant.includes(anchor.agent)) continue
    const matcher = new RegExp(anchor.workflow_match, 'i')
    const target = wfs.find((w) => matcher.test(w.name ?? ''))
    if (!target) {
      plan.push({ agent: anchor.agent, status: 'no-host', detail: `no workflow matches /${anchor.workflow_match}/i` })
      continue
    }
    const newNodeName = `Invoke · ${anchor.agent}`
    const alreadyHasNode = (target.nodes ?? []).some((n) => n.name === newNodeName)
    if (alreadyHasNode) {
      plan.push({ agent: anchor.agent, status: 'already-wired', detail: target.name })
      continue
    }
    const anchorNode = (target.nodes ?? []).find((n) => anchor.anchor_node_pattern.test(n.name ?? ''))
    if (!anchorNode) {
      plan.push({ agent: anchor.agent, status: 'no-anchor', detail: `no node in "${target.name}" matches /${anchor.anchor_node_pattern}/` })
      continue
    }
    plan.push({
      agent: anchor.agent,
      status: APPLY ? 'ready-apply' : 'ready-dryrun',
      target_id: target.id,
      target_name: target.name,
      anchor_node: anchorNode.name,
      anchor_position: anchorNode.position,
    })
  }

  for (const s of dormant) {
    if (!ANCHOR_MAP.find((a) => a.agent === s)) {
      plan.push({ agent: s, status: 'no-anchor-spec', detail: 'no entry in ANCHOR_MAP · add spec then re-run' })
    }
  }

  console.log('\n[wire-v2] PLAN')
  for (const p of plan) {
    console.log(`  ${p.agent.padEnd(28)} · ${p.status.padEnd(18)} · ${p.target_name ?? p.detail ?? ''}`)
  }

  if (!APPLY) {
    console.log('\n[wire-v2] DRY-RUN complete · re-run with --apply to PUT changes to n8n')
    return
  }

  let applied = 0
  let failed = 0
  const results = []
  for (const p of plan) {
    if (p.status !== 'ready-apply') {
      results.push({ ...p, applied: false, reason: 'skipped (status != ready-apply)' })
      continue
    }
    const wf = wfs.find((w) => w.id === p.target_id)
    if (!wf) {
      results.push({ ...p, applied: false, reason: 'workflow not found in snapshot' })
      continue
    }
    await writeFile(path.join(backupDir, `${wf.id}.json`), JSON.stringify(wf, null, 2))
    const newNode = buildAgentRunNode(p.agent, p.anchor_position, wf.name)
    const patchedNodes = [...(wf.nodes ?? []), newNode]
    const patchedConnections = wireAsSecondaryOutput(wf.connections, p.anchor_node, newNode.name)
    // n8n REST PUT settings field only accepts a whitelisted set ·
    // strip non-canonical keys to avoid "must NOT have additional properties".
    const ALLOWED_SETTINGS = [
      'executionOrder', 'errorWorkflow', 'callerPolicy',
      'executionTimeout', 'saveExecutionProgress',
      'saveManualExecutions', 'saveDataErrorExecution',
      'saveDataSuccessExecution', 'timezone',
    ]
    const cleanSettings = {}
    for (const k of ALLOWED_SETTINGS) {
      if (wf.settings && wf.settings[k] !== undefined) cleanSettings[k] = wf.settings[k]
    }
    const putBody = {
      name: wf.name,
      nodes: patchedNodes,
      connections: patchedConnections,
      settings: cleanSettings,
    }
    const res = await n8nFetch(`/api/v1/workflows/${wf.id}`, {
      method: 'PUT',
      body: JSON.stringify(putBody),
    })
    if (res.ok) {
      applied++
      console.log(`  ✔ ${p.agent} → ${wf.name}`)
      results.push({ ...p, applied: true, http_status: res.status })
    } else {
      failed++
      const text = await res.text().catch(() => '')
      console.error(`  ✖ ${p.agent} → HTTP ${res.status} · ${text.slice(0, 200)}`)
      results.push({ ...p, applied: false, http_status: res.status, error: text.slice(0, 200) })
    }
  }

  await writeFile('audit-data/sprint7-wire-results.json', JSON.stringify(results, null, 2))
  console.log(`\n[wire-v2] APPLY complete · ${applied} succeeded · ${failed} failed · backups in ${backupDir}/`)
}

main().catch((e) => {
  console.error('[wire-v2] FATAL', e)
  process.exit(1)
})
