#!/usr/bin/env node
/**
 * export-mc-data.mjs — Exporta Mission Control a formato JSON neutro
 *
 * Genera un snapshot de MC (tasks, inbox, projects, goals) en un JSON
 * que los adapters leen para importar a la plataforma destino.
 *
 * Usage:
 *   node scripts/mc-portability/export-mc-data.mjs
 *   node scripts/mc-portability/export-mc-data.mjs --out mc-export-custom.json
 *
 * Output: scripts/mc-portability/mc-export-<timestamp>.json
 */

import { createRequire } from 'module'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { writeFileSync } from 'fs'

const require = createRequire(import.meta.url)
const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv_load()

function dotenv_load() {
  const dotenv = require('dotenv')
  dotenv.config({ path: join(__dirname, '..', '..', '.env.local') })
}

const MC_BASE_URL = process.env.MC_BASE_URL || 'https://zero-risk-mission-control-production.up.railway.app'
const MC_PASSWORD = process.env.MC_MASTER_PASSWORD || 'zerorisk2026'

async function mcGet(path) {
  const res = await fetch(`${MC_BASE_URL}${path}?masterPassword=${MC_PASSWORD}`, {
    signal: AbortSignal.timeout(10000),
  })
  if (!res.ok) throw new Error(`MC ${path}: HTTP ${res.status}`)
  const data = await res.json()
  return Array.isArray(data) ? data : (data.data || data.tasks || data.messages || data.items || [])
}

async function main() {
  const outArg = process.argv.indexOf('--out')
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const outFile = outArg > -1
    ? process.argv[outArg + 1]
    : join(__dirname, `mc-export-${timestamp}.json`)

  console.log('📤 Exportando Mission Control...')
  console.log(`   URL: ${MC_BASE_URL}`)

  const snapshot = {
    exported_at: new Date().toISOString(),
    mc_url: MC_BASE_URL,
    tasks: [],
    inbox: [],
    projects: [],
    goals: [],
    brain_dump: [],
  }

  const endpoints = [
    { key: 'tasks', path: '/api/tasks' },
    { key: 'inbox', path: '/api/inbox' },
    { key: 'projects', path: '/api/projects' },
    { key: 'goals', path: '/api/goals' },
    { key: 'brain_dump', path: '/api/brain-dump' },
  ]

  for (const { key, path } of endpoints) {
    try {
      snapshot[key] = await mcGet(path)
      console.log(`   ✅ ${key}: ${snapshot[key].length} items`)
    } catch (e) {
      console.log(`   ⚠️  ${key}: ${e.message} (skipped)`)
    }
  }

  writeFileSync(outFile, JSON.stringify(snapshot, null, 2), 'utf8')
  console.log(`\n✅ Export guardado: ${outFile}`)
  console.log(`   Total: ${Object.entries(snapshot).filter(([k]) => Array.isArray(snapshot[k])).map(([k, v]) => `${k}:${v.length}`).join(' | ')}`)
  console.log(`\n   Usar con: node scripts/mc-portability/import-from-mc.mjs --file ${outFile} --adapter <nombre>`)

  return outFile
}

main().catch(e => { console.error('❌', e.message); process.exit(1) })
