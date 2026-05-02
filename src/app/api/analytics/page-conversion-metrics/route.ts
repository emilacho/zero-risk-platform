/**
 * GET /api/analytics/page-conversion-metrics — landing page conversion metrics.
 *
 * Closes W15-D-04. Workflow caller:
 *   `Zero Risk - Landing Page CRO Optimizer v2 (Sun 7am)`
 *
 * Returns sessions / conversions / conversion_rate / bounce_rate for a given
 * landing page URL over the last N days. Pulls from `page_conversion_metrics`
 * (preferred), falls back to a deterministic stub when the table is missing
 * or empty (no GA4 backfill yet). Stub is keyed off the URL hash so workflow
 * runs are reproducible during development.
 *
 * Auth: tier 2 INTERNAL.
 * Persistence: read-only over `page_conversion_metrics`.
 */
import { NextResponse } from 'next/server'
import { checkInternalKey } from '@/lib/internal-auth'
import { getSupabaseAdmin } from '@/lib/supabase'
import { withSupabaseResult } from '@/lib/bridge-fallback'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

interface MetricsRow {
  url: string
  sessions: number | null
  conversions: number | null
  conversion_rate: number | null
  bounce_rate: number | null
  avg_session_duration_sec: number | null
  measured_from: string | null
  measured_to: string | null
}

function deterministicStub(url: string, days: number): MetricsRow {
  // Stable hash → reproducible synthetic numbers (small but plausible).
  let hash = 0
  for (let i = 0; i < url.length; i++) hash = (hash * 31 + url.charCodeAt(i)) | 0
  const sessions = 800 + (Math.abs(hash) % 4000)
  const conversion_rate = ((Math.abs(hash >> 4) % 800) / 10000) + 0.012 // 1.2%–9.2%
  const conversions = Math.round(sessions * conversion_rate)
  const bounce_rate = 0.30 + ((Math.abs(hash >> 8) % 400) / 1000) // 30%–70%
  const measured_to = new Date().toISOString()
  const measured_from = new Date(Date.now() - days * 86_400_000).toISOString()
  return {
    url,
    sessions,
    conversions,
    conversion_rate: Number(conversion_rate.toFixed(4)),
    bounce_rate: Number(bounce_rate.toFixed(4)),
    avg_session_duration_sec: 30 + (Math.abs(hash >> 12) % 180),
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
  const target = u.searchParams.get('url') || u.searchParams.get('page_url') || ''
  const rawDays = parseInt(u.searchParams.get('days') || '30', 10)
  const days = Number.isFinite(rawDays) ? Math.min(Math.max(rawDays, 1), 365) : 30

  if (!target) {
    return NextResponse.json(
      { error: 'missing_param', code: 'E-INPUT-MISSING', detail: 'url query param required' },
      { status: 400 },
    )
  }

  const since = new Date(Date.now() - days * 86_400_000).toISOString()

  const supabase = getSupabaseAdmin()
  const r = await withSupabaseResult<MetricsRow[]>(
    () =>
      supabase
        .from('page_conversion_metrics')
        .select('url,sessions,conversions,conversion_rate,bounce_rate,avg_session_duration_sec,measured_from,measured_to')
        .eq('url', target)
        .gte('measured_to', since)
        .order('measured_to', { ascending: false })
        .limit(1),
    { context: '/api/analytics/page-conversion-metrics' },
  )

  if (r.fallback_mode) {
    return NextResponse.json({
      ok: true,
      fallback_mode: true,
      url: target,
      days,
      metrics: deterministicStub(target, days),
      note: r.reason ?? 'GA4 backfill pending · deterministic stub served',
    })
  }

  const rows = r.data ?? []
  if (rows.length === 0) {
    return NextResponse.json({
      ok: true,
      fallback_mode: true,
      url: target,
      days,
      metrics: deterministicStub(target, days),
      note: 'No rows in page_conversion_metrics for this URL · deterministic stub served',
    })
  }

  return NextResponse.json({
    ok: true,
    url: target,
    days,
    metrics: rows[0],
  })
}
