/**
 * POST /api/rank-tracking/initialize
 * Called by the Flagship SEO workflow after Opus synthesis.
 * Body: { client_id, domain, keywords[], locale, duration_days, frequency, track_serp_features[] }
 * Effect: stamps an initial (rank=null) row per keyword so the daily cron knows what to track.
 */
import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { checkInternalKey } from '@/lib/internal-auth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(request: Request) {
  const auth = checkInternalKey(request)
  if (!auth.ok) return NextResponse.json({ error: 'unauthorized', detail: auth.reason }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const clientId = body.client_id
  const domain = body.domain
  const keywords: string[] = Array.isArray(body.keywords) ? body.keywords.filter(Boolean) : []
  const country = body.locale?.country ?? 'EC'

  if (!clientId || !domain || keywords.length === 0) {
    return NextResponse.json({ error: 'client_id, domain, keywords[] required' }, { status: 400 })
  }

  const supabase = getSupabaseAdmin()

  // Find latest engagement for this domain to anchor tracking rows.
  const { data: engagement } = await supabase
    .from('seo_engagements')
    .select('id')
    .eq('client_id', clientId)
    .eq('domain', domain)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!engagement) {
    return NextResponse.json({ error: 'no engagement found for client+domain' }, { status: 404 })
  }

  const today = new Date().toISOString().slice(0, 10)
  const rows = keywords.map((kw) => ({
    engagement_id: engagement.id,
    client_id: clientId,
    domain,
    keyword: kw,
    country,
    rank: null,
    serp_features: [],
    checked_at: today,
  }))

  // Upsert so re-init is safe.
  const { error } = await supabase
    .from('rank_tracking_daily')
    .upsert(rows, { onConflict: 'engagement_id,keyword,country,checked_at', ignoreDuplicates: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, engagement_id: engagement.id, keywords_initialized: keywords.length })
}
