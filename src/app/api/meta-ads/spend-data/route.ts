/**
 * Meta Ads — Spend Data (for attribution reconciliation)
 *
 * Proxy to Meta Graph API insights endpoint. Returns spend + conversions
 * per campaign over the specified date range.
 *
 * Used by: Cross-Platform Attribution Validator (cluster 4) to compare
 * Meta's reported conversions vs GA4 / Google Ads / TikTok for discrepancy detection.
 *
 * GET ?campaign_id=xxx&date_preset=last_7d&client_id=xxx
 *   or
 * GET ?date_preset=last_1d&client_id=xxx   (account-wide)
 *
 * Env vars: META_ACCESS_TOKEN, META_AD_ACCOUNT_ID
 */

import { NextRequest, NextResponse } from 'next/server'
import { checkInternalKey } from '@/lib/internal-auth'
import { captureRouteError } from '@/lib/sentry-capture'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

const META_GRAPH_BASE = 'https://graph.facebook.com/v21.0'

// Valid date presets per Meta API docs
const VALID_DATE_PRESETS = new Set([
  'today', 'yesterday', 'last_3d', 'last_7d', 'last_14d', 'last_28d',
  'last_30d', 'last_90d', 'last_quarter', 'this_month', 'last_month',
])

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
        missing: [!token && 'META_ACCESS_TOKEN', !adAccountId && 'META_AD_ACCOUNT_ID'].filter(Boolean),
      },
      { status: 503 }
    )
  }

  const campaign_id = request.nextUrl.searchParams.get('campaign_id')
  const date_preset = request.nextUrl.searchParams.get('date_preset') || 'last_1d'
  const client_id = request.nextUrl.searchParams.get('client_id')
  const level = request.nextUrl.searchParams.get('level') || 'campaign' // campaign | ad | adset

  if (!VALID_DATE_PRESETS.has(date_preset)) {
    return NextResponse.json({ error: 'invalid_date_preset', got: date_preset }, { status: 400 })
  }

  const fields = [
    'campaign_id',
    'campaign_name',
    'spend',
    'impressions',
    'clicks',
    'cpc',
    'ctr',
    'reach',
    'frequency',
    'actions',
    'action_values',
    'cost_per_action_type',
    'purchase_roas',
  ].join(',')

  // Path: scope to campaign if provided, else account-wide
  const scope = campaign_id || adAccountId
  const url = `${META_GRAPH_BASE}/${scope}/insights?fields=${fields}&date_preset=${date_preset}&level=${level}&access_token=${token}`

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(25000) })
    const data = await res.json()

    if (!res.ok) {
      return NextResponse.json(
        { error: 'meta_api_error', status: res.status, detail: data?.error || data },
        { status: res.status }
      )
    }

    // Normalize: extract conversions/purchase actions into flat fields
    const rows = (data.data || []).map((r: Record<string, unknown>) => {
      const actions = (r.actions as Array<{ action_type: string; value: string }>) || []
      const actionValues = (r.action_values as Array<{ action_type: string; value: string }>) || []

      const getAction = (type: string) =>
        Number(actions.find((a) => a.action_type === type)?.value || 0)
      const getActionValue = (type: string) =>
        Number(actionValues.find((a) => a.action_type === type)?.value || 0)

      return {
        campaign_id: r.campaign_id,
        campaign_name: r.campaign_name,
        spend: Number(r.spend || 0),
        impressions: Number(r.impressions || 0),
        clicks: Number(r.clicks || 0),
        cpc: Number(r.cpc || 0),
        ctr: Number(r.ctr || 0),
        reach: Number(r.reach || 0),
        frequency: Number(r.frequency || 0),
        leads: getAction('lead'),
        purchases: getAction('purchase'),
        revenue: getActionValue('purchase'),
        roas: Array.isArray(r.purchase_roas) && r.purchase_roas[0]
          ? Number((r.purchase_roas as Array<{ value: string }>)[0].value)
          : null,
      }
    })

    const totals = rows.reduce(
      (acc: Record<string, number>, r: Record<string, number | string>) => {
        acc.spend += Number(r.spend)
        acc.impressions += Number(r.impressions)
        acc.clicks += Number(r.clicks)
        acc.purchases += Number(r.purchases)
        acc.leads += Number(r.leads)
        acc.revenue += Number(r.revenue)
        return acc
      },
      { spend: 0, impressions: 0, clicks: 0, purchases: 0, leads: 0, revenue: 0 }
    )

    return NextResponse.json({
      platform: 'meta',
      client_id: client_id || null,
      date_preset,
      level,
      rows,
      totals,
      count: rows.length,
      source: 'meta_graph_v21_insights',
    })
  } catch (err) {
    captureRouteError(err, request, {
      route: '/api/meta-ads/spend-data',
      source: 'route_handler',
    })
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.error('[meta-ads/spend-data] fetch error:', msg)
    return NextResponse.json({ error: 'fetch_error', detail: msg }, { status: 502 })
  }
}
