/**
 * POST/GET /api/cost-monitor/cron · §150 G5 cost monitor · SHADOW-first
 *
 * Triggered hourly by Vercel Cron (see vercel.json `crons[]`). Aggregates
 * `agent_invocations.cost_usd` over two windows and evaluates three canonical
 * thresholds · daily per-workflow ($10), daily aggregate ($100), hourly
 * burst ($5). The hourly burst threshold is the one that would have caught
 * the 2026-05-24 NEXUS spam incident (≈$19/day · ≈659 invocations · burst
 * pattern · daily-only monitoring missed it).
 *
 * SHADOW MODE · this endpoint detects breaches and writes a row to
 * `cost_monitor_runs` (with is_breach + breach details) but does NOT dispatch
 * any Slack alert. Baseline is built by inspecting `cost_monitor_runs` rows.
 * Flip to alert-live is documented in the runbook and gated by env var
 * `COST_MONITOR_SHADOW_MODE` (default: "1" = shadow).
 *
 * Auth · accepts EITHER `Authorization: Bearer <CRON_SECRET>` (Vercel Cron
 * default header) OR `x-api-key: <CRON_SECRET>` (manual smoke trigger). Both
 * compare timing-safe against `process.env.CRON_SECRET`.
 *
 * Canon · §150 G4 audit trail · every run writes a row, breach or not.
 * Canon · §150 G5 cost monitor · this is the missing piece (CC#3 audit
 *         2026-05-30 confirmed G5 was unimplemented pre-this-PR).
 * Canon · §148 honest reporting · returns structured JSON with the
 *         aggregations so smoke tests can assert the exact values.
 */
import { NextResponse } from 'next/server'
import crypto from 'node:crypto'
import { getSupabaseAdmin } from '@/lib/supabase'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30 // seconds · aggregation is light

// Canonical thresholds (USD). Snapshotted into each cost_monitor_runs row so
// historical rows stay interpretable when thresholds tune later.
const THRESHOLD_DAILY_PER_WORKFLOW_USD = 10
const THRESHOLD_DAILY_AGGREGATE_USD    = 100
const THRESHOLD_HOURLY_BURST_USD       = 5

interface InvocationRow {
  workflow_id: string | null
  cost_usd: number | null
}

interface Breach {
  type: 'daily_per_workflow' | 'daily_aggregate' | 'hourly_burst'
  workflow_id?: string
  spend_usd: number
  threshold: number
}

function checkAuth(req: Request): { ok: true } | { ok: false; reason: string } {
  const expected = process.env.CRON_SECRET
  if (!expected) {
    return { ok: false, reason: 'CRON_SECRET env var not configured' }
  }
  const bearer = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? ''
  const apiKey = req.headers.get('x-api-key') ?? ''
  const got = bearer || apiKey
  if (!got) return { ok: false, reason: 'Missing Authorization Bearer or x-api-key header' }

  const a = Buffer.from(got)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return { ok: false, reason: 'Invalid secret' }
  if (!crypto.timingSafeEqual(a, b)) return { ok: false, reason: 'Invalid secret' }
  return { ok: true }
}

function aggregateByWorkflow(rows: InvocationRow[]): Record<string, number> {
  const map: Record<string, number> = {}
  for (const r of rows) {
    const wf = r.workflow_id ?? '__null_workflow__'
    map[wf] = (map[wf] ?? 0) + (r.cost_usd ?? 0)
  }
  return map
}

function sumAll(rows: InvocationRow[]): number {
  return rows.reduce((s, r) => s + (r.cost_usd ?? 0), 0)
}

async function runMonitor(req: Request) {
  const auth = checkAuth(req)
  if (!auth.ok) {
    return NextResponse.json(
      { error: 'unauthorized', detail: auth.reason },
      { status: 401 },
    )
  }

  const shadowMode = (process.env.COST_MONITOR_SHADOW_MODE ?? '1') !== '0'
  const supabase = getSupabaseAdmin()
  const now = new Date()
  const since24h = new Date(now.getTime() - 24 * 3600_000).toISOString()
  const since1h = new Date(now.getTime() - 3600_000).toISOString()

  // Pull rows from agent_invocations · the canonical source of truth. We use
  // started_at (not created_at) because the writers use started_at for the
  // actual invocation moment.
  const [{ data: rows24h, error: e24 }, { data: rows1h, error: e1 }] =
    await Promise.all([
      supabase
        .from('agent_invocations')
        .select('workflow_id, cost_usd')
        .gte('started_at', since24h),
      supabase
        .from('agent_invocations')
        .select('workflow_id, cost_usd')
        .gte('started_at', since1h),
    ])

  if (e24 || e1) {
    const errMsg = e24?.message || e1?.message || 'unknown supabase error'
    // Best-effort audit row · the cron fired but the aggregation failed.
    await supabase.from('cost_monitor_runs').insert({
      ran_at: now.toISOString(),
      aggregate_24h_usd: 0,
      aggregate_1h_usd: 0,
      threshold_daily_per_workflow_usd: THRESHOLD_DAILY_PER_WORKFLOW_USD,
      threshold_daily_aggregate_usd: THRESHOLD_DAILY_AGGREGATE_USD,
      threshold_hourly_burst_usd: THRESHOLD_HOURLY_BURST_USD,
      is_breach: false,
      breach_count: 0,
      details: { error: errMsg },
      shadow_mode: shadowMode,
      alert_dispatched: false,
      error_message: errMsg.slice(0, 400),
    })
    return NextResponse.json(
      { error: 'aggregation_failed', detail: errMsg.slice(0, 200) },
      { status: 500 },
    )
  }

  const rows24 = (rows24h ?? []) as InvocationRow[]
  const rows1 = (rows1h ?? []) as InvocationRow[]

  const perWorkflow24h = aggregateByWorkflow(rows24)
  const aggregate24h = Number(sumAll(rows24).toFixed(4))
  const aggregate1h = Number(sumAll(rows1).toFixed(4))

  const breaches: Breach[] = []
  for (const [wfId, cost] of Object.entries(perWorkflow24h)) {
    if (cost > THRESHOLD_DAILY_PER_WORKFLOW_USD) {
      breaches.push({
        type: 'daily_per_workflow',
        workflow_id: wfId,
        spend_usd: Number(cost.toFixed(4)),
        threshold: THRESHOLD_DAILY_PER_WORKFLOW_USD,
      })
    }
  }
  if (aggregate24h > THRESHOLD_DAILY_AGGREGATE_USD) {
    breaches.push({
      type: 'daily_aggregate',
      spend_usd: aggregate24h,
      threshold: THRESHOLD_DAILY_AGGREGATE_USD,
    })
  }
  if (aggregate1h > THRESHOLD_HOURLY_BURST_USD) {
    breaches.push({
      type: 'hourly_burst',
      spend_usd: aggregate1h,
      threshold: THRESHOLD_HOURLY_BURST_USD,
    })
  }

  const isBreach = breaches.length > 0

  // Audit row · always inserted, breach or not. Forensics view.
  const { data: insertedRow, error: insertErr } = await supabase
    .from('cost_monitor_runs')
    .insert({
      ran_at: now.toISOString(),
      aggregate_24h_usd: aggregate24h,
      aggregate_1h_usd: aggregate1h,
      threshold_daily_per_workflow_usd: THRESHOLD_DAILY_PER_WORKFLOW_USD,
      threshold_daily_aggregate_usd: THRESHOLD_DAILY_AGGREGATE_USD,
      threshold_hourly_burst_usd: THRESHOLD_HOURLY_BURST_USD,
      is_breach: isBreach,
      breach_count: breaches.length,
      details: {
        per_workflow_24h: perWorkflow24h,
        breaches,
        invocations_24h: rows24.length,
        invocations_1h: rows1.length,
      },
      shadow_mode: shadowMode,
      alert_dispatched: false, // SHADOW-first · never dispatch from this PR
    })
    .select()
    .single()

  if (insertErr) {
    // Non-fatal · log to console so Vercel surfaces it, but still return the
    // computed aggregations to the caller (smoke tests can still assert).
    console.warn('[cost-monitor-cron] cost_monitor_runs insert failed:', insertErr.message)
  }

  return NextResponse.json({
    ok: true,
    ran_at: now.toISOString(),
    shadow_mode: shadowMode,
    alert_dispatched: false,
    aggregate_24h_usd: aggregate24h,
    aggregate_1h_usd: aggregate1h,
    invocations_24h: rows24.length,
    invocations_1h: rows1.length,
    is_breach: isBreach,
    breach_count: breaches.length,
    breaches,
    thresholds: {
      daily_per_workflow_usd: THRESHOLD_DAILY_PER_WORKFLOW_USD,
      daily_aggregate_usd: THRESHOLD_DAILY_AGGREGATE_USD,
      hourly_burst_usd: THRESHOLD_HOURLY_BURST_USD,
    },
    run_id: insertedRow?.id ?? null,
  })
}

// Vercel Cron fires GET by default. We accept POST too so manual smoke
// triggers via curl/scripts can use either verb.
export async function GET(req: Request) {
  return runMonitor(req)
}
export async function POST(req: Request) {
  return runMonitor(req)
}
