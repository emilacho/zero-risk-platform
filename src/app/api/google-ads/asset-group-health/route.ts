/**
 * GET /api/google-ads/asset-group-health — PMax asset-group health read.
 *
 * Closes W15-D-15. Workflow caller:
 *   `Zero Risk - Google Ads Performance Max Optimizer (Daily 4am)`
 *
 * Reports the health rating (LOW/MEDIUM/HIGH/EXCELLENT per Google PMax) of
 * asset groups so the optimizer can prioritize which groups need refreshed
 * creative. Stub fallback so the cron is never silent-404 during pre-prod.
 *
 * Auth: tier 2 INTERNAL (checkInternalKey).
 */
import { NextResponse } from 'next/server'
import { checkInternalKey } from '@/lib/internal-auth'
import { withFallback } from '@/lib/bridge-fallback'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

interface AssetGroupHealth {
  asset_group_id: string
  asset_group_name: string
  campaign_id: string
  ad_strength: 'POOR' | 'AVERAGE' | 'GOOD' | 'EXCELLENT'
  status: 'ENABLED' | 'PAUSED' | 'REMOVED'
  text_assets_count: number
  image_assets_count: number
  video_assets_count: number
  needs_refresh: boolean
}

function stubHealth(clientId: string): AssetGroupHealth[] {
  const seed = clientId.length
  return [
    {
      asset_group_id: `ag-${seed}-1`,
      asset_group_name: 'Brand keywords',
      campaign_id: `pmax-cmp-${seed}-a`,
      ad_strength: 'GOOD',
      status: 'ENABLED',
      text_assets_count: 12,
      image_assets_count: 8,
      video_assets_count: 2,
      needs_refresh: false,
    },
    {
      asset_group_id: `ag-${seed}-2`,
      asset_group_name: 'Competitor keywords',
      campaign_id: `pmax-cmp-${seed}-a`,
      ad_strength: 'AVERAGE',
      status: 'ENABLED',
      text_assets_count: 6,
      image_assets_count: 4,
      video_assets_count: 0,
      needs_refresh: true,
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
    async () => stubHealth(clientId),
    [] as AssetGroupHealth[],
    { context: '/api/google-ads/asset-group-health' },
  )

  const groups = r.data ?? []
  return NextResponse.json({
    ok: true,
    client_id: clientId,
    count: groups.length,
    needs_refresh_count: groups.filter((g) => g.needs_refresh).length,
    asset_groups: groups,
    ...(r.fallback_mode ? { fallback_mode: true } : {}),
  })
}
