/**
 * GET /api/[platform]/campaign-stats — generic ads-platform campaign-stats reader.
 *
 * Closes W15-D-01. Workflow caller:
 *   `Zero Risk - TikTok + LinkedIn Unified Manager (Daily 5am)`
 *
 * Workflow URL: `/api/${platform}-ads/campaign-stats` where ${platform} ∈ {tiktok, linkedin}.
 * Implemented as a Next.js dynamic route so adding a platform doesn't need a new file.
 *
 * Allowed: tiktok-ads · linkedin-ads · meta-ads · google-ads.
 * Unknown platforms → 404. Known platforms with no real data → deterministic stub.
 *
 * Auth: tier 2 INTERNAL (checkInternalKey).
 */
import { NextResponse } from 'next/server'
import { checkInternalKey } from '@/lib/internal-auth'
import { withFallback } from '@/lib/bridge-fallback'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const ALLOWED_PLATFORMS = new Set(['tiktok-ads', 'linkedin-ads', 'meta-ads', 'google-ads'])

interface CampaignStat {
  campaign_id: string
  campaign_name: string
  spend_usd: number
  impressions: number
  clicks: number
  conversions: number
  ctr: number
  cpc_usd: number
  roas: number
}

function stubStats(platform: string, clientId: string, sinceDays: number): CampaignStat[] {
  const seed = (platform + clientId).length + sinceDays
  return [
    {
      campaign_id: `${platform}-cmp-${seed}-1`,
      campaign_name: `${platform} Brand Awareness Q2`,
      spend_usd: 1240 + seed * 7,
      impressions: 84_000 + seed * 100,
      clicks: 920 + seed * 3,
      conversions: 38 + (seed % 12),
      ctr: 0.0109,
      cpc_usd: 1.35,
      roas: 3.2,
    },
    {
      campaign_id: `${platform}-cmp-${seed}-2`,
      campaign_name: `${platform} Retargeting`,
      spend_usd: 680 + seed * 4,
      impressions: 42_000 + seed * 80,
      clicks: 510 + seed * 2,
      conversions: 22 + (seed % 8),
      ctr: 0.0121,
      cpc_usd: 1.33,
      roas: 4.1,
    },
  ]
}

export async function GET(request: Request, { params }: { params: { platform: string } }) {
  const auth = checkInternalKey(request)
  if (!auth.ok) {
    return NextResponse.json(
      { error: 'unauthorized', code: 'E-AUTH-001', detail: auth.reason },
      { status: 401 },
    )
  }

  const platform = params.platform.toLowerCase()
  if (!ALLOWED_PLATFORMS.has(platform)) {
    return NextResponse.json(
      { error: 'unknown_platform', code: 'E-INPUT-INVALID', detail: `platform must be one of: ${[...ALLOWED_PLATFORMS].join(', ')}` },
      { status: 404 },
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

  const sinceDaysRaw = url.searchParams.get('since_days')
  const sinceDays = Math.max(1, Math.min(365, parseInt(sinceDaysRaw || '7', 10) || 7))

  const r = await withFallback(
    async () => stubStats(platform, clientId, sinceDays),
    [] as CampaignStat[],
    { context: `/api/${platform}/campaign-stats` },
  )

  return NextResponse.json({
    ok: true,
    platform,
    client_id: clientId,
    since_days: sinceDays,
    count: r.data?.length ?? 0,
    campaigns: r.data,
    ...(r.fallback_mode ? { fallback_mode: true } : {}),
  })
}
