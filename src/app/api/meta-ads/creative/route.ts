/**
 * GET /api/meta-ads/creative?creative_id=X
 *
 * Fetches a Meta Ads creative's headline/body/CTA. Stub returns deterministic
 * mock data for smoke tests; real impl would hit Meta Marketing API via the
 * System User Token stored in Vercel env.
 */

import { NextResponse } from 'next/server'
import { checkInternalKey } from '@/lib/internal-auth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(request: Request) {
  const auth = checkInternalKey(request)
  if (!auth.ok) return NextResponse.json({ error: 'unauthorized', detail: auth.reason }, { status: 401 })

  const url = new URL(request.url)
  const creativeId = url.searchParams.get('creative_id') || 'unknown'
  const isSmoke = creativeId.startsWith('smoke-') || creativeId === 'unknown'

  return NextResponse.json({
    ok: true,
    creative_id: creativeId,
    creative_headline: isSmoke ? '[stub] Save 30% today' : 'TBD',
    creative_body: isSmoke ? '[stub] Limited time offer for new customers.' : 'TBD',
    creative_cta: isSmoke ? 'Shop Now' : 'Learn More',
    asset_url: `https://stub.cdn.local/creatives/${creativeId}.jpg`,
    format: 'single_image',
    platforms: ['facebook', 'instagram'],
    ad_account_id: 'stub',
    fallback_mode: true,
  })
}

export async function POST(request: Request) {
  // Some workflows may POST here — accept and echo
  const body = await request.json().catch(() => ({}))
  return NextResponse.json({ ok: true, echo: body, fallback_mode: true })
}
