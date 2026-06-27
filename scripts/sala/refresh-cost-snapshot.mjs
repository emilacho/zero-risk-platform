#!/usr/bin/env node
/**
 * scripts/sala/refresh-cost-snapshot.mjs · refresh cost snapshot in the
 * Sala Centro de Supervisión dashboard HTML (vault doc · NOT a prod
 * artifact · NOT auto-deployed).
 *
 * Read-only · queries `agent_invocations.cost_usd` over three windows
 * (1h / 24h / 7d) using the same query shape as the G5 cost-monitor cron
 * (`src/app/api/cost-monitor/cron/route.ts`). Aggregates, writes the
 * snapshot JSON into the `<script id="cost-snapshot">` block of the
 * dashboard HTML in the vault.
 *
 * Why a manual snapshot · the dashboard HTML lives in the vault
 * (OneDrive · NOT served by Next.js · NOT deployed). When opened from
 * disk (`file://`), browser CORS + auth blocks any fetch to the live
 * Supabase or `/api/cost-monitor/*`. So the cost number gets embedded
 * inline by this generator. Honest-by-design: each run re-stamps the
 * snapshot timestamp; if you don't run it, the HTML still says when it
 * was last refreshed (§148).
 *
 * Usage ·
 *   node scripts/sala/refresh-cost-snapshot.mjs
 *
 * Required env (load via .env.local · same as G5 cron) ·
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY  (read-only path · we only SELECT)
 *
 * Optional env ·
 *   SALA_DASHBOARD_HTML_PATH   override path to the HTML file
 *                              default · resolves OneDrive vault location
 *                              from the standard layout used by Cowork
 *
 * Exit codes ·
 *   0 · snapshot written successfully
 *   1 · env missing / supabase error / HTML file not found / block not located
 *
 * §148 honest · if Supabase returns 0 rows or fails, we STILL write a
 * snapshot row with `status: "no-data"` or `"query-failed"` + the error
 * message · NEVER fabricate numbers, NEVER hide failure mode.
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'

// ─── Resolve dashboard HTML path ────────────────────────────────────
//
// Default path follows the Cowork layout (OneDrive sync · vault root
// is sibling of the repo working dir). Override via env if your vault
// lives elsewhere.

function resolveDashboardPath() {
  if (process.env.SALA_DASHBOARD_HTML_PATH) {
    return process.env.SALA_DASHBOARD_HTML_PATH
  }
  // Standard layout: %USERPROFILE%/OneDrive/Documents/zr-vault/...
  const home = os.homedir()
  const candidates = [
    path.join(home, 'OneDrive', 'Documents', 'zr-vault', '00-meta', 'opus-4-8-traspaso', 'dashboards', 'sala-centro-supervision-v2-2026-06-02.html'),
    path.join(home, 'Documents', 'zr-vault', '00-meta', 'opus-4-8-traspaso', 'dashboards', 'sala-centro-supervision-v2-2026-06-02.html'),
  ]
  return candidates[0] // caller checks existence
}

// ─── Load .env.local without a dotenv dep ───────────────────────────

async function loadDotenv() {
  const candidates = [
    path.join(process.cwd(), '.env.local'),
    path.join(process.cwd(), '.env'),
  ]
  for (const p of candidates) {
    try {
      const txt = await fs.readFile(p, 'utf8')
      for (const line of txt.split(/\r?\n/)) {
        const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
        if (m && !process.env[m[1]]) {
          process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '')
        }
      }
    } catch {
      // ignore · not all dirs have a .env.local
    }
  }
}

// ─── Supabase REST query (no client lib dep · keeps script light) ──

async function querySupabaseAgentInvocations({ supabaseUrl, serviceKey, sinceIso }) {
  // PostgREST: select cost_usd · filter started_at gte sinceIso
  const url = new URL('/rest/v1/agent_invocations', supabaseUrl)
  url.searchParams.set('select', 'cost_usd')
  url.searchParams.set('started_at', `gte.${sinceIso}`)
  // High limit · safe because we only fetch one numeric column
  // For really high volume this should paginate · current call volume
  // (~hundreds/day worst case) fits comfortably in a single page.
  const res = await fetch(url, {
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Accept-Profile': 'public',
      Prefer: 'count=exact',
    },
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Supabase REST ${res.status}: ${text.slice(0, 200)}`)
  }
  const rows = await res.json()
  return Array.isArray(rows) ? rows : []
}

function sumCostUsd(rows) {
  return rows.reduce((acc, r) => acc + (Number(r.cost_usd) || 0), 0)
}

// ─── Snapshot block replacement in HTML ─────────────────────────────

const BLOCK_START = '<script type="application/json" id="cost-snapshot">'
const BLOCK_END = '</script>'

function replaceSnapshotBlock(html, snapshot) {
  const startIdx = html.indexOf(BLOCK_START)
  if (startIdx === -1) {
    throw new Error('cost-snapshot block START not found in HTML')
  }
  const endRel = html.indexOf(BLOCK_END, startIdx + BLOCK_START.length)
  if (endRel === -1) {
    throw new Error('cost-snapshot block END not found in HTML')
  }
  const before = html.slice(0, startIdx + BLOCK_START.length)
  const after = html.slice(endRel)
  const body = '\n' + JSON.stringify(snapshot, null, 2) + '\n    '
  return before + body + after
}

// ─── Main ───────────────────────────────────────────────────────────

async function main() {
  await loadDotenv()

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const dashboardPath = resolveDashboardPath()

  if (!supabaseUrl || !serviceKey) {
    console.error('[ERROR] NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing in env')
    console.error('         load from .env.local at repo root · same vars used by G5 cron')
    process.exit(1)
  }

  // Verify HTML exists before querying Supabase
  try {
    await fs.access(dashboardPath)
  } catch {
    console.error(`[ERROR] dashboard HTML not found at: ${dashboardPath}`)
    console.error('         override with SALA_DASHBOARD_HTML_PATH env')
    process.exit(1)
  }

  const now = new Date()
  const since1h = new Date(now.getTime() - 3600_000).toISOString()
  const since24h = new Date(now.getTime() - 24 * 3600_000).toISOString()
  const since7d = new Date(now.getTime() - 7 * 24 * 3600_000).toISOString()

  let snapshot

  try {
    const [rows1h, rows24h, rows7d] = await Promise.all([
      querySupabaseAgentInvocations({ supabaseUrl, serviceKey, sinceIso: since1h }),
      querySupabaseAgentInvocations({ supabaseUrl, serviceKey, sinceIso: since24h }),
      querySupabaseAgentInvocations({ supabaseUrl, serviceKey, sinceIso: since7d }),
    ])
    const agg1h = Number(sumCostUsd(rows1h).toFixed(4))
    const agg24h = Number(sumCostUsd(rows24h).toFixed(4))
    const agg7d = Number(sumCostUsd(rows7d).toFixed(4))

    snapshot = {
      snapshot_at: now.toISOString(),
      aggregate_1h_usd: agg1h,
      aggregate_24h_usd: agg24h,
      aggregate_7d_usd: agg7d,
      row_counts: {
        last_1h: rows1h.length,
        last_24h: rows24h.length,
        last_7d: rows7d.length,
      },
      thresholds: {
        daily_per_workflow_usd: 10,
        daily_aggregate_usd: 100,
        hourly_burst_usd: 5,
      },
      source: 'agent_invocations.cost_usd · same pattern as G5 cost-monitor cron',
      status: 'fresh',
    }
  } catch (err) {
    console.error(`[WARN] supabase query failed: ${err.message}`)
    snapshot = {
      snapshot_at: now.toISOString(),
      aggregate_1h_usd: null,
      aggregate_24h_usd: null,
      aggregate_7d_usd: null,
      thresholds: {
        daily_per_workflow_usd: 10,
        daily_aggregate_usd: 100,
        hourly_burst_usd: 5,
      },
      source: 'agent_invocations.cost_usd · same pattern as G5 cost-monitor cron',
      status: 'query-failed',
      error: String(err.message || err).slice(0, 200),
    }
  }

  const html = await fs.readFile(dashboardPath, 'utf8')
  const updated = replaceSnapshotBlock(html, snapshot)
  await fs.writeFile(dashboardPath, updated, 'utf8')

  console.log(`[OK] cost snapshot refreshed at ${snapshot.snapshot_at}`)
  console.log(`     1h  · $${snapshot.aggregate_1h_usd ?? '(no-data)'}`)
  console.log(`     24h · $${snapshot.aggregate_24h_usd ?? '(no-data)'}`)
  console.log(`     7d  · $${snapshot.aggregate_7d_usd ?? '(no-data)'}`)
  console.log(`     status · ${snapshot.status}`)
  console.log(`     wrote · ${dashboardPath}`)
}

main().catch((err) => {
  console.error(`[FATAL] ${err.stack || err.message || err}`)
  process.exit(1)
})
