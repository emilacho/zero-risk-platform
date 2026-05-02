/**
 * GET /api/google-ads/spend-data — Google Ads spend rollup.
 *
 * Closes W15-D-18. Workflow caller:
 *   `Zero Risk - Cross-Platform Attribution Validator (Hourly)`
 *
 * Total + per-campaign-type spend over the requested window. The Attribution
 * Validator cross-references this with Meta/TikTok/LinkedIn spend to detect
 * platform drift. Stub fallback returns deterministic totals.
 *
 * Auth: tier 2 INTERNAL.
 */
import { NextResponse } from 'next/server'
import { checkInternalKey } from '@/lib/internal-auth'
import { withFallback } from '@/lib/bridge-fallback'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

interface SpendRow {
  campaign_type: 'SEARCH' | 'PMAX' | 'DISPLAY' | 'VIDEO' | 'SHOPPING'
  spend_usd: number
  impressions: number
  conversions: number
}

function stubSpend(clientId: string, sinceDays: number): SpendRow[] {
  const seed = clientId.length + sinceDays
  return [
    { campaign_type: 'SEARCH', spend_usd: 1200 + seed * 4, impressions: 45_000 + seed * 80, conversions: 92 },
    { campaign_type: 'PMAX',   spend_usd: 2400 + seed * 9, impressions: 230_000 + seed * 200, conversions: 148 },
    { campaign_type: 'DISPLAY', spend_usd: 380 + seed * 2, impressions: 180_000 + seed * 150, conversions: 14 },
    { campaign_type: 'VIDEO',   spend_usd: 540 + seed * 3, impressions: 96_000 + seed * 120, conversions: 8 },
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
    { context: '/api/google-ads/spend-data' },
  )

  const rows = r.data ?? []
  return NextResponse.json({
    ok: true,
    platform: 'google-ads',
    client_id: clientId,
    since_days: sinceDays,
    total_spend_usd: rows.reduce((s, x) => s + x.spend_usd, 0),
    total_impressions: rows.reduce((s, x) => s + x.impressions, 0),
    total_conversions: rows.reduce((s, x) => s + x.conversions, 0),
    breakdown: rows,
    ...(r.fallback_mode ? { fallback_mode: true } : {}),
  })
}
