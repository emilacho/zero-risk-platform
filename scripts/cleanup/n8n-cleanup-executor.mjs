#!/usr/bin/env node
/**
 * n8n-cleanup-executor.mjs
 * Wave 11 · CC#2 · Cleanup script for n8n workflows
 *
 * Executes (or dry-runs) actions defined in cleanup-plan.json against the
 * n8n public API. Backs up each workflow JSON before any state-changing call.
 *
 * Idempotent: if a workflow's current state already matches the desired
 * post-action state, the action is logged as "noop" and no API call is made.
 *
 * Usage:
 *   node scripts/cleanup/n8n-cleanup-executor.mjs                          # dry-run, all phases
 *   node scripts/cleanup/n8n-cleanup-executor.mjs --execute                # actually mutate live n8n
 *   node scripts/cleanup/n8n-cleanup-executor.mjs --phase=0-disable-stubs  # only one phase
 *   node scripts/cleanup/n8n-cleanup-executor.mjs --action=disable         # only disable actions
 *   node scripts/cleanup/n8n-cleanup-executor.mjs --workflow=k6rZK9...     # only one workflow
 *   node scripts/cleanup/n8n-cleanup-executor.mjs --plan=path/to/other.json # alternate plan file
 *
 * Safety rails:
 *   - Default mode is dry-run (must pass --execute to mutate)
 *   - Phase 3-replace-by-sprint3 is BLOCKED unless --allow-blocked passed
 *   - Phase 2-reenable-needs-creds requires --skip-pre-check or interactive y/n
 *   - Backup is always written, even in dry-run mode (audit-output/cleanup-backups/)
 *
 * Exit codes:
 *   0 — success (or dry-run completed cleanly)
 *   1 — at least one action failed
 *   2 — fatal config error (env missing · plan not found · etc.)
 *
 * Compatible with: ESM Node 18+
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(__dirname, '..', '..')
const ENV_PATH = resolve(REPO_ROOT, '.env.local')
const DEFAULT_PLAN = resolve(__dirname, 'cleanup-plan.json')
const BACKUP_DIR = resolve(REPO_ROOT, 'audit-output', 'cleanup-backups')
const LOG_DIR = resolve(REPO_ROOT, 'audit-output', 'cleanup-logs')

// ----------------------------------------------------------------------
// CLI argument parsing
// ----------------------------------------------------------------------

const args = parseArgs(process.argv.slice(2))

function parseArgs(argv) {
  const out = {
    execute: false,
    phase: null,
    action: null,
    workflow: null,
    plan: DEFAULT_PLAN,
    allowBlocked: false,
    skipPreCheck: false,
    quiet: false,
  }
  for (const a of argv) {
    if (a === '--execute') out.execute = true
    else if (a === '--allow-blocked') out.allowBlocked = true
    else if (a === '--skip-pre-check') out.skipPreCheck = true
    else if (a === '--quiet') out.quiet = true
    else if (a.startsWith('--phase=')) out.phase = a.slice(8)
    else if (a.startsWith('--action=')) out.action = a.slice(9)
    else if (a.startsWith('--workflow=')) out.workflow = a.slice(11)
    else if (a.startsWith('--plan=')) out.plan = resolve(a.slice(7))
    else if (a === '--help' || a === '-h') {
      console.log(`Usage: see header comment at top of this file.`)
      process.exit(0)
    }
  }
  return out
}

// ----------------------------------------------------------------------
// Env + plan loading
// ----------------------------------------------------------------------

function loadEnv() {
  if (!existsSync(ENV_PATH)) {
    console.error(`FATAL: .env.local not found at ${ENV_PATH}`)
    process.exit(2)
  }
  const raw = readFileSync(ENV_PATH, 'utf8')
  const env = {}
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (!m) continue
    let value = m[2]
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1)
    env[m[1]] = value
  }
  for (const k of ['N8N_API_KEY', 'N8N_BASE_URL']) {
    if (!env[k]) {
      console.error(`FATAL: env var ${k} missing in .env.local`)
      process.exit(2)
    }
  }
  return env
}

function loadPlan(path) {
  if (!existsSync(path)) {
    console.error(`FATAL: plan not found at ${path}`)
    process.exit(2)
  }
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch (e) {
    console.error(`FATAL: plan is invalid JSON · ${e.message}`)
    process.exit(2)
  }
}

// ----------------------------------------------------------------------
// n8n API client (minimal · read + state mutation only)
// ----------------------------------------------------------------------

async function n8nGet(env, path) {
  const url = `${env.N8N_BASE_URL.replace(/\/$/, '')}${path}`
  const resp = await fetch(url, {
    headers: { 'X-N8N-API-KEY': env.N8N_API_KEY, 'Accept': 'application/json' },
  })
  if (!resp.ok) {
    const body = await resp.text().catch(() => '')
    throw new Error(`HTTP ${resp.status} ${resp.statusText} for GET ${path} · body: ${body.slice(0, 200)}`)
  }
  return resp.json()
}

async function n8nPostNoBody(env, path) {
  const url = `${env.N8N_BASE_URL.replace(/\/$/, '')}${path}`
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'X-N8N-API-KEY': env.N8N_API_KEY, 'Accept': 'application/json' },
  })
  if (!resp.ok) {
    const body = await resp.text().catch(() => '')
    throw new Error(`HTTP ${resp.status} ${resp.statusText} for POST ${path} · body: ${body.slice(0, 200)}`)
  }
  return resp.json().catch(() => ({}))
}

async function fetchWorkflow(env, id) {
  return n8nGet(env, `/api/v1/workflows/${id}`)
}

async function activateWorkflow(env, id) {
  // n8n public API endpoint: POST /api/v1/workflows/{id}/activate
  return n8nPostNoBody(env, `/api/v1/workflows/${id}/activate`)
}

async function deactivateWorkflow(env, id) {
  return n8nPostNoBody(env, `/api/v1/workflows/${id}/deactivate`)
}

// ----------------------------------------------------------------------
// Backup
// ----------------------------------------------------------------------

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-')
}

function backupWorkflow(workflow, ts) {
  mkdirSync(BACKUP_DIR, { recursive: true })
  const path = resolve(BACKUP_DIR, `${workflow.id}-${ts}.json`)
  writeFileSync(path, JSON.stringify(workflow, null, 2))
  return path
}

// ----------------------------------------------------------------------
// Pre-check evaluation
// ----------------------------------------------------------------------

function evaluatePreCheck(action, workflow) {
  const pc = action.pre_check
  if (!pc) return { ok: true, reason: 'no pre_check defined' }

  if (pc.type === 'expect_state') {
    const actual = workflow[pc.field]
    if (actual === pc.value) {
      return { ok: true, reason: `state matches: ${pc.field}=${actual}` }
    }
    return {
      ok: false,
      reason: `state mismatch: expected ${pc.field}=${pc.value}, got ${pc.field}=${actual}`,
      idempotent_noop: actual === inferTargetState(action),
    }
  }

  if (pc.type === 'manual_verify') {
    if (args.skipPreCheck) {
      return { ok: true, reason: '--skip-pre-check passed · trusting operator' }
    }
    return {
      ok: false,
      reason: 'manual_verify required',
      checks: pc.checks,
      requires_human: true,
    }
  }

  return { ok: false, reason: `unknown pre_check type: ${pc.type}` }
}

function inferTargetState(action) {
  if (action.action === 'enable') return true
  if (action.action === 'disable') return false
  return null
}

// ----------------------------------------------------------------------
// Action filtering (CLI flags)
// ----------------------------------------------------------------------

function filterActions(plan) {
  let actions = []
  for (const phase of plan.phases) {
    if (args.phase && phase.phase !== args.phase) continue
    if (phase.blocked_until && !args.allowBlocked) {
      log(`SKIP phase ${phase.phase} · blocked until: ${phase.blocked_until} · pass --allow-blocked to override`)
      continue
    }
    for (const action of phase.actions) {
      if (args.action && action.action !== args.action) continue
      if (args.workflow && action.id !== args.workflow) continue
      actions.push({ ...action, _phase: phase.phase, _phase_risk: phase.risk })
    }
  }
  return actions
}

// ----------------------------------------------------------------------
// Logging
// ----------------------------------------------------------------------

const logBuffer = []

function log(msg, level = 'info') {
  const line = `[${new Date().toISOString()}] [${level.toUpperCase()}] ${msg}`
  logBuffer.push(line)
  if (!args.quiet) console.log(line)
}

function flushLog(ts) {
  mkdirSync(LOG_DIR, { recursive: true })
  const path = resolve(LOG_DIR, `cleanup-${ts}.log`)
  writeFileSync(path, logBuffer.join('\n') + '\n')
  return path
}

// ----------------------------------------------------------------------
// Main execution
// ----------------------------------------------------------------------

async function main() {
  const ts = timestamp()
  const env = loadEnv()
  const plan = loadPlan(args.plan)

  log(`n8n-cleanup-executor · Wave 11 · plan ${args.plan}`)
  log(`mode: ${args.execute ? 'EXECUTE (LIVE n8n PATCH)' : 'DRY-RUN'}`)
  log(`filters · phase=${args.phase || '*'} · action=${args.action || '*'} · workflow=${args.workflow || '*'}`)
  log(`backup dir: ${BACKUP_DIR}`)

  const actions = filterActions(plan)
  log(`actions matched: ${actions.length}`)

  const summary = { ok: 0, noop: 0, fail: 0, skipped: 0 }
  const results = []

  for (const action of actions) {
    log('')
    log(`---`)
    log(`[${action._phase}] ${action.id} · ${action.name}`)
    log(`action: ${action.action} · reason: ${action.reason.slice(0, 120)}`)

    let workflow
    try {
      workflow = await fetchWorkflow(env, action.id)
    } catch (e) {
      log(`FAIL fetch workflow: ${e.message}`, 'error')
      summary.fail++
      results.push({ id: action.id, status: 'fail', error: e.message })
      continue
    }

    const backupPath = backupWorkflow(workflow, ts)
    log(`backup written: ${backupPath}`)
    log(`current state · active=${workflow.active} · updatedAt=${workflow.updatedAt}`)

    // Idempotency check: if already in target state, skip
    const targetActive = inferTargetState(action)
    if (workflow.active === targetActive) {
      log(`NOOP · workflow already in target state (active=${targetActive})`)
      summary.noop++
      results.push({ id: action.id, status: 'noop', reason: 'already in target state' })
      continue
    }

    // Pre-check
    const preCheck = evaluatePreCheck(action, workflow)
    if (!preCheck.ok) {
      if (preCheck.idempotent_noop) {
        log(`NOOP · pre_check failed but state already matches target (idempotent)`)
        summary.noop++
        results.push({ id: action.id, status: 'noop', reason: 'idempotent · state matches target' })
        continue
      }
      log(`SKIP · pre_check failed: ${preCheck.reason}`, 'warn')
      if (preCheck.checks) {
        for (const c of preCheck.checks) log(`  - manual check needed: ${c}`, 'warn')
      }
      summary.skipped++
      results.push({ id: action.id, status: 'skipped', reason: preCheck.reason, manual_checks: preCheck.checks })
      continue
    }
    log(`pre_check OK: ${preCheck.reason}`)

    // Execute (or dry-run preview)
    if (!args.execute) {
      log(`DRY-RUN · would call: ${action.action === 'enable' ? 'POST /api/v1/workflows/' + action.id + '/activate' : 'POST /api/v1/workflows/' + action.id + '/deactivate'}`)
      summary.ok++
      results.push({ id: action.id, status: 'dry-run-ok' })
      continue
    }

    try {
      if (action.action === 'enable') {
        await activateWorkflow(env, action.id)
        log(`OK · workflow activated`)
      } else if (action.action === 'disable') {
        await deactivateWorkflow(env, action.id)
        log(`OK · workflow deactivated`)
      } else {
        throw new Error(`unsupported action type: ${action.action}`)
      }
      summary.ok++
      results.push({ id: action.id, status: 'ok' })
    } catch (e) {
      log(`FAIL · ${e.message}`, 'error')
      log(`Rollback command: ${action.rollback_command}`, 'error')
      summary.fail++
      results.push({ id: action.id, status: 'fail', error: e.message })
    }
  }

  log('')
  log(`==========================================`)
  log(`Summary · ok=${summary.ok} · noop=${summary.noop} · skipped=${summary.skipped} · fail=${summary.fail}`)

  const logPath = flushLog(ts)
  console.log(`\nLog written: ${logPath}`)
  console.log(`Backups dir: ${BACKUP_DIR}`)
  if (summary.fail > 0) {
    console.error(`\n${summary.fail} action(s) failed · review log + run rollback if needed`)
    process.exit(1)
  }
  if (!args.execute) {
    console.log(`\nDry-run complete · re-run with --execute to apply.`)
  }
  process.exit(0)
}

// Allow main to be skipped under test
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1].endsWith('n8n-cleanup-executor.mjs')) {
  main().catch(e => { console.error('FATAL:', e); process.exit(2) })
}

// Exports for testing
export { parseArgs, evaluatePreCheck, inferTargetState, filterActions, backupWorkflow, loadPlan, n8nGet, n8nPostNoBody }
