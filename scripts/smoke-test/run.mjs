#!/usr/bin/env node
/**
 * Zero Risk — Smoke test harness (FASE 0)
 *
 * Single entry point:
 *   node scripts/smoke-test/run.mjs agents                     # test all 27+ agents
 *   node scripts/smoke-test/run.mjs agent <slug>               # test one agent
 *   node scripts/smoke-test/run.mjs workflows                  # test all workflows with webhooks
 *   node scripts/smoke-test/run.mjs workflow <id|name>         # test one workflow
 *   node scripts/smoke-test/run.mjs all                        # agents + workflows
 *   node scripts/smoke-test/run.mjs inspect                    # one-shot system health
 *
 * Flags:
 *   --cluster=01-orchestration   limit workflows to given cluster-name match
 *   --concurrency=6              parallel worker count (default 6 for agents, 3 for workflows)
 *   --timeout=60000              per-unit timeout ms (default 60s agents, 150s workflows)
 *   --dry-run                    inventory only, no actual calls
 *   --out=out/smoke-YYYY-MM-DD.csv  override output path
 */

import { resolve, dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { existsSync, mkdirSync } from 'fs'
import { requireEnv, endpoints } from './lib/env.mjs'
import { listAgents, testAgent } from './lib/agents.mjs'
import { listN8nWorkflows, testWorkflow } from './lib/workflows.mjs'
import { parallel } from './lib/fetch.mjs'
import { writeCsv, writeMarkdown } from './lib/report.mjs'
import { cachedPassOrNull, recordResult, clearCache, cacheStats } from './lib/cache.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT_DIR = resolve(__dirname, 'out')
if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true })

const args = process.argv.slice(2)
const CMD = args[0]
const SUB = args[1]
const FLAGS = Object.fromEntries(
  args.filter(a => a.startsWith('--')).map(a => {
    const eq = a.indexOf('=')
    return eq < 0 ? [a.slice(2), true] : [a.slice(2, eq), a.slice(eq + 1)]
  })
)
const DRY = !!FLAGS['dry-run']
const CONCURRENCY = parseInt(FLAGS.concurrency || (CMD === 'workflows' || CMD === 'all' ? '2' : '6'), 10)
const CLUSTER = FLAGS.cluster || null
const ONLY_ACTIVE = !!FLAGS['active-only']
const INCLUDE_INACTIVE = !!FLAGS['include-inactive']
const CHEAP = !!FLAGS.cheap  // ping-only prompts, ~10x cheaper
const NO_CACHE = !!FLAGS['no-cache']  // force re-test even if cached PASS
if (FLAGS['clear-cache']) { clearCache(); console.log('✓ cache cleared'); process.exit(0) }

const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const OUT_BASE = FLAGS.out || join(OUT_DIR, `smoke-${stamp}`)
const CSV_PATH = OUT_BASE.endsWith('.csv') ? OUT_BASE : OUT_BASE + '.csv'
const MD_PATH = CSV_PATH.replace(/\.csv$/, '.md')

// ── Helpers ───────────────────────────────────────────────────

function progressLine(done, total, latest) {
  const name = latest?.slug || latest?.name || '?'
  const status = latest?.status || '?'
  const ms = latest?.duration_ms ?? '?'
  const icon = status === 'PASS' ? '✓' : status === 'FAIL' ? '✗' : '·'
  process.stdout.write(`\r  ${icon} [${done}/${total}] ${status.padEnd(18)} ${name.slice(0, 50).padEnd(50)} ${ms}ms     \n`)
}

// ── Commands ──────────────────────────────────────────────────

async function cmdInspect() {
  const env = requireEnv(['INTERNAL_API_KEY', 'NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'])
  const ep = endpoints(env)
  const { fetchJson } = await import('./lib/fetch.mjs')
  console.log('── Zero Risk system health ──')
  console.log('Vercel :', ep.vercel)
  console.log('n8n    :', ep.n8n)
  console.log('Supabase:', ep.supabase)
  console.log('')

  // Vercel health
  const vRes = await fetchJson(ep.vercel + '/api/agents/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': ep.INTERNAL_API_KEY },
    body: JSON.stringify({ agent: 'jefe-marketing', task: 'inspect', context: {} }),
    timeoutMs: 20000,
  })
  console.log('Vercel /api/agents/run :', vRes.status, vRes.ok ? '✓' : '✗')

  // n8n health
  const nRes = await fetchJson(ep.n8n + '/healthz')
  console.log('n8n /healthz           :', nRes.status, nRes.ok ? '✓' : '✗')
  if (ep.N8N_API_KEY) {
    const wfRes = await fetchJson(ep.n8n + '/api/v1/workflows?limit=100', {
      headers: { 'X-N8N-API-KEY': ep.N8N_API_KEY },
    })
    const wfs = wfRes.json?.data || []
    const active = wfs.filter(w => w.active).length
    console.log(`n8n workflows          : ${wfs.length} total / ${active} active`)
  } else {
    console.log('n8n workflows          : N8N_API_KEY not in .env.local, skipping')
  }

  // Supabase health
  const sRes = await fetchJson(
    ep.supabase + '/rest/v1/campaign_pipeline_state?select=request_id&limit=1',
    { headers: { apikey: ep.SUPABASE_SERVICE_ROLE_KEY, Authorization: 'Bearer ' + ep.SUPABASE_SERVICE_ROLE_KEY } }
  )
  console.log('Supabase REST          :', sRes.status, sRes.ok ? '✓' : '✗')
  console.log('')
}

async function cmdAgents() {
  requireEnv(['INTERNAL_API_KEY'])
  const all = listAgents()
  console.log(`Found ${all.length} agent slugs in identidades/`)
  if (DRY) { console.log(all.join('\n')); return }
  const tasks = all.map(slug => async () => {
    if (!NO_CACHE) {
      const hit = cachedPassOrNull('agent:' + slug)
      if (hit) return { type:'agent', slug, status:'PASS', duration_ms:hit.ms, output_len:hit.output_len, from_cache:true }
    }
    const result = await testAgent(slug, { timeoutMs: 60000, cheap: CHEAP })
    recordResult('agent:' + slug, { status: result.status, ms: result.duration_ms, output_len: result.output_len })
    return result
  })
  const rows = await parallel(tasks, CONCURRENCY, progressLine)
  writeCsv(CSV_PATH, rows)
  writeMarkdown(MD_PATH, rows, { when: new Date().toISOString() })
  console.log('\n→', CSV_PATH)
  console.log('→', MD_PATH)
  const pass = rows.filter(r => r.status === 'PASS').length
  console.log(`\nPASS: ${pass}/${rows.length}`)
}

async function cmdAgent(slug) {
  requireEnv(['INTERNAL_API_KEY'])
  if (!slug) { console.error('Usage: run.mjs agent <slug>'); process.exit(1) }
  const r = await testAgent(slug)
  console.log(JSON.stringify(r, null, 2))
}

async function cmdWorkflows() {
  requireEnv(['INTERNAL_API_KEY'])
  const { workflows, error } = await listN8nWorkflows()
  if (error) { console.error(error); process.exit(1) }
  console.log(`Found ${workflows.length} workflows in n8n`)
  let filtered = CLUSTER ? workflows.filter(w => w.name.toLowerCase().includes(CLUSTER.toLowerCase())) : workflows
  if (ONLY_ACTIVE || (!INCLUDE_INACTIVE && !CLUSTER)) filtered = filtered.filter(w => w.active)
  console.log(`Testing ${filtered.length} workflows (concurrency=${CONCURRENCY})`)
  if (DRY) { console.log(filtered.map(w => `${w.id}  ${w.active ? 'A' : 'D'}  ${w.name}`).join('\n')); return }
  const tasks = filtered.map(w => () => testWorkflow(w))
  const rows = await parallel(tasks, CONCURRENCY, progressLine)
  writeCsv(CSV_PATH, rows)
  writeMarkdown(MD_PATH, rows, { when: new Date().toISOString() })
  console.log('\n→', CSV_PATH)
  console.log('→', MD_PATH)
  const pass = rows.filter(r => r.status === 'PASS').length
  console.log(`\nPASS: ${pass}/${rows.length}`)
}

async function cmdWorkflow(idOrName) {
  if (!idOrName) { console.error('Usage: run.mjs workflow <id|name>'); process.exit(1) }
  const { workflows } = await listN8nWorkflows()
  const match = workflows.find(w => w.id === idOrName || w.name.includes(idOrName))
  if (!match) { console.error(`No workflow matches "${idOrName}"`); process.exit(1) }
  console.log(`Testing: ${match.name} (${match.id}) active=${match.active}`)
  const r = await testWorkflow(match)
  console.log(JSON.stringify(r, null, 2))
}

async function cmdAll() {
  requireEnv(['INTERNAL_API_KEY'])
  const agents = listAgents()
  const { workflows } = await listN8nWorkflows()
  let filteredWfs = CLUSTER ? workflows.filter(w => w.name.toLowerCase().includes(CLUSTER.toLowerCase())) : workflows
  if (ONLY_ACTIVE || (!INCLUDE_INACTIVE && !CLUSTER)) filteredWfs = filteredWfs.filter(w => w.active)
  const wfConc = parseInt(FLAGS['wf-concurrency'] || '2', 10)
  console.log(`Running ${agents.length} agents + ${filteredWfs.length} workflows (concurrency agents=${CONCURRENCY}, workflows=${wfConc})`)
  if (DRY) {
    console.log('\nAgents:', agents.join(', '))
    console.log('\nWorkflows:')
    for (const w of filteredWfs) console.log(`  ${w.id}  ${w.active ? 'A' : 'D'}  ${w.name}`)
    return
  }
  // Agents first (parallel)
  console.log('\n── Testing agents ──')
  const agentTasks = agents.map(s => async () => {
    if (!NO_CACHE) {
      const hit = cachedPassOrNull('agent:' + s)
      if (hit) return { type:'agent', slug:s, status:'PASS', duration_ms:hit.ms, output_len:hit.output_len, from_cache:true }
    }
    const result = await testAgent(s, { cheap: CHEAP })
    recordResult('agent:' + s, { status: result.status, ms: result.duration_ms, output_len: result.output_len })
    return result
  })
  const agentRows = await parallel(agentTasks, CONCURRENCY, progressLine)
  // Workflows next (lower concurrency — they run longer)
  console.log('\n── Testing workflows ──')
  const wfTasks = filteredWfs.map(w => () => testWorkflow(w))
  const wfRows = await parallel(wfTasks, wfConc, progressLine)
  const all = [...agentRows, ...wfRows]
  writeCsv(CSV_PATH, all)
  writeMarkdown(MD_PATH, all, { when: new Date().toISOString() })
  console.log('\n→', CSV_PATH)
  console.log('→', MD_PATH)
  const pass = all.filter(r => r.status === 'PASS').length
  console.log(`\nPASS: ${pass}/${all.length}`)
}

// ── Dispatch ──────────────────────────────────────────────────

async function main() {
  try {
    switch (CMD) {
      case 'inspect':    return cmdInspect()
      case 'agents':     return cmdAgents()
      case 'agent':      return cmdAgent(SUB)
      case 'workflows':  return cmdWorkflows()
      case 'workflow':   return cmdWorkflow(SUB)
      case 'all':        return cmdAll()
      default:
        console.log('Zero Risk smoke-test harness')
        console.log('')
        console.log('  node scripts/smoke-test/run.mjs inspect')
        console.log('  node scripts/smoke-test/run.mjs agents [--concurrency=6]')
        console.log('  node scripts/smoke-test/run.mjs agent <slug>')
        console.log('  node scripts/smoke-test/run.mjs workflows [--cluster=01-orchestration]')
        console.log('  node scripts/smoke-test/run.mjs workflow <id|name>')
        console.log('  node scripts/smoke-test/run.mjs all [--cluster=...]')
        console.log('')
        console.log('  Flags: --dry-run  --concurrency=N  --timeout=ms  --out=path.csv')
        process.exit(1)
    }
  } catch (e) {
    console.error('ERROR:', e.message)
    if (process.env.DEBUG) console.error(e.stack)
    process.exit(1)
  }
}

main()
