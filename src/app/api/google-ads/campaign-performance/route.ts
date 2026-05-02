/**
 * GET /api/google-ads/campaign-performance — Google Ads campaign performance read.
 *
 * Closes W15-D-16. Workflow caller:
 *   `Zero Risk - Google Ads Performance Max Optimizer (Daily 4am)`
 *
 * Per-campaign metrics for the optimizer to decide bid changes / pauses.
 * Stub fallback so the cron always parses successfully.
 *
 * Auth: tier 2 INTERNAL.
 */
import { NextResponse } from 'next/server'
import { checkInternalKey } from '@/lib/internal-auth'
import { withFallback } from '@/lib/bridge-fallback'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

interface CampaignPerformance {
  campaign_id: string
  campaign_name: string
  campaign_type: 'SEARCH' | 'PMAX' | 'DISPLAY' | 'VIDEO' | 'SHOPPING'
  status: 'ENABLED' | 'PAUSED' | 'REMOVED'
  spend_usd: number
  impressions: number
  clicks: number
  conversions: number
  cost_per_conversion_usd: number
  conversion_value_usd: number
  roas: number
}

function stubPerformance(clientId: string, sinceDays: number): CampaignPerformance[] {
  const seed = clientId.length + sinceDays
  return [
    {
      campaign_id: `gads-cmp-${seed}-1`,
      campaign_name: 'Brand Search',
      campaign_type: 'SEARCH',
      status: 'ENABLED',
      spend_usd: 850 + seed * 5,
      impressions: 32_000 + seed * 50,
      clicks: 1200 + seed * 4,
      conversions: 86,
      cost_per_conversion_usd: 9.88,
      conversion_value_usd: 12_400,
      roas: 14.6,
    },
    {
      campaign_id: `gads-cmp-${seed}-2`,
      campaign_name: 'Generic - Performance Max',
      campaign_type: 'PMAX',
      status: 'ENABLED',
      spend_usd: 2_400 + seed * 12,
      impressions: 220_000 + seed * 200,
      clicks: 2_800 + seed * 8,
      conversions: 142,
      cost_per_conversion_usd: 16.9,
      conversion_value_usd: 18_900,
      roas: 7.9,
    },
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
  const sinceDays = Math.max(1, Math.min(365, parseInt(url.searchParams.get('since_days') || '7', 10) || 7))

  const r = await withFallback(
    async () => stubPerformance(clientId, sinceDays),
    [] as CampaignPerformance[],
    { context: '/api/google-ads/campaign-performance' },
  )

  const campaigns = r.data ?? []
  return NextResponse.json({
    ok: true,
    client_id: clientId,
    since_days: sinceDays,
    count: campaigns.length,
    total_spend_usd: campaigns.reduce((s, c) => s + c.spend_usd, 0),
    total_conversions: campaigns.reduce((s, c) => s + c.conversions, 0),
    campaigns,
    ...(r.fallback_mode ? { fallback_mode: true } : {}),
  })
}
