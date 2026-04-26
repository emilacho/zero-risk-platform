#!/usr/bin/env node
/**
 * SLUG NORMALIZER — underscore → hyphen for agent slugs in n8n workflows.
 *
 * Problem (S33 parte 5): workflows reference agent slugs with underscores
 * (email_marketer, creative_director) while the canonical system uses hyphens
 * (email-marketer, creative-director). This causes Camino III dual-reviewer
 * to silently skip those agents (whitelist lookup fails on mismatch).
 * Effective Camino III coverage before fix: 13% (2/15 whitelist agents).
 *
 * How agent slugs appear in workflow JSON:
 *   - HTTP Request nodes POSTing to /api/agents/run contain a body field
 *     (jsonBody, body, or bodyParameters) with { "agent": "email_marketer", ... }
 *   - This patcher scans node.parameters string fields directly (not after
 *     JSON.stringify, which double-escapes inner quotes and breaks detection).
 *   - It uses regex /"?agent"?\s*:\s*"?([a-z][a-z0-9_-]+)"?/ on each
 *     string-valued parameter.
 *
 * Usage:
 *   node scripts/smoke-test/patch-wf-slug-normalize.mjs              # dry-run (default)
 *   node scripts/smoke-test/patch-wf-slug-normalize.mjs --apply      # apply patches to n8n
 *   node scripts/smoke-test/patch-wf-slug-normalize.mjs --name "RSA" # filter by name
 *
 * Outputs:
 *   out/wf-slug-audit-<ts>.md      — pre-fix audit table (always written)
 *   out/wf-slug-applied-<ts>.md    — log of applied changes (only with --apply)
 *   out/wf-slug-orphans-<ts>.md    — underscore slugs with no canonical match
 */

import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'fs'
import { resolve, dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { endpoints } from './lib/env.mjs'
import { fetchJson } from './lib/fetch.mjs'
import { listN8nWorkflows, fetchWorkflowDetail } from './lib/workflows.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT_DIR = resolve(__dirname, 'out')
if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true })

const ep = endpoints()
const H = { 'X-N8N-API-KEY': ep.N8N_API_KEY, 'Content-Type': 'application/json', 'Accept': 'application/json' }

const APPLY = process.argv.includes('--apply')
const nameFilterIdx = process.argv.indexOf('--name')
const NAME_FILTER = nameFilterIdx >= 0 ? process.argv[nameFilterIdx + 1] : null
const TS = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)

// ── Canonical slug registry ────────────────────────────────────

const IDENTIDADES_ROOT = resolve(__dirname, '..', '..', '..', 'docs', '04-agentes', 'identidades')

function loadCanonicalSlugs() {
  if (!existsSync(IDENTIDADES_ROOT)) {
    console.error(`ERROR: identidades dir not found at ${IDENTIDADES_ROOT}`)
    process.exit(1)
  }
  const slugs = new Set()
  const entries = readdirSync(IDENTIDADES_ROOT, { withFileTypes: true })
  for (const e of entries) {
    if (e.isFile() && e.name.endsWith('.md')) {
      const slug = e.name.replace(/\.md$/, '')
      if (slug === 'MANIFEST' || slug === 'GUIA_DE_IDENTIDADES') continue
      slugs.add(slug)
    }
    if (e.isDirectory()) {
      try {
        for (const f of readdirSync(join(IDENTIDADES_ROOT, e.name))) {
          if (f.endsWith('.md')) slugs.add(f.replace(/\.md$/, ''))
        }
      } catch {}
    }
  }
  return slugs
}

const CANONICAL_SLUGS = loadCanonicalSlugs()  // Set<string> of hyphen slugs

// underscore-slug → hyphen-slug map (only slugs that actually contain hyphens)
const UNDERSCORE_TO_HYPHEN = new Map()
// hyphen-slug set for quick lookup
const HYPHEN_SET = new Set(CANONICAL_SLUGS)

for (const slug of CANONICAL_SLUGS) {
  if (!slug.includes('-')) continue
  UNDERSCORE_TO_HYPHEN.set(slug.replaceAll('-', '_'), slug)
}

console.log(`\nCanonical slugs: ${CANONICAL_SLUGS.size}`)
console.log(`Normalizable pairs (hyphen↔underscore): ${UNDERSCORE_TO_HYPHEN.size}`)
console.log(`Mode: ${APPLY ? 'APPLY' : 'DRY-RUN'}`)
if (NAME_FILTER) console.log(`Filter: "${NAME_FILTER}"`)
console.log()

// ── Parameter string extraction ────────────────────────────────

/**
 * Collect all string-valued fields in node.parameters that could
 * contain agent slug references. Returns array of { field, val }.
 */
function extractStringParams(params) {
  const out = []
  if (!params) return out
  // Direct string fields
  for (const key of ['jsonBody', 'body', 'jsCode', 'value', 'url', 'resource', 'operation']) {
    if (typeof params[key] === 'string') out.push({ field: key, val: params[key] })
  }
  // headerParameters / bodyParameters — array of {name, value}
  for (const container of ['headerParameters', 'bodyParameters', 'queryParameters']) {
    const arr = params[container]?.parameters
    if (Array.isArray(arr)) {
      for (const item of arr) {
        if (item.name && typeof item.value === 'string') {
          out.push({ field: `${container}.${item.name}`, val: item.value })
        }
      }
    }
  }
  return out
}

// Regex: matches "agent": "some_slug" or agent: 'some_slug' etc.
const AGENT_FIELD_RE = /["]?agent["]?\s*:\s*["]([a-z][a-z0-9_-]+)["]/g

/**
 * Scan a node's string parameters for agent slug references.
 * Returns array of { field, slug, canonical, isUnderscore } per match.
 */
function scanNode(node) {
  const hits = []
  const strParams = extractStringParams(node.parameters)
  for (const { field, val } of strParams) {
    AGENT_FIELD_RE.lastIndex = 0
    let m
    while ((m = AGENT_FIELD_RE.exec(val)) !== null) {
      const slug = m[1]
      const isUnderscore = slug.includes('_') && UNDERSCORE_TO_HYPHEN.has(slug)
      const isHyphen = HYPHEN_SET.has(slug)
      const isOrphan = slug.includes('_') && !UNDERSCORE_TO_HYPHEN.has(slug)
      if (isUnderscore || isHyphen) {
        hits.push({
          field,
          slug,
          canonical: isUnderscore ? UNDERSCORE_TO_HYPHEN.get(slug) : slug,
          isUnderscore,
          isHyphen,
          isOrphan: false,
        })
      } else if (isOrphan) {
        hits.push({ field, slug, canonical: null, isUnderscore: false, isHyphen: false, isOrphan: true })
      }
    }
  }
  return hits
}

// ── Patch logic ────────────────────────────────────────────────

/**
 * Patch all string params in a node: replace underscore slugs with hyphen.
 * Returns { patchedNode, changes[] }
 */
function patchNode(node) {
  const changes = []
  const patched = JSON.parse(JSON.stringify(node))  // deep clone
  const strParams = extractStringParams(node.parameters)

  for (const { field, val } of strParams) {
    let newVal = val
    for (const [underscoreSlug, hyphenSlug] of UNDERSCORE_TO_HYPHEN) {
      // Replace all quoted occurrences: "email_marketer" → "email-marketer"
      const before = newVal
      newVal = newVal.replaceAll(`"${underscoreSlug}"`, `"${hyphenSlug}"`)
      // Also handle single-quoted: 'email_marketer' → 'email-marketer'
      newVal = newVal.replaceAll(`'${underscoreSlug}'`, `'${hyphenSlug}'`)
      if (newVal !== before) {
        changes.push({ node: node.name, field, from: underscoreSlug, to: hyphenSlug })
      }
    }
    if (newVal !== val) {
      // Write back through the proper path
      setNestedParam(patched.parameters, field, newVal)
    }
  }
  return { patchedNode: patched, changes }
}

/** Write a patched value back into the parameters object given a field path. */
function setNestedParam(params, field, val) {
  if (['jsonBody', 'body', 'jsCode', 'value', 'url', 'resource', 'operation'].includes(field)) {
    params[field] = val
    return
  }
  // container.name form e.g. bodyParameters.agent
  const dotIdx = field.indexOf('.')
  if (dotIdx >= 0) {
    const container = field.slice(0, dotIdx)
    const itemName = field.slice(dotIdx + 1)
    const arr = params[container]?.parameters
    if (Array.isArray(arr)) {
      const item = arr.find(i => i.name === itemName)
      if (item) item.value = val
    }
  }
}

// ── Main discovery loop ────────────────────────────────────────

const { workflows, error: listErr } = await listN8nWorkflows()
if (listErr) { console.error(`ERROR listing workflows: ${listErr}`); process.exit(1) }

const targets = workflows.filter(w => {
  if (NAME_FILTER && !w.name.toLowerCase().includes(NAME_FILTER.toLowerCase())) return false
  return true
})

console.log(`Workflows found: ${workflows.length}, scanning: ${targets.length}\n`)

// Audit data
const auditRows = []         // { workflowId, workflowName, active, slugActual, slugCanonical, position, action }
const orphanSlugs = new Set()
const wfDetails = new Map()  // id → wf JSON (for apply phase)

for (const w of targets) {
  if (!w.active) {
    auditRows.push({ workflowId: w.id, workflowName: w.name, active: false, slugActual: '-', slugCanonical: '-', position: '-', action: 'SKIP_INACTIVE' })
    console.log(`  ⊘ INACTIVE   ${w.name}`)
    continue
  }

  const detail = await fetchWorkflowDetail(w.id)
  if (!detail.ok || !detail.json?.nodes) {
    auditRows.push({ workflowId: w.id, workflowName: w.name, active: true, slugActual: '-', slugCanonical: '-', position: '-', action: 'FETCH_FAILED' })
    console.log(`  ✗ FETCH_ERR  ${w.name} (${detail.status})`)
    continue
  }
  const wf = detail.json
  wfDetails.set(w.id, wf)

  let wfHasRef = false
  let wfNeedsPatch = false

  for (const node of wf.nodes) {
    const hits = scanNode(node)
    for (const hit of hits) {
      if (hit.isOrphan) {
        orphanSlugs.add(hit.slug)
        console.log(`  ⚠ ORPHAN     ${w.name} | [${node.name}] "${hit.slug}" — no identity file`)
        continue
      }
      wfHasRef = true
      if (hit.isUnderscore) {
        wfNeedsPatch = true
        auditRows.push({
          workflowId: w.id, workflowName: w.name, active: true,
          slugActual: hit.slug, slugCanonical: hit.canonical,
          position: `${node.name} (${node.type.split('.').pop()}) .${hit.field}`,
          action: 'NEEDS_PATCH',
        })
        console.log(`  ✎ PATCH      ${w.name} | [${node.name}] "${hit.slug}" → "${hit.canonical}"`)
      } else {
        auditRows.push({
          workflowId: w.id, workflowName: w.name, active: true,
          slugActual: hit.slug, slugCanonical: hit.slug,
          position: `${node.name} (${node.type.split('.').pop()}) .${hit.field}`,
          action: 'SKIP_ALREADY_HYPHEN',
        })
      }
    }
  }

  if (!wfHasRef) {
    auditRows.push({ workflowId: w.id, workflowName: w.name, active: true, slugActual: '-', slugCanonical: '-', position: '-', action: 'NO_AGENT_REF' })
    console.log(`  ·  NO_REF    ${w.name}`)
  } else if (!wfNeedsPatch) {
    console.log(`  ✓ OK         ${w.name}`)
  }
}

// ── Build audit table ──────────────────────────────────────────

const needsPatch = auditRows.filter(r => r.action === 'NEEDS_PATCH')
const alreadyOk  = auditRows.filter(r => r.action === 'SKIP_ALREADY_HYPHEN')
const noRef      = auditRows.filter(r => r.action === 'NO_AGENT_REF')
const inactive   = auditRows.filter(r => r.action === 'SKIP_INACTIVE')
const fetchFail  = auditRows.filter(r => r.action === 'FETCH_FAILED')
const uniquePatchWfs = new Set(needsPatch.map(r => r.workflowId))

const auditMd = `# Workflow Slug Audit — Pre-Fix
**Fecha:** ${new Date().toISOString()}
**Modo:** ${APPLY ? 'APPLY' : 'DRY-RUN'}
**Canonical slugs:** ${CANONICAL_SLUGS.size} · **Normalizable pairs:** ${UNDERSCORE_TO_HYPHEN.size}

## Summary

| Categoría | Workflows | Refs |
|---|---|---|
| Necesitan patch (underscore→hyphen) | ${uniquePatchWfs.size} | ${needsPatch.length} |
| Ya en hyphen (ok) | ${new Set(alreadyOk.map(r=>r.workflowId)).size} | ${alreadyOk.length} |
| Sin referencia a agente | ${noRef.length} | — |
| Inactivos (skip) | ${inactive.length} | — |
| Fetch fallido | ${fetchFail.length} | — |
| Slugs huérfanos (sin identity file) | — | ${orphanSlugs.size} |
| **Total scaneados** | **${targets.length}** | |

## Refs que necesitan patch (NEEDS_PATCH)

| workflow_id | workflow_name | slug_actual | slug_canonico_propuesto | posición en JSON |
|---|---|---|---|---|
${needsPatch.length > 0
  ? needsPatch.map(r =>
    `| \`${r.workflowId}\` | ${r.workflowName} | \`${r.slugActual}\` | \`${r.slugCanonical}\` | ${r.position} |`
  ).join('\n')
  : '| — | — | — | — | — |'}

## Refs ya en hyphen (SKIP_ALREADY_HYPHEN)

| workflow_id | workflow_name | slug | posición |
|---|---|---|---|
${alreadyOk.length > 0
  ? alreadyOk.map(r => `| \`${r.workflowId}\` | ${r.workflowName} | \`${r.slugActual}\` | ${r.position} |`).join('\n')
  : '| — | — | — | — |'}

## Workflows sin referencia a agente

| workflow_id | workflow_name |
|---|---|
${noRef.map(r => `| \`${r.workflowId}\` | ${r.workflowName} |`).join('\n') || '| — | — |'}

## Workflows inactivos (skip)

| workflow_id | workflow_name |
|---|---|
${inactive.map(r => `| \`${r.workflowId}\` | ${r.workflowName} |`).join('\n') || '| — | — |'}

## Slugs huérfanos (underscore, sin identity file) → CC#2

Ver: \`out/wf-slug-orphans-${TS}.md\` · Total: **${orphanSlugs.size}**
${orphanSlugs.size > 0 ? Array.from(orphanSlugs).sort().map(s => `- \`${s}\``).join('\n') : '_Ninguno_'}
`

const auditPath = join(OUT_DIR, `wf-slug-audit-${TS}.md`)
writeFileSync(auditPath, auditMd, 'utf-8')
console.log(`\n✓ Audit written: ${auditPath}`)

// ── Orphans file ───────────────────────────────────────────────

const orphansMd = `# Workflow Slug Orphans — sin identity file
**Fecha:** ${new Date().toISOString()}
**Generado por:** patch-wf-slug-normalize.mjs (S33 parte 5 → Sprint #2 P0-A)

Slugs que aparecen como \`"agent": "slug"\` en workflows n8n activos
pero NO tienen identity file en \`docs/04-agentes/identidades/\`.
**NO se parchean.** Lista para CC#2 / Cowork.

Total: ${orphanSlugs.size}

${orphanSlugs.size > 0
  ? Array.from(orphanSlugs).sort().map(s => `- \`${s}\``).join('\n')
  : '_Ninguno detectado._'}
`
const orphansPath = join(OUT_DIR, `wf-slug-orphans-${TS}.md`)
writeFileSync(orphansPath, orphansMd, 'utf-8')
console.log(`✓ Orphans written: ${orphansPath}`)

// ── Dry-run summary ────────────────────────────────────────────

if (!APPLY) {
  console.log(`\n=== DRY-RUN SUMMARY ===`)
  console.log(`Workflows to patch:        ${uniquePatchWfs.size}`)
  console.log(`Slug refs to rewrite:      ${needsPatch.length}`)
  console.log(`Already-hyphen (no touch): ${alreadyOk.length}`)
  console.log(`Orphan slugs (CC#2):       ${orphanSlugs.size}`)
  console.log(`\nRun with --apply to execute patches.`)
  if (orphanSlugs.size > 0) {
    console.log(`\nREPORTE A COWORK: slugs huérfanos detectados, lista en out/wf-slug-orphans-${TS}.md, total ${orphanSlugs.size}`)
  }
  process.exit(0)
}

// ── APPLY ──────────────────────────────────────────────────────

console.log(`\n=== APPLYING PATCHES ===`)
const appliedLog = []
let appliedWfs = 0
let appliedRefs = 0

for (const wfId of uniquePatchWfs) {
  const wfName = needsPatch.find(r => r.workflowId === wfId)?.workflowName || wfId
  const wf = wfDetails.get(wfId)
  if (!wf) {
    console.log(`\n✗ ${wfName}: detail not cached, re-fetching...`)
    const d = await fetchWorkflowDetail(wfId)
    if (!d.ok) { appliedLog.push({ workflowId: wfId, workflowName: wfName, status: 'FETCH_FAILED', changes: [] }); continue }
    wfDetails.set(wfId, d.json)
  }

  const wfFull = wfDetails.get(wfId)
  console.log(`\nPatching: ${wfName} (${wfId})`)

  // Patch each node
  const patchedNodes = []
  const wfChanges = []
  for (const node of wfFull.nodes) {
    const { patchedNode, changes } = patchNode(node)
    patchedNodes.push(patchedNode)
    for (const c of changes) {
      wfChanges.push(c)
      console.log(`  ✎ [${c.node}] .${c.field}: "${c.from}" → "${c.to}"`)
    }
  }

  if (wfChanges.length === 0) {
    console.log(`  · no changes made (already patched?)`)
    appliedLog.push({ workflowId: wfId, workflowName: wfName, status: 'NO_CHANGE', changes: [] })
    continue
  }

  // PUT
  const putBody = {
    name: wfFull.name,
    nodes: patchedNodes,
    connections: wfFull.connections,
    settings: wfFull.settings || { executionOrder: 'v1' },
    staticData: wfFull.staticData || null,
  }
  const put = await fetchJson(ep.n8n + '/api/v1/workflows/' + wfId, {
    method: 'PUT', headers: H,
    body: JSON.stringify(putBody),
  })

  if (!put.ok) {
    console.log(`  ✗ PUT ${put.status}: ${put.text?.slice(0, 300) || put.error}`)
    appliedLog.push({ workflowId: wfId, workflowName: wfName, status: `PUT_FAIL_${put.status}`, changes: wfChanges })
    continue
  }

  console.log(`  ✓ PUT 200`)
  appliedWfs++
  appliedRefs += wfChanges.length
  appliedLog.push({ workflowId: wfId, workflowName: wfName, status: 'PATCHED', changes: wfChanges })

  // Reactivate
  await fetchJson(ep.n8n + '/api/v1/workflows/' + wfId + '/deactivate', { method: 'POST', headers: H, body: '{}' })
  await new Promise(r => setTimeout(r, 600))
  await fetchJson(ep.n8n + '/api/v1/workflows/' + wfId + '/activate', { method: 'POST', headers: H, body: '{}' })
  console.log(`  ✓ reactivated`)
}

// ── Applied log file ───────────────────────────────────────────

const appliedRows = appliedLog.flatMap(entry =>
  entry.changes.length > 0
    ? entry.changes.map(c => `| \`${entry.workflowId}\` | ${entry.workflowName} | ${entry.status} | \`${c.from}\` | \`${c.to}\` | [${c.node}] .${c.field} |`)
    : [`| \`${entry.workflowId}\` | ${entry.workflowName} | ${entry.status} | — | — | — |`]
)

const appliedMd = `# Workflow Slug Applied Log
**Fecha:** ${new Date().toISOString()}

## Summary

| Métrica | Valor |
|---|---|
| Workflows patched | ${appliedWfs} |
| Total refs rewritten | ${appliedRefs} |
| Errors | ${appliedLog.filter(e => e.status.includes('FAIL')).length} |

## Detalle

| workflow_id | workflow_name | status | from | to | posición |
|---|---|---|---|---|---|
${appliedRows.join('\n') || '| — | — | — | — | — | — |'}
`

const appliedPath = join(OUT_DIR, `wf-slug-applied-${TS}.md`)
writeFileSync(appliedPath, appliedMd, 'utf-8')
console.log(`\n✓ Applied log written: ${appliedPath}`)

console.log(`\n=== APPLY SUMMARY ===`)
console.log(`Workflows patched: ${appliedWfs}`)
console.log(`Total refs rewritten: ${appliedRefs}`)
console.log(`Errors: ${appliedLog.filter(e => e.status.includes('FAIL')).length}`)

if (orphanSlugs.size > 0) {
  console.log(`\nREPORTE A COWORK: slugs huérfanos detectados, lista en out/wf-slug-orphans-${TS}.md, total ${orphanSlugs.size}`)
}
