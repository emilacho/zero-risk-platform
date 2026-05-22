#!/usr/bin/env node
/**
 * scripts/sprint6-activate-workflow.mjs · Sprint 6 Track B · CC#2
 *
 * Activate one or more n8n workflows by ID prefix · idempotent ·
 * verifies activation + reports next cron run.
 *
 * Usage ·
 *   node scripts/sprint6-activate-workflow.mjs <id_prefix_1> [<id_prefix_2> ...]
 *
 * Example ·
 *   node scripts/sprint6-activate-workflow.mjs 3kEC F2oU Gi2w g0ew
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

const N8N_BASE = env.N8N_BASE_URL || env.N8N_URL || 'https://n8n-production-72be.up.railway.app'
const N8N_KEY = env.N8N_API_KEY

if (!N8N_KEY) {
  console.error('FAIL · missing N8N_API_KEY')
  process.exit(2)
}

const prefixes = process.argv.slice(2)
if (prefixes.length === 0) {
  console.error('usage · node scripts/sprint6-activate-workflow.mjs <id_prefix>...')
  process.exit(2)
}

const headers = { 'X-N8N-API-KEY': N8N_KEY, 'Content-Type': 'application/json' }

console.log('--- GET all workflows ---')
const list = await fetch(`${N8N_BASE}/api/v1/workflows?limit=250`, { headers })
if (!list.ok) {
  console.error(`FAIL list · ${list.status} · ${await list.text()}`)
  process.exit(1)
}
const allWorkflows = (await list.json()).data ?? []
console.log(`total: ${allWorkflows.length}`)

const matched = []
for (const prefix of prefixes) {
  const found = allWorkflows.filter((w) => (w.id ?? '').startsWith(prefix))
  if (found.length === 0) {
    console.error(`WARN · prefix "${prefix}" matches 0 workflows`)
    continue
  }
  if (found.length > 1) {
    console.error(`WARN · prefix "${prefix}" ambiguous · matches ${found.length} workflows`)
    found.forEach((w) => console.error(`   ${w.id}  ${w.name}`))
    continue
  }
  matched.push(found[0])
}

console.log(`\n--- matched ${matched.length} / ${prefixes.length} prefixes ---`)
for (const w of matched) {
  console.log(`  ${w.id}  active=${w.active}  ${w.name}`)
}

if (matched.length === 0) {
  console.error('no workflows to activate · exit')
  process.exit(1)
}

console.log(`\n--- activating ${matched.length} workflows ---`)
const results = []
for (const w of matched) {
  if (w.active) {
    console.log(`  ${w.id} · already active · SKIP`)
    results.push({ id: w.id, name: w.name, action: 'skip', already_active: true })
    continue
  }
  const r = await fetch(`${N8N_BASE}/api/v1/workflows/${w.id}/activate`, {
    method: 'POST',
    headers,
  })
  const ok = r.status >= 200 && r.status < 300
  const body = await r.text()
  if (ok) {
    let parsed = null
    try { parsed = JSON.parse(body) } catch {}
    const isActive = parsed?.active === true || parsed?.data?.active === true
    console.log(`  ${w.id} · ${ok ? 'OK ' : 'FAIL'} · status ${r.status} · is_active=${isActive}`)
    results.push({ id: w.id, name: w.name, action: 'activated', status: r.status, is_active: isActive })
  } else {
    console.log(`  ${w.id} · FAIL · status ${r.status} · ${body.slice(0, 200)}`)
    results.push({ id: w.id, name: w.name, action: 'failed', status: r.status, error: body.slice(0, 200) })
  }
}

console.log('\n--- post-activation verify ---')
const verifyList = await fetch(`${N8N_BASE}/api/v1/workflows?limit=250&active=true`, { headers })
const activeNow = (await verifyList.json()).data ?? []
console.log(`active count now: ${activeNow.length}`)

const persistPath = path.resolve(`scripts/sprint6-activate-${Date.now()}.json`)
fs.writeFileSync(persistPath, JSON.stringify({ activated: results, active_count_after: activeNow.length, timestamp: new Date().toISOString() }, null, 2))
console.log(`\nresults persisted · ${persistPath}`)
