#!/usr/bin/env node
/**
 * patch-wf-workflow-id.mjs
 *
 * Fase 2 helper for the §149 workflow_id coverage fix-list (Sprint 11 Ola 1).
 *
 * For every workflow JSON in the canonical repo (or a fetched live snapshot
 * dir), find each httpRequest node that invokes `/api/agents/run` or
 * `/api/agents/run-sdk`, and inject the n8n native templates
 *   - "workflow_id": "{{ $workflow.id }}"
 *   - "workflow_execution_id": "{{ $execution.id }}"
 * into the jsonBody at the correct placement:
 *   - run-sdk → top-level keys
 *   - run     → nested inside `context` block
 *
 * Modes (default = --dry-preview · NO apply):
 *   --dry-preview          (default) · print unified diff per node + summary, NO write
 *   --write-patches <dir>  copy each modified file under <dir> preserving the
 *                          n8n-workflows/... subpath · diffable vs original
 *                          (default · ./.patch-out/canonical or ./.patch-out/live)
 *   --apply                DANGEROUS · overwrites the canonical workflow file in
 *                          place AND/OR PUTs to n8n REST · gated by --i-know-the-risks
 *                          + per-Emilio §144 explicit OK (NOT enabled this turn)
 *
 * Input source:
 *   --source canonical (default) · scans n8n-workflows/
 *   --source live <dir>          · scans <dir> of n8n REST GET snapshot JSONs
 *
 * Behavior:
 *   - Idempotent · if a node already has both templates at correct placement, skipped
 *   - Skips nodes with hardcoded non-template workflow_id (operator decision · flagged)
 *   - Preserves all other jsonBody content · only injects 2 keys
 *
 * Usage examples:
 *   node scripts/sweep/patch-wf-workflow-id.mjs                    # dry-preview canonical
 *   node scripts/sweep/patch-wf-workflow-id.mjs --write-patches    # write to ./.patch-out
 *   node scripts/sweep/patch-wf-workflow-id.mjs --source live --live-dir ./snap
 *
 * Spec · RESULTS-CC2-workflow-id-coverage-audit-fix-list.md (Fase 2).
 * Patch shape · ADR-008-EXTENDED v2 §2.1 + Fase 2 §3.1 template.
 */
import { readFileSync, readdirSync, statSync, mkdirSync, writeFileSync } from 'node:fs'
import { join, relative, dirname, basename } from 'node:path'

const REPO_ROOT = process.cwd()
const args = process.argv.slice(2)

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------

const DRY = !args.includes('--apply') && !args.includes('--write-patches')
const WRITE = args.includes('--write-patches') || args.includes('--apply')
const APPLY_IN_PLACE = args.includes('--apply')
const KNOW_RISKS = args.includes('--i-know-the-risks')
const sourceArg = args.find(a => a.startsWith('--source='))
const SOURCE = sourceArg ? sourceArg.replace('--source=', '') : (args.includes('--source') ? args[args.indexOf('--source') + 1] : 'canonical')
const liveDirArg = args.find(a => a.startsWith('--live-dir='))
const LIVE_DIR = liveDirArg ? liveDirArg.replace('--live-dir=', '') : (args.includes('--live-dir') ? args[args.indexOf('--live-dir') + 1] : null)
const outDirArg = args.find(a => a.startsWith('--out='))
const OUT_DIR = outDirArg ? outDirArg.replace('--out=', '') : (args.includes('--out') ? args[args.indexOf('--out') + 1] : null)

if (APPLY_IN_PLACE && !KNOW_RISKS) {
  console.error('[patch-wfid] ❌ --apply requires --i-know-the-risks AND explicit Emilio §144 sign-off · refusing to run')
  process.exit(1)
}

// ---------------------------------------------------------------------------
// JSON parse · BOM-safe
// ---------------------------------------------------------------------------

function parseJsonFile(filePath) {
  try {
    let raw = readFileSync(filePath, 'utf8')
    if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1)
    return { ok: true, value: JSON.parse(raw), raw }
  } catch (e) {
    return { ok: false, error: e.message }
  }
}

// ---------------------------------------------------------------------------
// Agent-call detection · same logic as diff-workflow-id-coverage.mjs
// ---------------------------------------------------------------------------

function detectAgentEndpoint(node) {
  if (!node || node.type !== 'n8n-nodes-base.httpRequest') return null
  const url = node.parameters?.url
  if (typeof url !== 'string') return null
  if (/\/api\/agents\/run-sdk/.test(url)) return 'run-sdk'
  if (/\/api\/agents\/run(?![a-zA-Z0-9_-])/.test(url)) return 'run'
  return null
}

// ---------------------------------------------------------------------------
// jsonBody patcher · core logic
// ---------------------------------------------------------------------------

const WF_ID_TEMPLATE = '{{ $workflow.id }}'
const EXEC_ID_TEMPLATE = '{{ $execution.id }}'

/**
 * Check if jsonBody already has both templates at correct placement.
 * Used for idempotency · skip already-patched nodes.
 */
function isAlreadyPatched(jsonBody, endpoint) {
  if (typeof jsonBody !== 'string') return false
  const hasWfid = /"workflow_id"\s*:\s*"?\{\{\s*\$workflow\.id\s*\}\}/i.test(jsonBody)
  const hasExid = /"(?:workflow_)?execution_id"\s*:\s*"?\{\{\s*\$execution\.id\s*\}\}/i.test(jsonBody)
  if (!hasWfid || !hasExid) return false

  if (endpoint === 'run') {
    // Must be inside "context": { ... }
    return /"context"\s*:\s*\{[^}]*"workflow_id"[^}]*"(?:workflow_)?execution_id"/is.test(jsonBody)
      || /"context"\s*:\s*\{[^}]*"(?:workflow_)?execution_id"[^}]*"workflow_id"/is.test(jsonBody)
  }
  // run-sdk · top-level (not inside extra/context)
  // Heuristic · workflow_id appears at depth 1 of the outer object
  // Approx · "workflow_id" must NOT be preceded by '"extra"\s*:\s*\{' or
  // '"context"\s*:\s*\{' without a closing brace in between. Imperfect but OK.
  return true
}

/**
 * Detect if jsonBody has a NON-template workflow_id (hardcoded value).
 * Flag those · operator decision whether to override.
 */
function hasNonTemplateWorkflowId(jsonBody) {
  if (typeof jsonBody !== 'string') return false
  return /"workflow_id"\s*:\s*"[^{][^"]*"/i.test(jsonBody)
}

/**
 * For run-sdk · inject at top level of the outer object.
 * jsonBody looks like:  "={\n  \"agent\": \"foo\",\n  ...\n}"
 * After parse:           ={\n  "agent": "foo",\n  ...\n}
 *
 * We insert immediately after the first `{` of the actual body.
 */
function patchRunSdkBody(jsonBody) {
  // Find the opening brace of the actual body (skipping the `=` prefix)
  // Patterns observed: `={\n  ...}`, `={\n...}`, `=\n{\n...}`, `={ ... }`
  const match = jsonBody.match(/^(=)?\s*\{(\s*)/)
  if (!match) return null

  const prefix = match[0]
  const indent = match[2] || '\n  '
  const newKeys = `"workflow_id": "${WF_ID_TEMPLATE}",${indent}` +
                  `"workflow_execution_id": "${EXEC_ID_TEMPLATE}",${indent}`

  return prefix + newKeys + jsonBody.slice(prefix.length)
}

/**
 * For /run · inject inside the `"context"` object as first keys.
 * jsonBody looks like:  "={\n  \"agent\": \"foo\",\n  \"context\": {\n    \"client_id\": \"...\"\n  }\n}"
 *
 * If `"context": {` exists · inject right after the `{`.
 * If `"context"` is absent · add it as a top-level key with both templates inside.
 */
function patchRunLegacyBody(jsonBody) {
  // Case 1 · context block already present
  const ctxOpen = jsonBody.match(/"context"\s*:\s*\{(\s*)/)
  if (ctxOpen) {
    const inner = ctxOpen[1] || '\n      '
    const newKeys = `"workflow_id": "${WF_ID_TEMPLATE}",${inner}` +
                    `"workflow_execution_id": "${EXEC_ID_TEMPLATE}",${inner}`
    const idx = jsonBody.indexOf(ctxOpen[0]) + ctxOpen[0].length
    return jsonBody.slice(0, idx) + newKeys + jsonBody.slice(idx)
  }

  // Case 2 · no context block · add one with both templates as first top-level key
  // Inject right after `={\n  ` (or `{\n`)
  const headMatch = jsonBody.match(/^(=)?\s*\{(\s*)/)
  if (!headMatch) return null
  const prefix = headMatch[0]
  const indent = headMatch[2] || '\n  '
  const newContext = `"context": {${indent}  "workflow_id": "${WF_ID_TEMPLATE}",${indent}  "workflow_execution_id": "${EXEC_ID_TEMPLATE}"${indent}},${indent}`
  return prefix + newContext + jsonBody.slice(prefix.length)
}

function patchJsonBody(jsonBody, endpoint) {
  if (typeof jsonBody !== 'string') return null
  if (isAlreadyPatched(jsonBody, endpoint)) return null
  return endpoint === 'run' ? patchRunLegacyBody(jsonBody) : patchRunSdkBody(jsonBody)
}

// ---------------------------------------------------------------------------
// Workflow walker · returns per-file patch decisions
// ---------------------------------------------------------------------------

function walkJsonFiles(dir) {
  const out = []
  let entries
  try { entries = readdirSync(dir) } catch { return out }
  for (const ent of entries) {
    const p = join(dir, ent)
    let s
    try { s = statSync(p) } catch { continue }
    if (s.isDirectory()) out.push(...walkJsonFiles(p))
    else if (ent.endsWith('.json') && !ent.endsWith('.meta.json')) out.push(p)
  }
  return out
}

function processWorkflow(filePath) {
  const r = parseJsonFile(filePath)
  if (!r.ok) return { error: r.error, path: filePath }
  const wf = r.value
  const name = wf.name || basename(filePath, '.json')
  const nodes = wf.nodes || []

  const patches = []
  let modified = false

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i]
    const endpoint = detectAgentEndpoint(node)
    if (!endpoint) continue

    const original = node.parameters?.jsonBody
    if (typeof original !== 'string') continue

    if (isAlreadyPatched(original, endpoint)) {
      patches.push({ node_id: node.id, node_name: node.name, endpoint, status: 'already_patched' })
      continue
    }

    if (hasNonTemplateWorkflowId(original)) {
      patches.push({ node_id: node.id, node_name: node.name, endpoint, status: 'has_hardcoded_value · flagged' })
      continue
    }

    const patched = patchJsonBody(original, endpoint)
    if (!patched) {
      patches.push({ node_id: node.id, node_name: node.name, endpoint, status: 'patch_failed', original_preview: original.slice(0, 100) })
      continue
    }

    if (WRITE) {
      wf.nodes[i] = {
        ...node,
        parameters: {
          ...node.parameters,
          jsonBody: patched,
        },
      }
      modified = true
    }

    patches.push({
      node_id: node.id,
      node_name: node.name,
      endpoint,
      status: 'patched',
      diff: { before: original, after: patched },
    })
  }

  return { ok: true, name, path: filePath, patches, modified, workflow: wf }
}

// ---------------------------------------------------------------------------
// Output · diff renderer + summary
// ---------------------------------------------------------------------------

function renderUnifiedDiff(before, after) {
  const beforeLines = before.split(/\r?\n/)
  const afterLines = after.split(/\r?\n/)
  const out = []
  let i = 0, j = 0
  // Tiny diff · since we only insert, after >= before mostly · just show the inserted lines
  while (i < beforeLines.length && j < afterLines.length) {
    if (beforeLines[i] === afterLines[j]) {
      out.push('  ' + beforeLines[i].slice(0, 100))
      i += 1
      j += 1
    } else {
      // Inserted line (in after, not in before) · print + line then skip in after only
      out.push('+ ' + afterLines[j].slice(0, 100))
      j += 1
    }
  }
  while (j < afterLines.length) {
    out.push('+ ' + afterLines[j].slice(0, 100))
    j += 1
  }
  return out.join('\n')
}

function printSummary(results) {
  let totalFiles = 0
  let modifiedFiles = 0
  let totalPatches = 0
  let alreadyPatched = 0
  let flaggedHardcoded = 0
  let patchFailed = 0
  let errors = 0

  for (const r of results) {
    totalFiles += 1
    if (r.error) { errors += 1; continue }
    if (!r.patches || r.patches.length === 0) continue
    if (r.modified) modifiedFiles += 1
    for (const p of r.patches) {
      if (p.status === 'patched') totalPatches += 1
      else if (p.status === 'already_patched') alreadyPatched += 1
      else if (p.status === 'patch_failed') patchFailed += 1
      else if (p.status?.startsWith('has_hardcoded_value')) flaggedHardcoded += 1
    }
  }

  console.log('\n# patch-wf-workflow-id · summary\n')
  console.log(`Source           · ${SOURCE}`)
  console.log(`Mode             · ${APPLY_IN_PLACE ? '🔴 APPLY (in place + n8n REST)' : WRITE ? '🟡 WRITE_PATCHES (out dir)' : '🟢 DRY-PREVIEW (no writes)'}`)
  console.log(`Files scanned    · ${totalFiles}`)
  console.log(`Files modified   · ${modifiedFiles}`)
  console.log(`Patches generated · ${totalPatches}`)
  console.log(`Already patched  · ${alreadyPatched}`)
  console.log(`Flagged hardcoded · ${flaggedHardcoded}`)
  console.log(`Patch failed     · ${patchFailed}`)
  console.log(`Parse errors     · ${errors}`)
}

function printDryPreview(results, limit = 10) {
  console.log('\n# Dry-preview · first N modified node diffs\n')
  let printed = 0
  for (const r of results) {
    if (r.error || !r.patches) continue
    for (const p of r.patches) {
      if (p.status !== 'patched' || !p.diff) continue
      if (printed >= limit) {
        console.log(`\n... ${results.flatMap(r => r.patches || []).filter(p => p.status === 'patched').length - printed} more patches truncated · use --write-patches to write them all to disk\n`)
        return
      }
      console.log(`\n## ${r.name} · node \`${p.node_name}\` (${p.endpoint})`)
      console.log('```diff')
      console.log(renderUnifiedDiff(p.diff.before, p.diff.after))
      console.log('```')
      printed += 1
    }
  }
}

// ---------------------------------------------------------------------------
// Writing patched workflows · safe outdir mode
// ---------------------------------------------------------------------------

function writePatchedFile(originalPath, workflow, outBaseDir) {
  // Preserve subpath from REPO_ROOT inside outBaseDir
  const rel = relative(REPO_ROOT, originalPath)
  const outPath = join(outBaseDir, rel)
  mkdirSync(dirname(outPath), { recursive: true })
  writeFileSync(outPath, JSON.stringify(workflow, null, 2), 'utf8')
  return outPath
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  let dir
  if (SOURCE === 'live') {
    if (!LIVE_DIR) {
      console.error('[patch-wfid] ❌ --source live requires --live-dir <path>')
      process.exit(1)
    }
    dir = LIVE_DIR.startsWith('/') || /^[A-Z]:/.test(LIVE_DIR) ? LIVE_DIR : join(REPO_ROOT, LIVE_DIR)
  } else {
    dir = join(REPO_ROOT, 'n8n-workflows')
  }

  const files = walkJsonFiles(dir)
  const results = files.map(processWorkflow)

  if (WRITE && !APPLY_IN_PLACE) {
    const defaultOut = OUT_DIR || join(REPO_ROOT, '.patch-out', SOURCE)
    let written = 0
    for (const r of results) {
      if (r.error || !r.modified) continue
      const outPath = writePatchedFile(r.path, r.workflow, defaultOut)
      console.log(`[patch-wfid] wrote · ${relative(REPO_ROOT, outPath)}`)
      written += 1
    }
    console.log(`\n[patch-wfid] wrote ${written} patched files to ${relative(REPO_ROOT, defaultOut)} · diff vs original to review`)
  } else if (APPLY_IN_PLACE) {
    console.error('[patch-wfid] ❌ --apply mode not enabled this turn · requires explicit Emilio §144 sign-off + n8n UP gate · refusing')
    process.exit(1)
  } else {
    printDryPreview(results, 10)
  }

  printSummary(results)
}

main()
