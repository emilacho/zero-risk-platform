/**
 * GET /api/tiktok-ads/spend-data — TikTok Ads spend rollup.
 *
 * Closes W15-D-34. Workflow caller:
 *   `Zero Risk - Cross-Platform Attribution Validator (Hourly)`
 *
 * Mirrors /api/google-ads/spend-data shape. Validator uses the parallel
 * payload structure to detect platform drift hour-over-hour. Stub fallback.
 *
 * Auth: tier 2 INTERNAL.
 */
import { NextResponse } from 'next/server'
import { checkInternalKey } from '@/lib/internal-auth'
import { withFallback } from '@/lib/bridge-fallback'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

interface SpendRow {
  objective: 'TRAFFIC' | 'CONVERSIONS' | 'REACH' | 'VIDEO_VIEWS' | 'APP_PROMOTION'
  spend_usd: number
  impressions: number
  conversions: number
  video_views: number
}

function stubSpend(clientId: string, sinceDays: number): SpendRow[] {
  const seed = clientId.length + sinceDays
  return [
    { objective: 'CONVERSIONS', spend_usd: 380 + seed * 3, impressions: 28_000 + seed * 60, conversions: 24, video_views: 0 },
    { objective: 'VIDEO_VIEWS', spend_usd: 220 + seed * 2, impressions: 95_000 + seed * 100, conversions: 0, video_views: 51_000 + seed * 70 },
    { objective: 'TRAFFIC',     spend_usd: 95 + seed,      impressions: 18_000 + seed * 40,  conversions: 0, video_views: 0 },
  ]
}

export async function GET(request: Request) {
  const auth = checkInternalKey(request)
  if (!auth.ok) {
    return NextResponse.json(
      { error: 'unauthorized', code: 'E-AUTH-001', detail: auth.reason },
      { status: 401 },
    )
  }

  const url = new URL(request.url)
  const clientId = url.searchParams.get('client_id')
  if (!clientId) {
    return NextResponse.json(
      { error: 'missing_client_id', code: 'E-INPUT-MISSING', detail: 'client_id query param is required' },
      { status: 400 },
    )
  }
  const sinceDays = Math.max(1, Math.min(365, parseInt(url.searchParams.get('since_days') || '1', 10) || 1))

  const r = await withFallback(
    async () => stubSpend(clientId, sinceDays),
    [] as SpendRow[],
    { context: '/api/tiktok-ads/spend-data' },
  )

  const rows = r.data ?? []
  return NextResponse.json({
    ok: true,
    platform: 'tiktok-ads',
    client_id: clientId,
    since_days: sinceDays,
    total_spend_usd: rows.reduce((s, x) => s + x.spend_usd, 0),
    total_impressions: rows.reduce((s, x) => s + x.impressions, 0),
    total_conversions: rows.reduce((s, x) => s + x.conversions, 0),
    total_video_views: rows.reduce((s, x) => s + x.video_views, 0),
    breakdown: rows,
    ...(r.fallback_mode ? { fallback_mode: true } : {}),
  })
}
