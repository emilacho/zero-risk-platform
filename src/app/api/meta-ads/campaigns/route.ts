/**
 * Meta Ads — Campaigns list
 *
 * Proxy to Meta Graph API v21.0. Lists campaigns for the configured ad account.
 * Used by: Meta Ads Full-Stack Optimizer v2 (cluster 4) + TikTok+LinkedIn Manager
 * for cross-platform comparison.
 *
 * GET ?status=ACTIVE&days=7&client_id=xxx
 *
 * Env vars required:
 *   META_ACCESS_TOKEN   — long-lived System User token
 *   META_AD_ACCOUNT_ID  — format: act_1234567890
 *
 * Returns { campaigns: [...], count, source: 'meta_graph_v21' }
 * 503 if env not configured.
 */

import { NextRequest, NextResponse } from 'next/server'
import { checkInternalKey } from '@/lib/internal-auth'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

const META_GRAPH_BASE = 'https://graph.facebook.com/v21.0'

export async function GET(request: NextRequest) {
  const auth = checkInternalKey(request)
  if (!auth.ok) {
    return NextResponse.json({ error: 'unauthorized', detail: auth.reason }, { status: 401 })
  }

  const token = process.env.META_ACCESS_TOKEN
  const adAccountId = process.env.META_AD_ACCOUNT_ID
  if (!token || !adAccountId) {
    return NextResponse.json(
      {
        error: 'not_configured',
        detail: 'META_ACCESS_TOKEN and/or META_AD_ACCOUNT_ID missing. Set in Vercel env vars after FASE B signup.',
        missing: [!token && 'META_ACCESS_TOKEN', !adAccountId && 'META_AD_ACCOUNT_ID'].filter(Boolean),
      },
      { status: 503 }
    )
  }

  const status = request.nextUrl.searchParams.get('status') || 'ACTIVE'
  const days = Math.min(Number(request.nextUrl.searchParams.get('days') || '7'), 90)
  const client_id = request.nextUrl.searchParams.get('client_id')
  const limit = Math.min(Number(request.nextUrl.searchParams.get('limit') || '50'), 200)

  const fields = [
    'id',
    'name',
    'status',
    'effective_status',
    'objective',
    'daily_budget',
    'lifetime_budget',
    'created_time',
    'updated_time',
    'start_time',
    'stop_time',
    'buying_type',
    'special_ad_categories',
  ].join(',')

  const filtering = JSON.stringify([
    { field: 'effective_status', operator: 'IN', value: [status] },
  ])

  const url = `${META_GRAPH_BASE}/${adAccountId}/campaigns?fields=${fields}&filtering=${encodeURIComponent(filtering)}&limit=${limit}&access_token=${token}`

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(25000) })
    const data = await res.json()

    if (!res.ok) {
      return NextResponse.json(
        { error: 'meta_api_error', status: res.status, detail: data?.error || data },
        { status: res.status }
      )
    }

    const campaigns = (data.data || []).map((c: Record<string, unknown>) => ({
      campaign_id: c.id,
      campaign_name: c.name,
      status: c.status,
      effective_status: c.effective_status,
      objective: c.objective,
      daily_budget: c.daily_budget ? Number(c.daily_budget) / 100 : null,
      lifetime_budget: c.lifetime_budget ? Number(c.lifetime_budget) / 100 : null,
      created_time: c.created_time,
      updated_time: c.updated_time,
      client_id: client_id || null,
    }))

    return NextResponse.json({
      campaigns,
      count: campaigns.length,
      source: 'meta_graph_v21',
      days_filter: days,
      next_page: data.paging?.next || null,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.error('[meta-ads/campaigns] fetch error:', msg)
    return NextResponse.json({ error: 'fetch_error', detail: msg }, { status: 502 })
  }
}
