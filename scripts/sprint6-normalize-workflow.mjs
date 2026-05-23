#!/usr/bin/env node
/**
 * scripts/sprint6-normalize-workflow.mjs · Sprint 6 Track B · CC#2
 *
 * Normalize n8n workflow JSON to current schema requirements ·
 *   1. splitOut nodes · ensure fieldToSplitOut is set (infer from predecessor)
 *   2. scheduleTrigger · convert string `rule` → object `{ interval: [{ field: "cronExpression", expression }] }`
 *   3. Connections · normalize { node } → { node, type, index } for PUT
 *
 * Usage · `node scripts/sprint6-normalize-workflow.mjs <id_prefix> [more]`
 *
 * Reports per workflow · what was patched · then PUTs + activates.
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

const N8N_BASE = env.N8N_BASE_URL || 'https://n8n-production-72be.up.railway.app'
const N8N_KEY = env.N8N_API_KEY
if (!N8N_KEY) { console.error('FAIL · missing N8N_API_KEY'); process.exit(2) }

const headers = { 'X-N8N-API-KEY': N8N_KEY, 'Content-Type': 'application/json' }
const prefixes = process.argv.slice(2)
if (prefixes.length === 0) { console.error('usage · <id_prefix>...'); process.exit(2) }

const list = await fetch(`${N8N_BASE}/api/v1/workflows?limit=250`, { headers })
const allWorkflows = (await list.json()).data ?? []

const SPLIT_FIELD_HINTS = {
  clients: ['client', 'cliente', 'load active clients'],
  pages: ['page', 'stale', 'geo content'],
  data: ['query', 'fetch', 'rows'],
  items: [],
}

for (const prefix of prefixes) {
  const wf = allWorkflows.find((w) => (w.id ?? '').startsWith(prefix))
  if (!wf) {
    console.error(`SKIP · prefix "${prefix}" not found`)
    continue
  }
  console.log(`\n=== ${wf.id}  ${wf.name} ===`)

  const detailRes = await fetch(`${N8N_BASE}/api/v1/workflows/${wf.id}`, { headers })
  if (!detailRes.ok) {
    console.error(`  FAIL get detail · ${detailRes.status}`)
    continue
  }
  const detail = await detailRes.json()
  const nodes = detail.nodes ?? []
  const patches = []

  // ─── Patch 1 · splitOut fieldToSplitOut ──────────────────────────────────
  for (const node of nodes) {
    if (node.type !== 'n8n-nodes-base.splitOut') continue
    const params = node.parameters ?? {}
    if (params.fieldToSplitOut) continue
    const preceding = findPrecedingNode(detail, node.name)
    let field = 'items'
    if (preceding?.parameters?.jsCode) {
      const code = preceding.parameters.jsCode
      const m = code.match(/return\s*\[\s*\{\s*json\s*:\s*\{\s*(\w+)\s*:/)
      if (m) field = m[1]
    }
    if (!field || field === 'items') {
      const lowerName = node.name.toLowerCase()
      for (const [hint, kws] of Object.entries(SPLIT_FIELD_HINTS)) {
        if (kws.some((kw) => lowerName.includes(kw))) { field = hint; break }
      }
    }
    node.parameters = { ...params, fieldToSplitOut: field }
    patches.push(`splitOut "${node.name}" → fieldToSplitOut="${field}"`)
  }

  // ─── Patch 2 · scheduleTrigger rule string → object ──────────────────────
  for (const node of nodes) {
    if (node.type !== 'n8n-nodes-base.scheduleTrigger') continue
    const params = node.parameters ?? {}
    if (typeof params.rule === 'string') {
      const cron = params.rule
      node.parameters = {
        ...params,
        rule: { interval: [{ field: 'cronExpression', expression: cron }] },
      }
      patches.push(`scheduleTrigger "${node.name}" · rule "${cron}" → object form`)
    } else if (params.rule?.interval && Array.isArray(params.rule.interval)) {
      // already correct shape · check entries have field+expression
      const intervals = params.rule.interval.map((it) => {
        if (it.field && it.expression !== undefined) return it
        // legacy shape · try to convert
        if (typeof it === 'string') return { field: 'cronExpression', expression: it }
        return it
      })
      node.parameters = { ...params, rule: { interval: intervals } }
    }
  }

  if (patches.length === 0) {
    console.log('  no patches applied · workflow already normalized')
  } else {
    for (const p of patches) console.log(`  patched · ${p}`)
  }

  // ─── Connections normalize for PUT ───────────────────────────────────────
  const normalizedConnections = {}
  for (const [src, conns] of Object.entries(detail.connections ?? {})) {
    normalizedConnections[src] = {}
    for (const [branch, arrays] of Object.entries(conns ?? {})) {
      normalizedConnections[src][branch] = (arrays ?? []).map((arr) =>
        (arr ?? []).map((c) => ({
          node: c.node,
          type: c.type ?? 'main',
          index: typeof c.index === 'number' ? c.index : 0,
        })),
      )
    }
  }

  if (patches.length === 0) {
    // No body patches needed · just try activate
    const actRes = await fetch(`${N8N_BASE}/api/v1/workflows/${wf.id}/activate`, {
      method: 'POST',
      headers,
    })
    if (actRes.ok) {
      console.log(`  ACTIVATE OK · status ${actRes.status}`)
    } else {
      console.log(`  ACTIVATE FAIL · ${actRes.status} · ${(await actRes.text()).slice(0, 200)}`)
    }
    continue
  }

  // PUT updated workflow
  const updateBody = {
    name: detail.name,
    nodes: detail.nodes,
    connections: normalizedConnections,
    settings: detail.settings ?? {},
  }
  const updateRes = await fetch(`${N8N_BASE}/api/v1/workflows/${wf.id}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify(updateBody),
  })
  if (!updateRes.ok) {
    console.error(`  PUT FAIL · ${updateRes.status} · ${(await updateRes.text()).slice(0, 300)}`)
    continue
  }
  console.log(`  PUT OK · status ${updateRes.status}`)

  // Activate
  const actRes = await fetch(`${N8N_BASE}/api/v1/workflows/${wf.id}/activate`, {
    method: 'POST',
    headers,
  })
  if (actRes.ok) {
    console.log(`  ACTIVATE OK · status ${actRes.status}`)
  } else {
    console.error(`  ACTIVATE FAIL · ${actRes.status} · ${(await actRes.text()).slice(0, 300)}`)
  }
}

console.log('\n--- post-normalize verify ---')
const verifyRes = await fetch(`${N8N_BASE}/api/v1/workflows?limit=250&active=true`, { headers })
console.log(`active count now: ${(await verifyRes.json()).data?.length ?? '?'}`)

function findPrecedingNode(workflow, targetNodeName) {
  const connections = workflow.connections ?? {}
  for (const [sourceName, sourceConns] of Object.entries(connections)) {
    for (const branch of sourceConns?.main ?? []) {
      for (const conn of branch ?? []) {
        if (conn?.node === targetNodeName) {
          return workflow.nodes.find((n) => n.name === sourceName)
        }
      }
    }
  }
  return null
}
