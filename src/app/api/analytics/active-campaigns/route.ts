/**
 * Analytics — Active Campaigns
 *
 * Called by Cross-Platform Attribution Validator to enumerate active campaigns
 * across all clients that need hourly audit.
 *
 * GET ?client_id=xxx&platform=meta&limit=50
 *
 * Returns campaigns currently "active" from the campaigns table (which is
 * populated by Media Buyer agents + Meta/Google APIs).
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { checkInternalKey } from '@/lib/internal-auth'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const auth = checkInternalKey(request)
  if (!auth.ok) {
    return NextResponse.json({ error: 'unauthorized', detail: auth.reason }, { status: 401 })
  }

  const client_id = request.nextUrl.searchParams.get('client_id')
  const platform = request.nextUrl.searchParams.get('platform')
  const limit = Math.min(Number(request.nextUrl.searchParams.get('limit') || '50'), 200)

  const supabase = getSupabaseAdmin()

  // Query campaigns table (V2 existing) first; fallback to ad_performance_snapshots for platforms
  let query = supabase
    .from('campaigns')
    .select('id, client_id, name, platform, status, created_at, objective')
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (client_id) query = query.eq('client_id', client_id)
  if (platform) query = query.eq('platform', platform)

  const { data, error } = await query

  if (error) {
    // If campaigns table doesn't exist or errors, try ad_performance_snapshots as fallback
    console.warn('[analytics/active-campaigns] campaigns query failed, trying snapshots:', error.message)

    let snapshotQuery = supabase
      .from('ad_performance_snapshots')
      .select('campaign_id, client_id, platform')
      .gte('snapshot_date', new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString().split('T')[0])
      .order('snapshot_date', { ascending: false })
      .limit(limit * 5) // overfetch since we'll dedupe

    if (client_id) snapshotQuery = snapshotQuery.eq('client_id', client_id)
    if (platform) snapshotQuery = snapshotQuery.eq('platform', platform)

    const { data: snapData, error: snapErr } = await snapshotQuery

    if (snapErr) {
      return NextResponse.json({
        items: [],
        count: 0,
        source: 'none',
        warnings: [error.message, snapErr.message],
      })
    }

    // Dedupe by campaign_id
    const seen = new Set<string>()
    const unique = (snapData || []).filter((s: any) => {
      if (seen.has(s.campaign_id)) return false
      seen.add(s.campaign_id)
      return true
    }).slice(0, limit)

    return NextResponse.json({
      items: unique,
      count: unique.length,
      source: 'snapshots_fallback',
    })
  }

  return NextResponse.json({
    items: data || [],
    count: (data || []).length,
    source: 'campaigns',
  })
}
