/**
 * Meta Ads · POST /api/meta-ads/insights/sync
 *
 * Daily cron consumer · pulls account-level insights (ad-level) for the requested
 * date and UPSERTs into meta_ads_insights_daily.
 *
 * Body:
 *   { snapshot_date?: 'YYYY-MM-DD', client_id?: string, campaign_id?: string }
 *
 * - snapshot_date defaults to yesterday (UTC)
 * - client_id is a TEXT tag stored on each row (does NOT filter Meta query)
 * - campaign_id (optional) scopes the Graph fetch to one campaign instead of account-wide
 *
 * Returns { synced, rows, snapshot_date, source }.
 * 503 if env not configured · 502 on Meta upstream failure.
 */
import { NextResponse } from 'next/server'
import { checkInternalKey } from '@/lib/internal-auth'
import { getSupabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const META_GRAPH_BASE = 'https://graph.facebook.com/v21.0'

function yesterdayUtc(): string {
  const d = new Date(Date.now() - 24 * 3600 * 1000)
  return d.toISOString().slice(0, 10)
}

type InsightAction = { action_type: string; value: string }
type InsightRow = {
  campaign_id?: string
  adset_id?: string
  ad_id?: string
  impressions?: string
  clicks?: string
  spend?: string
  cpc?: string
  ctr?: string
  reach?: string
  frequency?: string
  actions?: InsightAction[]
  action_values?: InsightAction[]
  cost_per_action_type?: InsightAction[]
  purchase_roas?: Array<{ value: string }>
}

export async function POST(request: Request) {
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

  let body: { snapshot_date?: string; client_id?: string; campaign_id?: string } = {}
  try {
    body = await request.json()
  } catch {
    // empty body acceptable
  }

  const snapshotDate = body.snapshot_date || yesterdayUtc()
  const clientId = body.client_id || null
  const campaignScope = body.campaign_id || adAccountId

  const fields = [
    'campaign_id', 'adset_id', 'ad_id',
    'impressions', 'clicks', 'spend', 'cpc', 'ctr',
    'reach', 'frequency',
    'actions', 'action_values', 'cost_per_action_type', 'purchase_roas',
  ].join(',')

  const timeRange = JSON.stringify({ since: snapshotDate, until: snapshotDate })
  const url = `${META_GRAPH_BASE}/${campaignScope}/insights?fields=${fields}&level=ad&time_range=${encodeURIComponent(timeRange)}&access_token=${encodeURIComponent(token)}`

  const res = await fetch(url, { signal: AbortSignal.timeout(45000) })
  const data = await res.json().catch(() => ({ error: 'invalid_json_response' }))
  if (!res.ok) {
    return NextResponse.json(
      { error: 'meta_api_error', status: res.status, detail: data?.error || data },
      { status: 502 }
    )
  }

  const rows = (data.data || []) as InsightRow[]
  const supabase = getSupabaseAdmin()
  const upserts = rows.map((r) => {
    const actions = r.actions || []
    const actionValues = r.action_values || []
    const costPerAction = r.cost_per_action_type || []
    const getAction = (type: string) => Number(actions.find((a) => a.action_type === type)?.value || 0)
    const getActionValue = (type: string) => Number(actionValues.find((a) => a.action_type === type)?.value || 0)
    const getCpa = () => {
      const lead = costPerAction.find((a) => a.action_type === 'lead')?.value
      const purchase = costPerAction.find((a) => a.action_type === 'purchase')?.value
      return Number(purchase || lead || 0)
    }
    return {
      client_id: clientId,
      campaign_id: r.campaign_id || null,
      adset_id: r.adset_id || null,
      ad_id: r.ad_id || null,
      snapshot_date: snapshotDate,
      impressions: Number(r.impressions || 0),
      clicks: Number(r.clicks || 0),
      spend: Number(r.spend || 0),
      ctr: Number(r.ctr || 0),
      cpc: Number(r.cpc || 0),
      cpa: getCpa(),
      reach: Number(r.reach || 0),
      frequency: Number(r.frequency || 0),
      leads: getAction('lead'),
      purchases: getAction('purchase'),
      revenue: getActionValue('purchase'),
      roas: Array.isArray(r.purchase_roas) && r.purchase_roas[0]
        ? Number(r.purchase_roas[0].value)
        : null,
      raw_actions: { actions, action_values: actionValues, cost_per_action_type: costPerAction },
      source: 'meta_graph_v21_insights',
    }
  }).filter((r) => r.ad_id !== null)

  let synced = 0
  if (upserts.length > 0) {
    const { error: upsertErr, count } = await supabase
      .from('meta_ads_insights_daily')
      .upsert(upserts, { onConflict: 'ad_id,snapshot_date', count: 'exact' })
    if (upsertErr) {
      return NextResponse.json(
        { error: 'supabase_upsert_failed', detail: upsertErr.message, rows_attempted: upserts.length },
        { status: 500 }
      )
    }
    synced = count ?? upserts.length
  }

  return NextResponse.json({
    ok: true,
    snapshot_date: snapshotDate,
    rows: upserts.length,
    synced,
    scope: campaignScope === adAccountId ? 'account' : `campaign:${campaignScope}`,
    source: 'meta_graph_v21_insights',
  })
}
