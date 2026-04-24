#!/usr/bin/env node
/**
 * Zero Risk — Replace $env.* in workflows with hardcoded values via n8n API.
 *
 * Root cause: n8n v2.x task runner issue means $env.X in HTTP/Code nodes
 * throws "access to env vars denied" even with N8N_BLOCK_ENV_ACCESS_IN_NODE=false.
 *
 * Solution: fetch each workflow via API, replace $env references with literal
 * values in URL/body/header fields, PUT back.
 *
 * Only replaces safe/known vars; leaves others untouched so they still error-if-used.
 *
 * Usage:
 *   node scripts/hardcode-env-vars.mjs              # dry-run
 *   node scripts/hardcode-env-vars.mjs --apply      # apply via PUT to n8n
 */
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
const __dirname = dirname(fileURLToPath(import.meta.url))

const APPLY = process.argv.includes('--apply')

let N8N_API_KEY = '', N8N_BASE_URL = 'https://n8n-production-72be.up.railway.app'
let INTERNAL_API_KEY = '', ZERO_RISK_API_URL = 'https://zero-risk-platform.vercel.app'
try {
  const env = readFileSync(resolve(__dirname, '..', '.env.local'), 'utf-8')
  for (const l of env.split('\n')) {
    const t = l.trim()
    if (!t || t.startsWith('#')) continue
    const eq = t.indexOf('='); if (eq < 0) continue
    const k = t.slice(0, eq).trim(), v = t.slice(eq + 1).trim().replace(/^["']|["']$/g, '')
    if (k === 'N8N_API_KEY') N8N_API_KEY = v
    if (k === 'N8N_BASE_URL') N8N_BASE_URL = v
    if (k === 'INTERNAL_API_KEY') INTERNAL_API_KEY = v
    if (k === 'ZERO_RISK_API_URL') ZERO_RISK_API_URL = v
  }
} catch {}
if (!N8N_API_KEY) { console.error('❌ N8N_API_KEY missing'); process.exit(1) }
if (!INTERNAL_API_KEY) { console.error('❌ INTERNAL_API_KEY missing'); process.exit(1) }

// Substitutions to apply deep-in-tree
const SUBS = [
  // $env.ZERO_RISK_API_URL with fallback
  [/\$env\.ZERO_RISK_API_URL\s*\|\|\s*['"]https:\/\/zero-risk-platform\.vercel\.app['"]/g, `'${ZERO_RISK_API_URL}'`],
  [/\$env\.ZERO_RISK_API_URL/g, `'${ZERO_RISK_API_URL}'`],
  // $env.INTERNAL_API_KEY
  [/\{\{\s*\$env\.INTERNAL_API_KEY\s*\}\}/g, INTERNAL_API_KEY],
  [/\$env\.INTERNAL_API_KEY/g, `'${INTERNAL_API_KEY}'`],
  // $env.CLAUDE_API_KEY — don't hardcode, leave $env.CLAUDE_API_KEY as-is
  // (will still fail but user should use Credentials for API keys anyway)
  // MC_BASE_URL with literal Railway URL
  [/\$env\.MC_BASE_URL/g, `'https://zero-risk-mission-control-production.up.railway.app'`],
]

function recursivelyReplace(obj) {
  if (obj === null || obj === undefined) return obj
  if (typeof obj === 'string') {
    let out = obj
    for (const [rx, sub] of SUBS) out = out.replace(rx, sub)
    return out
  }
  if (Array.isArray(obj)) return obj.map(recursivelyReplace)
  if (typeof obj === 'object') {
    const out = {}
    for (const [k, v] of Object.entries(obj)) out[k] = recursivelyReplace(v)
    return out
  }
  return obj
}

async function listWorkflows() {
  const all = []; let cursor = null
  do {
    const url = new URL(`${N8N_BASE_URL}/api/v1/workflows`)
    url.searchParams.set('limit', '100')
    if (cursor) url.searchParams.set('cursor', cursor)
    const r = await fetch(url, { headers: { 'X-N8N-API-KEY': N8N_API_KEY, Accept: 'application/json' } })
    if (!r.ok) throw new Error('list fail ' + r.status)
    const j = await r.json()
    all.push(...(j.data || []))
    cursor = j.nextCursor
  } while (cursor)
  return all
}

async function main() {
  const workflows = await listWorkflows()
  console.log(`📋 ${workflows.length} workflows in n8n`)
  console.log('')

  let patched = 0, nochange = 0, failed = 0

  for (const wf of workflows) {
    if (!wf.name.toLowerCase().includes('zero risk')) { nochange++; continue }
    // Fetch full workflow
    const full = await fetch(`${N8N_BASE_URL}/api/v1/workflows/${wf.id}`, {
      headers: { 'X-N8N-API-KEY': N8N_API_KEY, Accept: 'application/json' }
    }).then(r => r.json())

    const orig = JSON.stringify(full.nodes)
    const newNodes = recursivelyReplace(full.nodes)
    const updated = JSON.stringify(newNodes)

    if (orig === updated) { nochange++; continue }

    if (!APPLY) {
      const diffCount = (updated.match(/https:\/\/zero-risk-platform/g) || []).length
                     - (orig.match(/https:\/\/zero-risk-platform/g) || []).length
      console.log(`  📋 ${wf.name}  (+${updated.length - orig.length} chars)`)
      patched++
      continue
    }

    // PUT update
    const payload = {
      name: full.name,
      nodes: newNodes,
      connections: full.connections,
      settings: full.settings || { executionOrder: 'v1' },
    }
    try {
      const r = await fetch(`${N8N_BASE_URL}/api/v1/workflows/${wf.id}`, {
        method: 'PUT',
        headers: { 'X-N8N-API-KEY': N8N_API_KEY, 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(20000),
      })
      if (!r.ok) {
        console.log(`  ❌ ${wf.name}: HTTP ${r.status}`)
        failed++
      } else {
        console.log(`  ✅ ${wf.name}`)
        patched++
      }
    } catch (e) {
      console.log(`  ❌ ${wf.name}: ${e.message}`)
      failed++
    }
  }

  console.log('')
  console.log(`✅ ${patched} patched  ⊘ ${nochange} no change  ❌ ${failed} failed`)
  if (!APPLY) console.log('\n⚠️  Dry-run — run with --apply to update via PUT.')
}

main().catch(e => { console.error('Fatal:', e); process.exit(1) })
