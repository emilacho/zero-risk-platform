#!/usr/bin/env node
/**
 * cleanup-rollback.mjs
 * Wave 11 · CC#2 · Restore n8n workflows to pre-cleanup state.
 *
 * Reads the most recent backup file in audit-output/cleanup-backups/<id>-*.json
 * and reverses the active state via the n8n public API.
 *
 * Usage:
 *   node scripts/cleanup/cleanup-rollback.mjs --workflow=<id>           # restore one workflow
 *   node scripts/cleanup/cleanup-rollback.mjs --workflow=<id> --execute # actually mutate
 *   node scripts/cleanup/cleanup-rollback.mjs --all                     # restore every backed-up workflow
 *   node scripts/cleanup/cleanup-rollback.mjs --backup=path/to.json     # use specific backup file
 *
 * Default mode is dry-run.
 *
 * Exit codes: 0 OK · 1 partial fail · 2 fatal config error
 */

import { readFileSync, readdirSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { resolve, dirname, basename } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(__dirname, '..', '..')
const ENV_PATH = resolve(REPO_ROOT, '.env.local')
const BACKUP_DIR = resolve(REPO_ROOT, 'audit-output', 'cleanup-backups')
const LOG_DIR = resolve(REPO_ROOT, 'audit-output', 'cleanup-logs')

const args = parseArgs(process.argv.slice(2))

function parseArgs(argv) {
  const out = { execute: false, workflow: null, all: false, backup: null, quiet: false }
  for (const a of argv) {
    if (a === '--execute') out.execute = true
    else if (a === '--all') out.all = true
    else if (a === '--quiet') out.quiet = true
    else if (a.startsWith('--workflow=')) out.workflow = a.slice(11)
    else if (a.startsWith('--backup=')) out.backup = resolve(a.slice(9))
    else if (a === '--help' || a === '-h') {
      console.log('Usage: see header comment.')
      process.exit(0)
    }
  }
  return out
}

function loadEnv() {
  if (!existsSync(ENV_PATH)) {
    console.error(`FATAL: .env.local not found at ${ENV_PATH}`); process.exit(2)
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
  if (!env.N8N_API_KEY || !env.N8N_BASE_URL) {
    console.error('FATAL: N8N_API_KEY/N8N_BASE_URL missing'); process.exit(2)
  }
  return env
}

async function n8nGet(env, path) {
  const r = await fetch(`${env.N8N_BASE_URL.replace(/\/$/,'')}${path}`, {
    headers: { 'X-N8N-API-KEY': env.N8N_API_KEY, 'Accept': 'application/json' },
  })
  if (!r.ok) throw new Error(`HTTP ${r.status} GET ${path}`)
  return r.json()
}

async function n8nPostNoBody(env, path) {
  const r = await fetch(`${env.N8N_BASE_URL.replace(/\/$/,'')}${path}`, {
    method: 'POST',
    headers: { 'X-N8N-API-KEY': env.N8N_API_KEY, 'Accept': 'application/json' },
  })
  if (!r.ok) throw new Error(`HTTP ${r.status} POST ${path}`)
  return r.json().catch(() => ({}))
}

function findLatestBackup(workflowId) {
  if (!existsSync(BACKUP_DIR)) return null
  const files = readdirSync(BACKUP_DIR)
    .filter(f => f.startsWith(`${workflowId}-`) && f.endsWith('.json'))
    .sort()
    .reverse()
  if (files.length === 0) return null
  return resolve(BACKUP_DIR, files[0])
}

function findAllLatestBackups() {
  if (!existsSync(BACKUP_DIR)) return []
  const files = readdirSync(BACKUP_DIR).filter(f => f.endsWith('.json'))
  const byId = new Map()
  for (const f of files) {
    const m = f.match(/^([A-Za-z0-9]+)-/)
    if (!m) continue
    const id = m[1]
    if (!byId.has(id) || f > byId.get(id)) byId.set(id, f)
  }
  return [...byId.entries()].map(([id, f]) => ({ id, path: resolve(BACKUP_DIR, f) }))
}

const logBuf = []
function log(s, level = 'info') {
  const line = `[${new Date().toISOString()}] [${level.toUpperCase()}] ${s}`
  logBuf.push(line)
  if (!args.quiet) console.log(line)
}

function flushLog(ts) {
  mkdirSync(LOG_DIR, { recursive: true })
  const p = resolve(LOG_DIR, `rollback-${ts}.log`)
  writeFileSync(p, logBuf.join('\n') + '\n')
  return p
}

async function rollbackOne(env, workflowId, backupPath) {
  let backup
  try {
    backup = JSON.parse(readFileSync(backupPath, 'utf8'))
  } catch (e) {
    log(`FAIL · cannot parse backup at ${backupPath} · ${e.message}`, 'error')
    return { id: workflowId, status: 'fail', error: 'parse-backup' }
  }

  log(`backup loaded: ${backupPath}`)
  log(`backup state · active=${backup.active} · updatedAt=${backup.updatedAt}`)

  let current
  try {
    current = await n8nGet(env, `/api/v1/workflows/${workflowId}`)
  } catch (e) {
    log(`FAIL · cannot fetch current state · ${e.message}`, 'error')
    return { id: workflowId, status: 'fail', error: 'fetch-current' }
  }

  log(`current state · active=${current.active}`)

  if (current.active === backup.active) {
    log(`NOOP · current state already matches backup (active=${current.active})`)
    return { id: workflowId, status: 'noop' }
  }

  const targetAction = backup.active ? 'activate' : 'deactivate'
  if (!args.execute) {
    log(`DRY-RUN · would call: POST /api/v1/workflows/${workflowId}/${targetAction}`)
    return { id: workflowId, status: 'dry-run-ok' }
  }

  try {
    await n8nPostNoBody(env, `/api/v1/workflows/${workflowId}/${targetAction}`)
    log(`OK · workflow restored to active=${backup.active}`)
    return { id: workflowId, status: 'ok' }
  } catch (e) {
    log(`FAIL · ${e.message}`, 'error')
    return { id: workflowId, status: 'fail', error: e.message }
  }
}

async function main() {
  const ts = new Date().toISOString().replace(/[:.]/g, '-')
  const env = loadEnv()

  log(`cleanup-rollback · Wave 11 · mode: ${args.execute ? 'EXECUTE' : 'DRY-RUN'}`)

  let targets = []
  if (args.backup) {
    const m = basename(args.backup).match(/^([A-Za-z0-9]+)-/)
    if (!m) { console.error('FATAL: cannot infer workflow id from backup filename'); process.exit(2) }
    targets = [{ id: m[1], path: args.backup }]
  } else if (args.workflow) {
    const path = findLatestBackup(args.workflow)
    if (!path) { console.error(`FATAL: no backup found for ${args.workflow} in ${BACKUP_DIR}`); process.exit(2) }
    targets = [{ id: args.workflow, path }]
  } else if (args.all) {
    targets = findAllLatestBackups()
    if (targets.length === 0) { console.error('FATAL: no backups found'); process.exit(2) }
  } else {
    console.error('FATAL: pass --workflow=<id> · --all · or --backup=<path>')
    process.exit(2)
  }

  log(`targets: ${targets.length}`)

  const summary = { ok: 0, noop: 0, fail: 0 }
  const results = []
  for (const t of targets) {
    log('')
    log(`--- ${t.id} ---`)
    const r = await rollbackOne(env, t.id, t.path)
    results.push(r)
    if (r.status === 'ok' || r.status === 'dry-run-ok') summary.ok++
    else if (r.status === 'noop') summary.noop++
    else summary.fail++
  }

  log('')
  log(`Summary · ok=${summary.ok} · noop=${summary.noop} · fail=${summary.fail}`)
  const p = flushLog(ts)
  console.log(`\nLog: ${p}`)
  process.exit(summary.fail > 0 ? 1 : 0)
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1].endsWith('cleanup-rollback.mjs')) {
  main().catch(e => { console.error('FATAL:', e); process.exit(2) })
}

export { parseArgs, findLatestBackup, findAllLatestBackups, rollbackOne }
