#!/usr/bin/env node
/**
 * scripts/sprint6-n8n-inventory.mjs · Sprint 6 Track B · CC#2
 *
 * Ground-truth recon of n8n live state ·
 *   1. Decode N8N_API_KEY JWT · check exp claim · WARN if <12h or expired
 *   2. GET /api/v1/workflows · count total + active + inactive
 *   3. Print inactive workflows table (id · name · createdAt) sorted by name
 *   4. Cross-reference master plan IDs (3kEC · F2oU · 8gId · 9UYo · Gi2w · g0ew · etc) · flag matches
 *
 * Read-only · safe to run.
 *
 * Per CLAUDE.md ground-truth-first rule + N8N_API_KEY expiry pre-claim verify.
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
  console.error('FAIL · missing N8N_API_KEY in .env.local')
  process.exit(2)
}

function decodeJwtExp(token) {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return { ok: false, error: 'not a 3-part JWT' }
    const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'))
    const exp = payload.exp
    if (!exp) return { ok: false, error: 'no exp claim' }
    const expDate = new Date(exp * 1000)
    const hoursLeft = (exp * 1000 - Date.now()) / 3_600_000
    return { ok: true, exp, expDate, hoursLeft, payload }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

const expCheck = decodeJwtExp(N8N_KEY)
console.log('--- N8N_API_KEY JWT exp check ---')
if (!expCheck.ok) {
  console.log(`WARN · could not decode · ${expCheck.error} (continuing · key might still work)`)
} else {
  console.log(`exp: ${expCheck.expDate.toISOString()}`)
  console.log(`hours left: ${expCheck.hoursLeft.toFixed(2)}`)
  if (expCheck.hoursLeft < 0) {
    console.error('FAIL · JWT EXPIRED · refresh N8N_API_KEY before proceeding')
    process.exit(1)
  }
  if (expCheck.hoursLeft < 12) {
    console.warn(`WARN · <12h until expiry · refresh recommended`)
  }
}

console.log('\n--- GET /api/v1/workflows ---')
const r = await fetch(`${N8N_BASE}/api/v1/workflows?limit=250`, {
  headers: { 'X-N8N-API-KEY': N8N_KEY },
})
if (!r.ok) {
  console.error(`FAIL · status ${r.status} · ${await r.text()}`)
  process.exit(1)
}
const json = await r.json()
const workflows = json.data ?? []

const active = workflows.filter((w) => w.active === true)
const inactive = workflows.filter((w) => w.active === false)

console.log(`total: ${workflows.length}`)
console.log(`active: ${active.length}`)
console.log(`inactive: ${inactive.length}`)

console.log('\n--- INACTIVE workflows (sorted by name) ---')
const inactiveSorted = [...inactive].sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''))
for (const w of inactiveSorted) {
  console.log(`  ${w.id}  ${w.name}`)
}

const TARGET_IDS_B3 = ['3kEC', 'F2oU', '8gId', '9UYo']
const TARGET_IDS_B4 = ['Gi2w', 'g0ew', 'fe9D', 'aWM5']
const TARGET_IDS_B2 = ['7dwR', 'V7on', 'f9cg']
const TARGET_IDS_B1 = ['sTLf', 'EmBE', 'uMrq', 'CNlT', '89it', 'ohtC']

const allTargets = [...TARGET_IDS_B3, ...TARGET_IDS_B4, ...TARGET_IDS_B2, ...TARGET_IDS_B1]

console.log('\n--- TARGET workflow IDs (per Sprint 6 master plan) ---')
console.log('B1 (Client Success · 6) · ' + TARGET_IDS_B1.join(' '))
console.log('B2 (Paid Media · 3) · ' + TARGET_IDS_B2.join(' '))
console.log('B3 (SEO · 4) · ' + TARGET_IDS_B3.join(' '))
console.log('B4 (Ops · 4) · ' + TARGET_IDS_B4.join(' '))
console.log(`Total targets · ${allTargets.length}`)

console.log('\n--- TARGET ID match check ---')
let matched = 0
let alreadyActive = 0
let notFound = 0
const results = []
for (const id of allTargets) {
  // n8n IDs may be full · the 4-char codes in plan look like suffixes
  const match = workflows.find((w) => w.id === id || (w.id ?? '').endsWith(id))
  if (!match) {
    console.log(`  ${id} · NOT FOUND`)
    notFound++
    results.push({ targetId: id, status: 'not_found' })
    continue
  }
  if (match.active) {
    console.log(`  ${id} · ${match.id} ${match.name} · ALREADY ACTIVE`)
    alreadyActive++
    results.push({ targetId: id, n8nId: match.id, name: match.name, status: 'already_active' })
  } else {
    console.log(`  ${id} · ${match.id} ${match.name} · INACTIVE (target)`)
    matched++
    results.push({ targetId: id, n8nId: match.id, name: match.name, status: 'inactive_target' })
  }
}

console.log('\n--- SUMMARY ---')
console.log(`matched_inactive: ${matched} (will activate in Track B)`)
console.log(`already_active: ${alreadyActive}`)
console.log(`not_found: ${notFound}`)

fs.writeFileSync(
  path.resolve('scripts/sprint6-n8n-inventory.json'),
  JSON.stringify({ baseline: { total: workflows.length, active: active.length, inactive: inactive.length }, results, generated_at: new Date().toISOString() }, null, 2),
)
console.log('\nresults persisted · scripts/sprint6-n8n-inventory.json')
