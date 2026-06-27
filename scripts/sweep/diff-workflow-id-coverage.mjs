#!/usr/bin/env node
/**
 * diff-workflow-id-coverage.mjs
 *
 * Fase 1 helper for the §149 workflow_id coverage fix-list (Sprint 11 Ola 1).
 *
 * Walks the n8n-workflows/ tree, finds every node that invokes `/api/agents/run`
 * or `/api/agents/run-sdk`, and reports whether the node's jsonBody already
 * injects the `workflow_id` + `workflow_execution_id` templates. Optional
 * `--live <dir>` flag points at a directory of JSON snapshots fetched from the
 * n8n REST API (CC#3 produces those in their own task · this script consumes
 * them without re-fetching · avoids contending for the n8n instance).
 *
 * READ-ONLY · NO network calls · NO file mutations · only stdout report.
 *
 * Usage:
 *   node scripts/sweep/diff-workflow-id-coverage.mjs                    # canonical only
 *   node scripts/sweep/diff-workflow-id-coverage.mjs --live ./snapshot  # canonical vs live DIFF
 *   node scripts/sweep/diff-workflow-id-coverage.mjs --json             # machine-readable output
 *
 * Output (default markdown):
 *   - per-file matrix · #agent-call nodes · #with-wfid · #without-wfid
 *   - per-node detail for nodes missing the template (file:line, node name, url)
 *   - aggregate counts · ready/needs-patch/exempt
 *   - if --live: per-file drift table (canonical-vs-live)
 *
 * Spec · RESULTS-CC2-workflow-id-coverage-audit-fix-list.md (Fase 1).
 * Cross-ref · ADR-008-EXTENDED v2 §2.1 (validateWorkflowId gate).
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, basename } from 'node:path'

const REPO_ROOT = process.cwd()

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------

const args = process.argv.slice(2)
const liveArg = args.find(a => a.startsWith('--live='))
const liveDir = liveArg ? liveArg.replace('--live=', '') : args.includes('--live') ? args[args.indexOf('--live') + 1] : null
const outputJson = args.includes('--json')
const verbose = args.includes('--verbose') || args.includes('-v')

// ---------------------------------------------------------------------------
// JSON parse · BOM-safe (n8n exports sometimes include UTF-8 BOM)
// ---------------------------------------------------------------------------

function parseJsonFile(filePath) {
  try {
    let raw = readFileSync(filePath, 'utf8')
    if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1)
    return JSON.parse(raw)
  } catch (e) {
    return { __parseError: e.message }
  }
}

// ---------------------------------------------------------------------------
// Agent-call node detection
// ---------------------------------------------------------------------------

const AGENT_URL_PATTERNS = [
  /\/api\/agents\/run-sdk/,
  /\/api\/agents\/run(?![a-zA-Z0-9_-])/,  // /api/agents/run (not /run-sdk)
]

function isAgentCallNode(node) {
  if (!node || node.type !== 'n8n-nodes-base.httpRequest') return null
  const url = node.parameters?.url
  if (typeof url !== 'string') return null
  for (const pattern of AGENT_URL_PATTERNS) {
    if (pattern.test(url)) {
      return pattern.source.includes('run-sdk') ? 'run-sdk' : 'run'
    }
  }
  return null
}

/**
 * Inspect a node's jsonBody template string for workflow_id + execution_id
 * presence. Returns coverage details.
 *
 * Patterns we accept as "covered" (canon per ADR-008-EXT v2 §2.1 + audit fix-list):
 *   - Top-level: `"workflow_id":"{{ $workflow.id }}"` (run-sdk style)
 *   - Nested in context: `"context":{ "workflow_id":"{{ $workflow.id }}"` (run legacy)
 *   - Nested in extra: `"extra":{ "workflow_id":"{{ $workflow.id }}"` (run-sdk alt)
 *   - Hardcoded UUID (acceptable but flagged as non-templated)
 */
function analyzeJsonBody(jsonBody, endpoint) {
  if (typeof jsonBody !== 'string') {
    return { has_workflow_id: false, has_execution_id: false, body_present: false }
  }

  // Look for workflow_id key with various value patterns
  const hasWorkflowIdTemplate = /"workflow_id"\s*:\s*"?\{\{\s*\$workflow\.id\s*\}\}/i.test(jsonBody)
  const hasWorkflowIdAny = /"workflow_id"\s*:/i.test(jsonBody)
  const hasExecutionIdTemplate = /"(?:workflow_)?execution_id"\s*:\s*"?\{\{\s*\$execution\.id\s*\}\}/i.test(jsonBody)
  const hasExecutionIdAny = /"(?:workflow_)?execution_id"\s*:/i.test(jsonBody)

  // Detect placement (top-level vs nested in context/extra)
  let placement = 'unknown'
  if (hasWorkflowIdAny) {
    // Very rough · look for sibling-to-agent vs nested in context/extra blocks
    // jsonBody is a single string · we can't really parse it cleanly without
    // executing the template engine. Heuristic only.
    if (/"context"\s*:\s*\{[^}]*"workflow_id"/i.test(jsonBody)) placement = 'context'
    else if (/"extra"\s*:\s*\{[^}]*"workflow_id"/i.test(jsonBody)) placement = 'extra'
    else placement = 'top-level'
  }

  return {
    body_present: true,
    has_workflow_id: hasWorkflowIdAny,
    has_workflow_id_template: hasWorkflowIdTemplate,
    has_execution_id: hasExecutionIdAny,
    has_execution_id_template: hasExecutionIdTemplate,
    placement,
    expected_placement: endpoint === 'run' ? 'context' : 'top-level',
    correct_placement: placement === (endpoint === 'run' ? 'context' : 'top-level'),
  }
}

// ---------------------------------------------------------------------------
// Per-workflow analysis
// ---------------------------------------------------------------------------

function analyzeWorkflow(filePath, source = 'canonical') {
  const wf = parseJsonFile(filePath)
  if (wf.__parseError) {
    return { error: wf.__parseError, path: filePath, source }
  }

  const name = wf.name || basename(filePath, '.json')
  const liveId = wf.id || null // live snapshots from n8n REST GET include `id`
  const nodes = wf.nodes || []

  const agentNodes = []
  for (const node of nodes) {
    const endpoint = isAgentCallNode(node)
    if (!endpoint) continue
    const coverage = analyzeJsonBody(node.parameters?.jsonBody, endpoint)
    agentNodes.push({
      node_id: node.id || null,
      node_name: node.name || null,
      endpoint,
      url: node.parameters?.url || null,
      ...coverage,
    })
  }

  const total = agentNodes.length
  const covered = agentNodes.filter(n =>
    n.has_workflow_id_template && n.has_execution_id_template && n.correct_placement,
  ).length
  const partial = agentNodes.filter(n =>
    (n.has_workflow_id || n.has_execution_id) && !(
      n.has_workflow_id_template && n.has_execution_id_template && n.correct_placement
    ),
  ).length
  const missing = total - covered - partial

  return {
    name,
    path: filePath,
    source,
    live_id: liveId,
    agent_nodes_total: total,
    agent_nodes_covered: covered,
    agent_nodes_partial: partial,
    agent_nodes_missing: missing,
    nodes: agentNodes,
  }
}

// ---------------------------------------------------------------------------
// Directory walker · accepts canonical or live snapshot dir
// ---------------------------------------------------------------------------

function walkJsonFiles(dir) {
  const out = []
  let entries
  try {
    entries = readdirSync(dir)
  } catch (e) {
    return out
  }
  for (const ent of entries) {
    const p = join(dir, ent)
    let s
    try {
      s = statSync(p)
    } catch {
      continue
    }
    if (s.isDirectory()) {
      out.push(...walkJsonFiles(p))
    } else if (ent.endsWith('.json') && !ent.endsWith('.meta.json')) {
      out.push(p)
    }
  }
  return out
}

// ---------------------------------------------------------------------------
// Drift detection · canonical vs live
// ---------------------------------------------------------------------------

function buildLiveIndex(liveResults) {
  // Index by live_id and by name (live snapshots have stable ids · canonical
  // files have stable names · we match by name as fallback)
  const byId = new Map()
  const byName = new Map()
  for (const r of liveResults) {
    if (r.live_id) byId.set(r.live_id, r)
    if (r.name) byName.set(r.name, r)
  }
  return { byId, byName }
}

function matchCanonicalToLive(canonical, liveIndex) {
  // Try id match first (if canonical has it), then name match
  if (canonical.live_id && liveIndex.byId.has(canonical.live_id)) {
    return liveIndex.byId.get(canonical.live_id)
  }
  if (liveIndex.byName.has(canonical.name)) {
    return liveIndex.byName.get(canonical.name)
  }
  return null
}

function diffWorkflow(canonical, live) {
  if (!live) {
    return { drift_type: 'CANONICAL_ONLY', canonical, live: null }
  }
  // Compare agent-node coverage
  const cCov = canonical.agent_nodes_covered
  const lCov = live.agent_nodes_covered
  const cTot = canonical.agent_nodes_total
  const lTot = live.agent_nodes_total
  if (cTot !== lTot) {
    return { drift_type: 'NODE_COUNT_DIVERGES', canonical, live }
  }
  if (cCov !== lCov) {
    return { drift_type: 'COVERAGE_DIVERGES', canonical, live }
  }
  return { drift_type: 'ALIGNED', canonical, live }
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

function formatMarkdown(canonicalResults, liveResults, drift) {
  const lines = []
  lines.push('# Fase 1 · DIFF workflow_id coverage report\n')
  lines.push(`Generated · ${new Date().toISOString()}`)
  lines.push(`Canonical scanned · ${canonicalResults.length} files`)
  if (liveResults) lines.push(`Live snapshot scanned · ${liveResults.length} files`)
  lines.push('')

  // Aggregate canonical
  const totalNodes = canonicalResults.reduce((s, r) => s + (r.agent_nodes_total ?? 0), 0)
  const totalCovered = canonicalResults.reduce((s, r) => s + (r.agent_nodes_covered ?? 0), 0)
  const totalPartial = canonicalResults.reduce((s, r) => s + (r.agent_nodes_partial ?? 0), 0)
  const totalMissing = canonicalResults.reduce((s, r) => s + (r.agent_nodes_missing ?? 0), 0)
  const pctCovered = totalNodes > 0 ? ((totalCovered / totalNodes) * 100).toFixed(1) : '0.0'

  lines.push('## Aggregate (canonical)\n')
  lines.push(`- **Agent-call httpRequest nodes total** · ${totalNodes}`)
  lines.push(`- ✅ **Fully covered** (workflow_id + execution_id template · correct placement) · ${totalCovered} (${pctCovered}%)`)
  lines.push(`- ⚠️ **Partial** (some workflow_id present but missing/incomplete) · ${totalPartial}`)
  lines.push(`- 🔴 **Missing** (no workflow_id at all) · ${totalMissing}`)
  lines.push('')

  // Per-file matrix
  lines.push('## Per-workflow matrix (canonical)\n')
  lines.push('| Status | Workflow | Path | Agent nodes (cov/part/miss) |')
  lines.push('|--------|----------|------|---------------------------:|')
  const sorted = canonicalResults
    .filter(r => !r.error && (r.agent_nodes_total ?? 0) > 0)
    .sort((a, b) => (a.agent_nodes_missing || 0) > 0 || (b.agent_nodes_missing || 0) > 0
      ? (b.agent_nodes_missing || 0) - (a.agent_nodes_missing || 0)
      : a.name.localeCompare(b.name))
  for (const r of sorted) {
    const status = r.agent_nodes_missing > 0 ? '🔴' : r.agent_nodes_partial > 0 ? '⚠️' : '✅'
    const cov = `${r.agent_nodes_covered}/${r.agent_nodes_partial}/${r.agent_nodes_missing} of ${r.agent_nodes_total}`
    lines.push(`| ${status} | ${r.name.slice(0, 60)} | ${relative(REPO_ROOT, r.path)} | ${cov} |`)
  }
  lines.push('')

  // Per-node detail for nodes missing the template
  const allMissingNodes = []
  for (const r of canonicalResults) {
    if (!r.nodes) continue
    for (const n of r.nodes) {
      if (!n.has_workflow_id_template || !n.has_execution_id_template || !n.correct_placement) {
        allMissingNodes.push({ workflow: r.name, path: r.path, ...n })
      }
    }
  }
  if (allMissingNodes.length > 0) {
    lines.push(`## Per-node detail · ${allMissingNodes.length} nodes need patching\n`)
    lines.push('| Workflow | Node name | Endpoint | Has wf_id? | Has exec_id? | Placement | Expected |')
    lines.push('|----------|-----------|----------|------------|--------------|-----------|----------|')
    for (const n of allMissingNodes.slice(0, 250)) {
      const wfid = n.has_workflow_id_template ? '✅ template' : n.has_workflow_id ? '⚠️ non-template' : '🔴 missing'
      const exid = n.has_execution_id_template ? '✅ template' : n.has_execution_id ? '⚠️ non-template' : '🔴 missing'
      lines.push(`| ${n.workflow.slice(0, 40)} | ${(n.node_name || '?').slice(0, 30)} | ${n.endpoint} | ${wfid} | ${exid} | ${n.placement} | ${n.expected_placement} |`)
    }
    if (allMissingNodes.length > 250) {
      lines.push(`| ... | ${allMissingNodes.length - 250} more nodes truncated | | | | | |`)
    }
    lines.push('')
  }

  // Drift section (only if live provided)
  if (drift) {
    lines.push('## Drift canonical-vs-live\n')
    const driftCounts = {
      ALIGNED: drift.filter(d => d.drift_type === 'ALIGNED').length,
      COVERAGE_DIVERGES: drift.filter(d => d.drift_type === 'COVERAGE_DIVERGES').length,
      NODE_COUNT_DIVERGES: drift.filter(d => d.drift_type === 'NODE_COUNT_DIVERGES').length,
      CANONICAL_ONLY: drift.filter(d => d.drift_type === 'CANONICAL_ONLY').length,
    }
    lines.push(`- ✅ Aligned · ${driftCounts.ALIGNED}`)
    lines.push(`- ⚠️ Coverage diverges · ${driftCounts.COVERAGE_DIVERGES}`)
    lines.push(`- 🔴 Node count diverges · ${driftCounts.NODE_COUNT_DIVERGES}`)
    lines.push(`- 🟡 Canonical only (not in live) · ${driftCounts.CANONICAL_ONLY}`)
    lines.push('')

    const divergent = drift.filter(d => d.drift_type !== 'ALIGNED')
    if (divergent.length > 0) {
      lines.push('### Divergent workflows\n')
      lines.push('| Drift type | Workflow | Canonical cov | Live cov |')
      lines.push('|------------|----------|--------------:|---------:|')
      for (const d of divergent) {
        const cName = d.canonical?.name?.slice(0, 60) || '(canonical missing)'
        const cCov = d.canonical ? `${d.canonical.agent_nodes_covered}/${d.canonical.agent_nodes_total}` : '-'
        const lCov = d.live ? `${d.live.agent_nodes_covered}/${d.live.agent_nodes_total}` : '-'
        lines.push(`| ${d.drift_type} | ${cName} | ${cCov} | ${lCov} |`)
      }
    }
  } else {
    lines.push('## Drift canonical-vs-live\n')
    lines.push('_Not computed · run with `--live <dir>` once CC#3 produces the n8n live snapshot._')
  }
  lines.push('')

  return lines.join('\n')
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  const canonicalDir = join(REPO_ROOT, 'n8n-workflows')
  const canonicalFiles = walkJsonFiles(canonicalDir)
  const canonicalResults = canonicalFiles.map(p => analyzeWorkflow(p, 'canonical'))

  let liveResults = null
  let drift = null
  if (liveDir) {
    const liveAbsDir = liveDir.startsWith('/') || /^[A-Z]:/.test(liveDir) ? liveDir : join(REPO_ROOT, liveDir)
    const liveFiles = walkJsonFiles(liveAbsDir)
    if (liveFiles.length === 0) {
      console.error(`[diff-wfid] WARN · --live ${liveAbsDir} had 0 JSON files · skipping drift section`)
    } else {
      liveResults = liveFiles.map(p => analyzeWorkflow(p, 'live'))
      const liveIndex = buildLiveIndex(liveResults)
      drift = canonicalResults
        .filter(r => !r.error && (r.agent_nodes_total ?? 0) > 0)
        .map(c => diffWorkflow(c, matchCanonicalToLive(c, liveIndex)))
    }
  }

  if (outputJson) {
    console.log(JSON.stringify({ canonicalResults, liveResults, drift }, null, 2))
  } else {
    console.log(formatMarkdown(canonicalResults, liveResults, drift))
  }
}

main()
