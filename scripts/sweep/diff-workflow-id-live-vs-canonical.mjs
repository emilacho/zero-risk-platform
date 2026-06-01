#!/usr/bin/env node
/**
 * diff-workflow-id-live-vs-canonical.mjs
 *
 * Sprint 11 Ola 1 · §149 Fase 4 · live-DIFF + drift report.
 *
 * Pulls every ACTIVE n8n workflow via the live REST API and compares each
 * agent-call httpRequest node's `workflow_id` template injection coverage
 * against the canonical JSON files in `n8n-workflows/`. Emits per-node
 * classification:
 *
 *  - both   · live ✓ + canonical ✓ → aligned, no action
 *  - live-only · live ✓ + canonical ✗ → deployed patch not merged back to repo
 *                                       (Sprint 8D Journey B pattern)
 *  - canonical-only · live ✗ + canonical ✓ → repo patched, n8n not synced
 *                                            (rare · re-import pending)
 *  - neither · live ✗ + canonical ✗ → bug · needs Fase 2 batch patch
 *  - no-canonical · live workflow has no canonical match (drift orphan)
 *
 * READ-ONLY · does NOT mutate n8n or files. Output written to:
 *  - zr-vault/00-meta/opus-4-8-traspaso/RESULTS-CC2-Fase4-live-DIFF-drift-report.md
 *  - zr-vault/00-meta/opus-4-8-traspaso/RESULTS-CC2-Fase4-live-DIFF-raw.json
 *
 * Usage · `node scripts/sweep/diff-workflow-id-live-vs-canonical.mjs`
 *
 * Env required ·
 *   N8N_API_KEY · n8n personal API key (JWT)
 *   N8N_BASE_URL · e.g. https://n8n-production-72be.up.railway.app
 */
import { readFileSync, readdirSync, statSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, relative } from 'node:path'

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const REPO_ROOT = process.cwd()
const N8N_BASE_URL = (process.env.N8N_BASE_URL ?? '').replace(/\/$/, '')
const N8N_API_KEY = process.env.N8N_API_KEY ?? ''
const CANONICAL_DIR = join(REPO_ROOT, 'n8n-workflows')

const VAULT_DIR = process.env.VAULT_DIR ??
  'C:/Users/emili/OneDrive/Documents/zr-vault/00-meta/opus-4-8-traspaso'

if (!N8N_API_KEY || !N8N_BASE_URL) {
  console.error('ERROR · N8N_API_KEY + N8N_BASE_URL required in env')
  process.exit(2)
}

// Endpoints we consider "agent-call" · these are the routes that hit the
// agent runtime and MUST have a workflow_id (canon §149).
const AGENT_RUN_PATTERNS = [
  /\/api\/agents\/run-sdk/,
  /\/api\/agents\/run(?![-_\w])/, // /api/agents/run but NOT run-sdk (matched above)
]

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function walkJsonFiles(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry)
    const st = statSync(p)
    if (st.isDirectory()) walkJsonFiles(p, out)
    else if (st.isFile() && p.endsWith('.json')) out.push(p)
  }
  return out
}

function isAgentCallNode(node) {
  if (node.type !== 'n8n-nodes-base.httpRequest') return false
  const url = node.parameters?.url ?? ''
  if (typeof url !== 'string') return false
  return AGENT_RUN_PATTERNS.some(rx => rx.test(url))
}

function endpointSlug(url) {
  if (typeof url !== 'string') return 'unknown'
  if (/\/api\/agents\/run-sdk/.test(url)) return 'run-sdk'
  if (/\/api\/agents\/run(?!-)/.test(url)) return 'run'
  return 'other'
}

/**
 * Detect whether a node's parameters carry a workflow_id template injection.
 *
 * We accept several canonical placement patterns observed across the repo:
 *  - `parameters.jsonBody` string contains `"workflow_id"` AND a `{{ $workflow.id }}`-style expression
 *  - `parameters.bodyParameters.parameters[]` contains a key=workflow_id entry
 *  - `parameters.body.parameters[]` (newer n8n version) contains workflow_id
 *
 * Returns { hasWfId: bool, hasExecId: bool, placement: 'jsonBody' | 'bodyParameters' | 'unknown' }
 */
function detectWorkflowIdInjection(node) {
  const p = node.parameters ?? {}
  let hasWfId = false
  let hasExecId = false
  let placement = 'unknown'

  const jb = p.jsonBody ?? p.body
  if (typeof jb === 'string') {
    if (/\bworkflow_id\b/.test(jb) && /\$workflow\.id/.test(jb)) hasWfId = true
    if (/\bworkflow_execution_id\b/.test(jb) && /\$execution\.id/.test(jb)) hasExecId = true
    if (hasWfId || hasExecId) placement = 'jsonBody'
  }

  const bp = p.bodyParameters?.parameters ?? p.body?.parameters
  if (Array.isArray(bp)) {
    for (const kv of bp) {
      const name = kv?.name ?? ''
      const value = String(kv?.value ?? '')
      if (name === 'workflow_id' && /\$workflow\.id/.test(value)) {
        hasWfId = true
        if (placement === 'unknown') placement = 'bodyParameters'
      }
      if (name === 'workflow_execution_id' && /\$execution\.id/.test(value)) {
        hasExecId = true
        if (placement === 'unknown') placement = 'bodyParameters'
      }
      // Some payloads nest workflow_id inside a context object · also count it.
      if (name === 'context' && /workflow_id/.test(value) && /\$workflow\.id/.test(value)) {
        hasWfId = true
        if (placement === 'unknown') placement = 'bodyParameters-context'
      }
    }
  }

  return { hasWfId, hasExecId, placement }
}

async function fetchLiveWorkflows() {
  const url = `${N8N_BASE_URL}/api/v1/workflows?active=true&limit=250`
  const res = await fetch(url, { headers: { 'X-N8N-API-KEY': N8N_API_KEY } })
  if (!res.ok) {
    throw new Error(`n8n list workflows · ${res.status} ${res.statusText}`)
  }
  const json = await res.json()
  return json.data ?? []
}

// ---------------------------------------------------------------------------
// Load canonical files
// ---------------------------------------------------------------------------

function loadCanonical() {
  const files = walkJsonFiles(CANONICAL_DIR)
  const byName = new Map() // name → { path, workflow }
  const skipped = []
  for (const f of files) {
    let json
    try {
      json = JSON.parse(readFileSync(f, 'utf8'))
    } catch (err) {
      skipped.push({ file: relative(REPO_ROOT, f), reason: 'parse-error' })
      continue
    }
    if (!json?.name || !Array.isArray(json.nodes)) {
      skipped.push({ file: relative(REPO_ROOT, f), reason: 'no-name-or-nodes' })
      continue
    }
    // Some workflows have multiple canonical variants (e.g. sub-workflow-refs).
    // Keep all under the same name as a list so the diff can pick the closest match.
    const existing = byName.get(json.name) ?? []
    existing.push({ path: relative(REPO_ROOT, f), workflow: json })
    byName.set(json.name, existing)
  }
  return { byName, fileCount: files.length, skipped }
}

// ---------------------------------------------------------------------------
// Per-workflow diff
// ---------------------------------------------------------------------------

function classifyNode(liveDetect, canonicalDetect) {
  const live = liveDetect?.hasWfId ?? false
  const canon = canonicalDetect?.hasWfId ?? false
  if (live && canon) return 'both'
  if (live && !canon) return 'live-only'
  if (!live && canon) return 'canonical-only'
  return 'neither'
}

function diffWorkflow(liveWf, canonicalVariants) {
  const liveAgentNodes = liveWf.nodes.filter(isAgentCallNode)
  const result = {
    name: liveWf.name,
    live_id: liveWf.id,
    live_active: liveWf.active === true,
    canonical_paths: canonicalVariants ? canonicalVariants.map(v => v.path) : [],
    canonical_present: Boolean(canonicalVariants && canonicalVariants.length > 0),
    agent_nodes_total: liveAgentNodes.length,
    classifications: { both: 0, 'live-only': 0, 'canonical-only': 0, neither: 0, 'no-canonical-match': 0 },
    nodes: [],
  }

  if (liveAgentNodes.length === 0) {
    return result // no agent-call surface · skip diff
  }

  // Pick best canonical variant · prefer one with the most matching node names.
  let bestCanonical = null
  if (canonicalVariants && canonicalVariants.length > 0) {
    let bestScore = -1
    for (const variant of canonicalVariants) {
      const cNames = new Set((variant.workflow.nodes ?? []).map(n => n.name))
      const score = liveAgentNodes.filter(n => cNames.has(n.name)).length
      if (score > bestScore) {
        bestScore = score
        bestCanonical = variant
      }
    }
  }

  for (const liveNode of liveAgentNodes) {
    const liveDetect = detectWorkflowIdInjection(liveNode)
    let canonicalDetect = null
    let canonicalFound = false

    if (bestCanonical) {
      const cNode = bestCanonical.workflow.nodes.find(n => n.name === liveNode.name)
      if (cNode) {
        canonicalFound = true
        canonicalDetect = detectWorkflowIdInjection(cNode)
      }
    }

    let classification
    if (!bestCanonical || !canonicalFound) {
      classification = 'no-canonical-match'
    } else {
      classification = classifyNode(liveDetect, canonicalDetect)
    }
    result.classifications[classification]++

    result.nodes.push({
      node_name: liveNode.name,
      endpoint: endpointSlug(liveNode.parameters?.url ?? ''),
      live: { ...liveDetect, found: true },
      canonical: { ...(canonicalDetect ?? {}), found: canonicalFound, path: bestCanonical?.path ?? null },
      classification,
    })
  }
  return result
}

// ---------------------------------------------------------------------------
// Render markdown
// ---------------------------------------------------------------------------

function renderMarkdown(summary) {
  const lines = []
  const now = new Date().toISOString()
  lines.push(`# Sprint 11 Ola 1 · §149 Fase 4 · live-DIFF drift report`)
  lines.push('')
  lines.push(`Generated · ${now}`)
  lines.push(`Live workflows scanned (active=true) · ${summary.live_total}`)
  lines.push(`Canonical files scanned · ${summary.canonical_files}`)
  lines.push(`Workflows with at least one agent-call node · ${summary.workflows_with_agent_nodes}`)
  lines.push('')
  lines.push('## Aggregate drift classification')
  lines.push('')
  lines.push('| Class | Count | %total |')
  lines.push('|-------|------:|-------:|')
  const total = summary.aggregate.total_nodes || 1
  for (const k of ['both', 'live-only', 'canonical-only', 'neither', 'no-canonical-match']) {
    const v = summary.aggregate[k] ?? 0
    const pct = ((v / total) * 100).toFixed(1)
    lines.push(`| ${k} | ${v} | ${pct}% |`)
  }
  lines.push(`| **total agent-call nodes (live)** | **${summary.aggregate.total_nodes}** | 100% |`)
  lines.push('')

  lines.push('## Drift interpretation')
  lines.push('')
  lines.push('- **both** · workflow_id template present in BOTH live and canonical · aligned · no action')
  lines.push('- **live-only** · deployed patch NOT merged back to repo · Sprint 8D Journey B pattern · backport canonical')
  lines.push('- **canonical-only** · repo patched but n8n not re-imported · push canonical → n8n')
  lines.push('- **neither** · pristine bug · neither side has workflow_id · target for Fase 2 batch patch')
  lines.push('- **no-canonical-match** · live workflow has no canonical file match by name · orphan · canon hygiene needed')
  lines.push('')

  lines.push('## Per-workflow drift matrix')
  lines.push('')
  lines.push('| Status | Workflow | Nodes (both/live-only/canon-only/neither/no-canon) | Live ID | Canonical match |')
  lines.push('|--------|----------|---------------------------------------------------:|---------|-----------------|')

  // Sort: workflows with drift first (live-only or neither > 0), then aligned, then no-agent-nodes.
  const sorted = [...summary.workflows].sort((a, b) => {
    const aDrift = (a.classifications['live-only'] || 0) + (a.classifications['neither'] || 0) + (a.classifications['no-canonical-match'] || 0)
    const bDrift = (b.classifications['live-only'] || 0) + (b.classifications['neither'] || 0) + (b.classifications['no-canonical-match'] || 0)
    if (aDrift !== bDrift) return bDrift - aDrift
    return b.agent_nodes_total - a.agent_nodes_total
  })

  for (const wf of sorted) {
    if (wf.agent_nodes_total === 0) continue
    const c = wf.classifications
    const status = decideStatusIcon(c)
    const cnt = `${c.both}/${c['live-only']}/${c['canonical-only']}/${c.neither}/${c['no-canonical-match']}`
    const canonRef = wf.canonical_paths.length > 0 ? wf.canonical_paths[0] : '🔴 NO MATCH'
    lines.push(`| ${status} | ${escapeMd(wf.name)} | ${cnt} of ${wf.agent_nodes_total} | \`${wf.live_id}\` | ${escapeMd(canonRef)} |`)
  }

  lines.push('')
  lines.push('## Per-node detail · all drift nodes')
  lines.push('')
  lines.push('| Workflow | Node | Endpoint | Class | Live wf_id | Canon wf_id |')
  lines.push('|----------|------|----------|-------|------------|-------------|')

  for (const wf of sorted) {
    for (const n of wf.nodes) {
      if (n.classification === 'both') continue // hide aligned rows in detail
      const wfShort = wf.name.length > 50 ? wf.name.slice(0, 50) + '…' : wf.name
      lines.push(`| ${escapeMd(wfShort)} | ${escapeMd(n.node_name)} | ${n.endpoint} | ${n.classification} | ${n.live.hasWfId ? '✓' : '✗'} | ${n.canonical.found ? (n.canonical.hasWfId ? '✓' : '✗') : 'no-node'} |`)
    }
  }

  lines.push('')
  lines.push('## Workflows with NO canonical match (orphans)')
  lines.push('')
  lines.push('| Workflow | Live ID | Agent nodes |')
  lines.push('|----------|---------|------------:|')
  for (const wf of sorted) {
    if (wf.canonical_present) continue
    if (wf.agent_nodes_total === 0) continue
    lines.push(`| ${escapeMd(wf.name)} | \`${wf.live_id}\` | ${wf.agent_nodes_total} |`)
  }

  return lines.join('\n') + '\n'
}

function decideStatusIcon(c) {
  if (c.neither > 0) return '🔴' // pristine bug
  if (c['no-canonical-match'] > 0) return '🟠' // orphan
  if (c['live-only'] > 0) return '🟡' // deployed-patch not merged
  if (c['canonical-only'] > 0) return '🟣' // repo ahead of n8n
  if (c.both > 0) return '🟢' // aligned
  return '⚪' // no agent calls (shouldn't reach here · filtered)
}

function escapeMd(s) {
  return String(s).replace(/\|/g, '\\|')
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.error('[diff-workflow-id] · loading canonical files...')
  const canon = loadCanonical()
  console.error(`[diff-workflow-id] · canonical files: ${canon.fileCount} · unique names: ${canon.byName.size} · skipped: ${canon.skipped.length}`)

  console.error('[diff-workflow-id] · fetching live workflows from n8n...')
  const liveWorkflows = await fetchLiveWorkflows()
  console.error(`[diff-workflow-id] · live active workflows: ${liveWorkflows.length}`)

  const perWorkflow = []
  for (const live of liveWorkflows) {
    const canonicalVariants = canon.byName.get(live.name) ?? null
    const diff = diffWorkflow(live, canonicalVariants)
    perWorkflow.push(diff)
  }

  // Aggregate
  const aggregate = { both: 0, 'live-only': 0, 'canonical-only': 0, neither: 0, 'no-canonical-match': 0, total_nodes: 0 }
  let withAgentNodes = 0
  for (const wf of perWorkflow) {
    if (wf.agent_nodes_total > 0) withAgentNodes++
    for (const k of Object.keys(aggregate)) {
      if (k === 'total_nodes') continue
      aggregate[k] += wf.classifications[k] ?? 0
    }
    aggregate.total_nodes += wf.agent_nodes_total
  }

  const summary = {
    generated_at: new Date().toISOString(),
    live_total: liveWorkflows.length,
    canonical_files: canon.fileCount,
    canonical_unique_names: canon.byName.size,
    workflows_with_agent_nodes: withAgentNodes,
    aggregate,
    workflows: perWorkflow,
    canonical_skipped: canon.skipped,
  }

  // Output to vault
  try { mkdirSync(VAULT_DIR, { recursive: true }) } catch {}
  const jsonOut = join(VAULT_DIR, 'RESULTS-CC2-Fase4-live-DIFF-raw.json')
  const mdOut = join(VAULT_DIR, 'RESULTS-CC2-Fase4-live-DIFF-drift-report.md')
  writeFileSync(jsonOut, JSON.stringify(summary, null, 2), 'utf8')
  writeFileSync(mdOut, renderMarkdown(summary), 'utf8')
  console.error(`[diff-workflow-id] · wrote ${jsonOut}`)
  console.error(`[diff-workflow-id] · wrote ${mdOut}`)

  // Short stdout summary
  console.log(JSON.stringify({
    aggregate,
    workflows_with_agent_nodes: withAgentNodes,
    workflows_total: liveWorkflows.length,
    canonical_files: canon.fileCount,
  }, null, 2))
}

main().catch(err => {
  console.error('FATAL ·', err.stack || err.message || err)
  process.exit(1)
})
