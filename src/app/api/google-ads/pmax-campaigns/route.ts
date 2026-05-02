/**
 * GET /api/google-ads/pmax-campaigns — list of Performance Max campaigns.
 *
 * Closes W15-D-17. Workflow caller:
 *   `Zero Risk - Google Ads Performance Max Optimizer (Daily 4am)`
 *
 * Lighter-weight than /campaign-performance — used by the optimizer to
 * enumerate which PMax campaigns to inspect deeper. Stub fallback for
 * pre-prod / no-creds windows.
 *
 * Auth: tier 2 INTERNAL.
 */
import { NextResponse } from 'next/server'
import { checkInternalKey } from '@/lib/internal-auth'
import { withFallback } from '@/lib/bridge-fallback'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

interface PmaxCampaign {
  campaign_id: string
  campaign_name: string
  status: 'ENABLED' | 'PAUSED' | 'REMOVED'
  budget_usd_daily: number
  start_date: string
  asset_group_count: number
  optimization_score: number
}

function stubPmax(clientId: string): PmaxCampaign[] {
  const seed = clientId.length
  return [
    {
      campaign_id: `pmax-${seed}-1`,
      campaign_name: 'PMax - Generic Q2',
      status: 'ENABLED',
      budget_usd_daily: 80,
      start_date: '2026-04-01',
      asset_group_count: 3,
      optimization_score: 0.78,
    },
    {
      campaign_id: `pmax-${seed}-2`,
      campaign_name: 'PMax - Branded Retargeting',
      status: 'ENABLED',
      budget_usd_daily: 35,
      start_date: '2026-03-15',
      asset_group_count: 2,
      optimization_score: 0.91,
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
    async () => stubPmax(clientId),
    [] as PmaxCampaign[],
    { context: '/api/google-ads/pmax-campaigns' },
  )

  const campaigns = r.data ?? []
  return NextResponse.json({
    ok: true,
    client_id: clientId,
    count: campaigns.length,
    total_daily_budget_usd: campaigns.reduce((s, c) => s + c.budget_usd_daily, 0),
    campaigns,
    ...(r.fallback_mode ? { fallback_mode: true } : {}),
  })
}
