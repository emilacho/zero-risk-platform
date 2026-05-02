/**
 * GET /api/analytics/usage — usage-frequency metrics per client.
 *
 * Closes W15-D-05. Workflow caller:
 *   `Zero Risk - Account Health Score Daily`
 *
 * Returns active days, sessions, feature touches, MAU/WAU ratio for a client
 * over the last N days. Reads from `usage_events` (preferred), falls back to
 * a deterministic stub keyed off client_id when the table is missing/empty —
 * keeps the daily health-score cron deterministic until Posthog backfill.
 *
 * Auth: tier 2 INTERNAL.
 * Persistence: read-only over `usage_events`.
 */
import { NextResponse } from 'next/server'
import { checkInternalKey } from '@/lib/internal-auth'
import { getSupabaseAdmin } from '@/lib/supabase'
import { withSupabaseResult } from '@/lib/bridge-fallback'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

interface EventRow {
  user_id: string | null
  event_type: string | null
  occurred_at: string | null
}

interface UsageMetrics {
  client_id: string
  days: number
  active_days: number
  sessions: number
  unique_users: number
  events_total: number
  events_by_type: Record<string, number>
  mau_wau_ratio: number | null
  measured_from: string
  measured_to: string
}

function deterministicStubMetrics(clientId: string, days: number): UsageMetrics {
  let h = 0
  for (let i = 0; i < clientId.length; i++) h = (h * 31 + clientId.charCodeAt(i)) | 0
  const unique_users = 5 + (Math.abs(h) % 50)
  const sessions = unique_users * (8 + (Math.abs(h >> 4) % 25))
  const active_days = Math.min(days, 5 + (Math.abs(h >> 8) % (days - 4)))
  const measured_to = new Date().toISOString()
  const measured_from = new Date(Date.now() - days * 86_400_000).toISOString()
  return {
    client_id: clientId,
    days,
    active_days,
    sessions,
    unique_users,
    events_total: sessions * 4,
    events_by_type: { login: sessions, feature_touch: sessions * 2, export: Math.round(sessions * 0.3) },
    mau_wau_ratio: Number((1 + (Math.abs(h >> 12) % 200) / 100).toFixed(2)),
    measured_from,
    measured_to,
  }
}

export async function GET(request: Request) {
  const auth = checkInternalKey(request)
  if (!auth.ok) {
    return NextResponse.json(
      { error: 'unauthorized', code: 'E-AUTH-001', detail: auth.reason },
      { status: 401 },
    )
  }

  const u = new URL(request.url)
  const clientId = u.searchParams.get('client_id') || ''
  const rawDays = parseInt(u.searchParams.get('days') || '30', 10)
  const days = Number.isFinite(rawDays) ? Math.min(Math.max(rawDays, 1), 365) : 30

  if (!clientId) {
    return NextResponse.json(
      { error: 'missing_param', code: 'E-INPUT-MISSING', detail: 'client_id query param required' },
      { status: 400 },
    )
  }

  const since = new Date(Date.now() - days * 86_400_000).toISOString()
  const supabase = getSupabaseAdmin()
  const r = await withSupabaseResult<EventRow[]>(
    () =>
      supabase
        .from('usage_events')
        .select('user_id,event_type,occurred_at')
        .eq('client_id', clientId)
        .gte('occurred_at', since)
        .limit(50000),
    { context: '/api/analytics/usage' },
  )

  if (r.fallback_mode) {
    return NextResponse.json({
      ok: true,
      fallback_mode: true,
      metrics: deterministicStubMetrics(clientId, days),
      note: r.reason ?? 'usage_events query failed · stub served',
    })
  }

  const rows = r.data ?? []
  if (rows.length === 0) {
    return NextResponse.json({
      ok: true,
      fallback_mode: true,
      metrics: deterministicStubMetrics(clientId, days),
      note: 'No usage_events for this client · deterministic stub served',
    })
  }

  const dayKeys = new Set<string>()
  const userKeys = new Set<string>()
  const eventsByType: Record<string, number> = {}
  // For MAU/WAU we count active days within the last 7 vs full window.
  const sevenDaysAgo = Date.now() - 7 * 86_400_000
  const wauUsers = new Set<string>()
  for (const row of rows) {
    if (row.occurred_at) dayKeys.add(row.occurred_at.slice(0, 10))
    if (row.user_id) userKeys.add(row.user_id)
    if (row.event_type) eventsByType[row.event_type] = (eventsByType[row.event_type] ?? 0) + 1
    if (row.user_id && row.occurred_at && new Date(row.occurred_at).getTime() >= sevenDaysAgo) {
      wauUsers.add(row.user_id)
    }
  }
  const sessions = eventsByType['login'] ?? Math.round(rows.length / 4)
  const wau = wauUsers.size || 1
  const mau = userKeys.size || 1
  const ratio = Number((mau / wau).toFixed(2))

  return NextResponse.json({
    ok: true,
    metrics: {
      client_id: clientId,
      days,
      active_days: dayKeys.size,
      sessions,
      unique_users: userKeys.size,
      events_total: rows.length,
      events_by_type: eventsByType,
      mau_wau_ratio: ratio,
      measured_from: since,
      measured_to: new Date().toISOString(),
    },
  })
}
