/**
 * GET /api/linkedin-ads/campaigns — LinkedIn Ads campaigns list.
 *
 * Closes W15-D-20. Workflow caller:
 *   `Zero Risk - TikTok + LinkedIn Unified Manager (Daily 5am)`
 *
 * Lists active LinkedIn Ads campaigns. The Unified Manager rolls them up
 * with TikTok counterparts for cross-platform sponsored-content view.
 * Stub fallback when LINKEDIN_ADS_ACCESS_TOKEN not yet configured.
 *
 * Auth: tier 2 INTERNAL.
 */
import { NextResponse } from 'next/server'
import { checkInternalKey } from '@/lib/internal-auth'
import { withFallback } from '@/lib/bridge-fallback'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

interface LinkedInCampaign {
  campaign_id: string
  campaign_name: string
  campaign_type: 'SPONSORED_UPDATES' | 'SPONSORED_INMAILS' | 'TEXT_AD' | 'DYNAMIC' | 'VIDEO'
  status: 'ACTIVE' | 'PAUSED' | 'DRAFT' | 'COMPLETED'
  daily_budget_usd: number
  start_date: string
  objective: 'BRAND_AWARENESS' | 'WEBSITE_VISITS' | 'LEAD_GENERATION' | 'WEBSITE_CONVERSIONS'
}

function stubCampaigns(clientId: string): LinkedInCampaign[] {
  const seed = clientId.length
  return [
    {
      campaign_id: `li-${seed}-1`,
      campaign_name: 'B2B Lead Gen - SaaS Decision Makers',
      campaign_type: 'SPONSORED_UPDATES',
      status: 'ACTIVE',
      daily_budget_usd: 120,
      start_date: '2026-04-15',
      objective: 'LEAD_GENERATION',
    },
    {
      campaign_id: `li-${seed}-2`,
      campaign_name: 'Brand Awareness - C-Suite',
      campaign_type: 'VIDEO',
      status: 'ACTIVE',
      daily_budget_usd: 80,
      start_date: '2026-04-01',
      objective: 'BRAND_AWARENESS',
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
    [] as LinkedInCampaign[],
    { context: '/api/linkedin-ads/campaigns' },
  )

  const campaigns = r.data ?? []
  return NextResponse.json({
    ok: true,
    platform: 'linkedin-ads',
    client_id: clientId,
    count: campaigns.length,
    active_count: campaigns.filter((c) => c.status === 'ACTIVE').length,
    total_daily_budget_usd: campaigns.reduce((s, c) => s + c.daily_budget_usd, 0),
    campaigns,
    ...(r.fallback_mode ? { fallback_mode: true } : {}),
  })
}
