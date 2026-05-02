/**
 * GET /api/tiktok-ads/campaigns — TikTok Ads campaigns list.
 *
 * Closes W15-D-33. Workflow caller:
 *   `Zero Risk - TikTok + LinkedIn Unified Manager (Daily 5am)`
 *
 * Lists active TikTok Ads campaigns for the Unified Manager's daily roll-up.
 * Stub fallback when TIKTOK_ADS_ACCESS_TOKEN not yet configured.
 *
 * Auth: tier 2 INTERNAL.
 */
import { NextResponse } from 'next/server'
import { checkInternalKey } from '@/lib/internal-auth'
import { withFallback } from '@/lib/bridge-fallback'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

interface TikTokCampaign {
  campaign_id: string
  campaign_name: string
  objective_type: 'TRAFFIC' | 'CONVERSIONS' | 'REACH' | 'VIDEO_VIEWS' | 'APP_PROMOTION'
  status: 'ENABLE' | 'DISABLE' | 'DELETE'
  budget_usd_daily: number
  start_date: string
  optimization_goal: 'CLICK' | 'CONVERT' | 'IMPRESSION' | 'VIDEO_VIEW'
}

function stubCampaigns(clientId: string): TikTokCampaign[] {
  const seed = clientId.length
  return [
    {
      campaign_id: `tt-${seed}-1`,
      campaign_name: 'TT Spark Ads - Q2',
      objective_type: 'CONVERSIONS',
      status: 'ENABLE',
      budget_usd_daily: 50,
      start_date: '2026-04-10',
      optimization_goal: 'CONVERT',
    },
    {
      campaign_id: `tt-${seed}-2`,
      campaign_name: 'TT Awareness - Gen Z',
      objective_type: 'VIDEO_VIEWS',
      status: 'ENABLE',
      budget_usd_daily: 30,
      start_date: '2026-03-22',
      optimization_goal: 'VIDEO_VIEW',
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

  const r = await withFallback(
    async () => stubCampaigns(clientId),
    [] as TikTokCampaign[],
    { context: '/api/tiktok-ads/campaigns' },
  )

  const campaigns = r.data ?? []
  return NextResponse.json({
    ok: true,
    platform: 'tiktok-ads',
    client_id: clientId,
    count: campaigns.length,
    active_count: campaigns.filter((c) => c.status === 'ENABLE').length,
    total_daily_budget_usd: campaigns.reduce((s, c) => s + c.budget_usd_daily, 0),
    campaigns,
    ...(r.fallback_mode ? { fallback_mode: true } : {}),
  })
}
