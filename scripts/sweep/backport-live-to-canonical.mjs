#!/usr/bin/env node
/**
 * backport-live-to-canonical.mjs
 *
 * Sprint 11 Ola 1 · §149 BACKPORT-FIRST · reconciliar live → canonical.
 *
 * For each workflow with drift (per RESULTS-CC2-Fase4-live-DIFF-raw.json),
 * pulls the LIVE n8n JSON via REST and writes a canonical-shape replacement
 * to the canonical file path. Workflow-level wholesale replace · captures
 * every node/connection/setting that lives in production but is missing
 * from the repo.
 *
 * Classification (read from drift raw.json) ·
 *  - 🟢 nodes with classification ∈ {live-only, no-canonical-match}
 *    → legitimate fix · backport via wholesale workflow replace
 *  - 🔴 nodes with classification = 'neither' (pristine bug)
 *    → STILL part of the workflow being reconciled, but flagged separately
 *      as needing a dedicated Fase 2B fix (do NOT count as "fix"-backport)
 *
 * Default · `--dry-preview` mode · shows what would change without writing
 *   `--apply` mode · writes the canonical files in-place
 *
 * READ-ONLY against n8n · pulls JSON only · NO PUT / NO mutation of prod.
 *
 * Output · stdout report + per-workflow file writes (apply mode).
 *
 * Env required ·
 *   N8N_API_KEY · n8n personal API key (JWT)
 *   N8N_BASE_URL · e.g. https://n8n-production-72be.up.railway.app
 *
 * Usage ·
 *   node scripts/sweep/backport-live-to-canonical.mjs --dry-preview
 *   node scripts/sweep/backport-live-to-canonical.mjs --apply
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname, relative } from 'node:path'

const REPO_ROOT = process.cwd()
const N8N_BASE_URL = (process.env.N8N_BASE_URL ?? '').replace(/\/$/, '')
const N8N_API_KEY = process.env.N8N_API_KEY ?? ''

const VAULT_DIR = process.env.VAULT_DIR ??
  'C:/Users/emili/OneDrive/Documents/zr-vault/00-meta/opus-4-8-traspaso'
const RAW_JSON_PATH = join(VAULT_DIR, 'RESULTS-CC2-Fase4-live-DIFF-raw.json')

const args = process.argv.slice(2)
const MODE = args.includes('--apply') ? 'apply' : 'dry-preview'

if (!N8N_API_KEY || !N8N_BASE_URL) {
  console.error('ERROR · N8N_API_KEY + N8N_BASE_URL required in env')
  process.exit(2)
}

// Canonical workflow JSON shape · only these keys live in canonical files.
// Live JSON has additional fields (id, active, createdAt, updatedAt, meta,
// pinData, shared, staticData, isArchived, activeVersion*) that we strip.
const CANONICAL_KEYS = ['name', 'nodes', 'connections', 'settings', 'tags', 'triggerCount', 'versionId']

function buildCanonicalShape(liveWorkflow) {
  const out = {}
  for (const k of CANONICAL_KEYS) {
    if (k in liveWorkflow) out[k] = liveWorkflow[k]
  }
  return out
}

async function fetchLiveWorkflow(id) {
  const url = `${N8N_BASE_URL}/api/v1/workflows/${id}`
  const res = await fetch(url, { headers: { 'X-N8N-API-KEY': N8N_API_KEY } })
  if (!res.ok) {
    throw new Error(`n8n GET workflow ${id} · ${res.status} ${res.statusText}`)
  }
  return await res.json()
}

function pickCanonicalPath(diffWorkflow) {
  // Prefer the path that was selected as best-match in Fase 4 (first in
  // canonical_paths). Fall back to whatever's listed if multiple variants.
  return diffWorkflow.canonical_paths?.[0] ?? null
}

function summarizeBackport(diffWorkflow) {
  const c = diffWorkflow.classifications
  const greenCount = (c['live-only'] ?? 0) + (c['no-canonical-match'] ?? 0)
  const redCount = c['neither'] ?? 0
  return { greenCount, redCount }
}

async function main() {
  console.error(`[backport] mode=${MODE}`)
  console.error(`[backport] loading drift raw.json from ${RAW_JSON_PATH}`)
  const raw = JSON.parse(readFileSync(RAW_JSON_PATH, 'utf8'))

  // Filter to workflows with agent nodes + at least one drift node
  const candidates = raw.workflows.filter(wf => {
    if (wf.agent_nodes_total === 0) return false
    const c = wf.classifications
    const drift = (c['live-only'] ?? 0) + (c['no-canonical-match'] ?? 0) + (c['neither'] ?? 0)
    return drift > 0
  })

  console.error(`[backport] candidates · ${candidates.length} workflows with drift`)

  // Bug-only filter · workflows where ALL drift nodes are 🔴 'neither' (pristine
  // bug) get SKIPPED per spec "NO backportear ciego" (Emilio §144 dispatch).
  // The buggy nodes get flagged separately for Fase 2B dedicated fix · canonical
  // file is NOT overwritten so any non-drift canonical content (sticky notes,
  // docs, position adjustments) is preserved untouched.
  const skipBugOnly = []
  const toBackport = []
  for (const wf of candidates) {
    const c = wf.classifications
    const green = (c['live-only'] ?? 0) + (c['no-canonical-match'] ?? 0)
    if (green === 0 && (c['neither'] ?? 0) > 0) {
      skipBugOnly.push(wf)
    } else {
      toBackport.push(wf)
    }
  }
  console.error(`[backport] to backport · ${toBackport.length}`)
  console.error(`[backport] skip bug-only · ${skipBugOnly.length} (flagged · NOT touched)`)

  const stats = {
    workflows_processed: 0,
    workflows_written: 0,
    workflows_skipped_no_canonical: 0,
    workflows_skipped_fetch_error: 0,
    workflows_skipped_bug_only: skipBugOnly.length,
    green_nodes_backported: 0,
    red_nodes_flagged: 0,
    bug_flags: [],
    per_workflow: [],
  }

  // Flag bug-only workflows up-front (no fetch · no write · just record)
  for (const wf of skipBugOnly) {
    for (const node of wf.nodes) {
      if (node.classification === 'neither') {
        stats.bug_flags.push({
          workflow: wf.name,
          live_id: wf.live_id,
          node_name: node.node_name,
          endpoint: node.endpoint,
          reason: 'pristine bug · neither live nor canonical has workflow_id · workflow SKIPPED from backport · target Fase 2B dedicated fix',
          backport_status: 'skipped-bug-only-workflow',
        })
        stats.red_nodes_flagged++
      }
    }
    stats.per_workflow.push({
      name: wf.name,
      live_id: wf.live_id,
      canonical_path: pickCanonicalPath(wf),
      green: 0,
      red: wf.classifications['neither'] ?? 0,
      action: 'SKIPPED-BUG-ONLY',
      existing_bytes: 0,
      new_bytes: 0,
      delta_bytes: 0,
      live_node_count: 0,
    })
  }

  for (const wf of toBackport) {
    stats.workflows_processed++
    const canonicalRel = pickCanonicalPath(wf)
    if (!canonicalRel) {
      stats.workflows_skipped_no_canonical++
      console.error(`[backport] SKIP · ${wf.name} · no canonical path match`)
      continue
    }
    const canonicalPath = join(REPO_ROOT, canonicalRel)

    let liveJson
    try {
      liveJson = await fetchLiveWorkflow(wf.live_id)
    } catch (err) {
      stats.workflows_skipped_fetch_error++
      console.error(`[backport] FETCH FAIL · ${wf.name} (${wf.live_id}) · ${err.message}`)
      continue
    }

    const canonicalShape = buildCanonicalShape(liveJson)
    const serialized = JSON.stringify(canonicalShape, null, 2) + '\n'

    // Track stats · green here · red comes from the per-node flag loop below
    const { greenCount, redCount } = summarizeBackport(wf)
    stats.green_nodes_backported += greenCount

    // Flag any red nodes that ride along with green ones (mixed-drift workflows)
    for (const node of wf.nodes) {
      if (node.classification === 'neither') {
        stats.bug_flags.push({
          workflow: wf.name,
          live_id: wf.live_id,
          node_name: node.node_name,
          endpoint: node.endpoint,
          reason: 'pristine bug · neither live nor canonical has workflow_id · workflow IS backported (mixed drift) · this node target Fase 2B dedicated fix',
          backport_status: 'flagged-rides-along-with-green',
        })
        stats.red_nodes_flagged++
      }
    }

    // Compare existing canonical vs new shape
    let existingSize = 0
    let existingContent = ''
    try {
      existingContent = readFileSync(canonicalPath, 'utf8')
      existingSize = existingContent.length
    } catch {
      // canonical file doesn't exist · treat as create
    }

    const changed = existingContent !== serialized
    const action = changed ? (MODE === 'apply' ? 'WRITE' : 'WOULD-WRITE') : 'no-change'

    stats.per_workflow.push({
      name: wf.name,
      live_id: wf.live_id,
      canonical_path: canonicalRel,
      green: greenCount,
      red: redCount,
      action,
      existing_bytes: existingSize,
      new_bytes: serialized.length,
      delta_bytes: serialized.length - existingSize,
      live_node_count: liveJson.nodes?.length ?? 0,
    })

    if (MODE === 'apply' && changed) {
      try { mkdirSync(dirname(canonicalPath), { recursive: true }) } catch {}
      writeFileSync(canonicalPath, serialized, 'utf8')
      stats.workflows_written++
      console.error(`[backport] WROTE · ${canonicalRel} · ${liveJson.nodes?.length ?? 0} nodes · Δ ${serialized.length - existingSize} bytes`)
    } else if (MODE === 'dry-preview') {
      console.error(`[backport] DRY · ${canonicalRel} · ${liveJson.nodes?.length ?? 0} nodes · would Δ ${serialized.length - existingSize} bytes · 🟢${greenCount} 🔴${redCount}`)
    } else {
      console.error(`[backport] NO-CHANGE · ${canonicalRel}`)
    }
  }

  // Final report
  console.log('\n=== BACKPORT SUMMARY ===')
  console.log(`Mode · ${MODE}`)
  console.log(`Workflows processed · ${stats.workflows_processed}`)
  console.log(`Workflows written · ${stats.workflows_written}`)
  console.log(`Workflows skipped (no canonical) · ${stats.workflows_skipped_no_canonical}`)
  console.log(`Workflows skipped (fetch error) · ${stats.workflows_skipped_fetch_error}`)
  console.log(`Workflows skipped (bug-only · NOT touched per spec) · ${stats.workflows_skipped_bug_only}`)
  console.log(`🟢 nodes backported · ${stats.green_nodes_backported}`)
  console.log(`🔴 nodes flagged (NO backport · separate fix) · ${stats.red_nodes_flagged}`)
  if (stats.bug_flags.length > 0) {
    console.log('\nBug flags (🔴) ·')
    for (const flag of stats.bug_flags) {
      console.log(`  - ${flag.workflow} :: ${flag.node_name} (${flag.endpoint})`)
      console.log(`      ${flag.reason}`)
    }
  }
  console.log('\nPer-workflow detail ·')
  for (const w of stats.per_workflow) {
    console.log(`  ${w.action} · ${w.canonical_path} · nodes=${w.live_node_count} · 🟢${w.green} 🔴${w.red} · Δ${w.delta_bytes}b`)
  }

  // Persist machine-readable report
  const reportPath = join(VAULT_DIR, `RESULTS-CC2-backport-${MODE}.json`)
  writeFileSync(reportPath, JSON.stringify(stats, null, 2), 'utf8')
  console.error(`[backport] wrote ${reportPath}`)
}

main().catch(err => {
  console.error('FATAL ·', err.stack || err.message || err)
  process.exit(1)
})
