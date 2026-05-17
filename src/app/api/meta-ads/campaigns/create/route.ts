/**
 * Meta Ads · POST /api/meta-ads/campaigns/create
 *
 * 4-call chain wrapper · campaign → adset → creative → ad.
 * Status hardcoded PAUSED · ACTIVE flip happens after HITL Mission Control approval.
 * Persists each step to meta_ads_campaigns + meta_ads_creatives.
 *
 * Stack canon · Next15 API route · Supabase service-role · Meta Graph v21.
 *
 * Build-only · NO smoke until META_AD_ACCOUNT_ID billing is restored.
 */
import { NextResponse } from 'next/server'
import { checkInternalKey } from '@/lib/internal-auth'
import { getSupabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const META_GRAPH_BASE = 'https://graph.facebook.com/v21.0'

type CreativePayload = {
  variant_id?: string
  name?: string
  title?: string
  body?: string
  call_to_action_type?: string
  link_url?: string
  image_hash?: string
  image_url?: string
  agent_image_generation_id?: string
  page_id?: string
}

type AdsetPayload = {
  name?: string
  targeting?: Record<string, unknown>
  optimization_goal?: string
  billing_event?: string
  bid_amount?: number
  daily_budget_cents?: number
  start_time?: string
  end_time?: string
}

type CreatePayload = {
  client_id: string
  campaign: {
    name: string
    objective: string
    daily_budget_cents: number
    special_ad_categories?: string[]
    buying_type?: string
  }
  adset: AdsetPayload
  creatives: CreativePayload[]
  ad_names?: string[]
  caller?: string
}

function callMetaGraph(path: string, body: Record<string, unknown>, token: string) {
  const url = `${META_GRAPH_BASE}/${path}?access_token=${encodeURIComponent(token)}`
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20000),
  })
}

async function readJson(res: Response) {
  try {
    return await res.json()
  } catch {
    return { error: 'invalid_json_response' }
  }
}

export async function POST(request: Request) {
  const auth = checkInternalKey(request)
  if (!auth.ok) {
    return NextResponse.json({ error: 'unauthorized', detail: auth.reason }, { status: 401 })
  }

  const token = process.env.META_ACCESS_TOKEN
  const adAccountId = process.env.META_AD_ACCOUNT_ID
  const defaultPageId = process.env.META_FB_PAGE_ID
  if (!token || !adAccountId) {
    return NextResponse.json(
      {
        error: 'not_configured',
        missing: [!token && 'META_ACCESS_TOKEN', !adAccountId && 'META_AD_ACCOUNT_ID'].filter(Boolean),
      },
      { status: 503 }
    )
  }

  let payload: CreatePayload
  try {
    payload = (await request.json()) as CreatePayload
  } catch {
    return NextResponse.json({ error: 'invalid_json', code: 'E-META-ADS-JSON' }, { status: 400 })
  }

  if (!payload.client_id) {
    return NextResponse.json({ error: 'client_id required', code: 'E-META-ADS-CLIENT' }, { status: 400 })
  }
  if (!payload.campaign?.name || !payload.campaign?.objective || !payload.campaign?.daily_budget_cents) {
    return NextResponse.json(
      { error: 'campaign.name, campaign.objective, campaign.daily_budget_cents required', code: 'E-META-ADS-CAMPAIGN' },
      { status: 400 }
    )
  }
  if (!payload.adset?.targeting || !payload.adset?.optimization_goal) {
    return NextResponse.json(
      { error: 'adset.targeting and adset.optimization_goal required', code: 'E-META-ADS-ADSET' },
      { status: 400 }
    )
  }
  if (!Array.isArray(payload.creatives) || payload.creatives.length === 0) {
    return NextResponse.json(
      { error: 'creatives[] required (min 1)', code: 'E-META-ADS-CREATIVES' },
      { status: 400 }
    )
  }

  const supabase = getSupabaseAdmin()
  const startTime = Date.now()

  // ─────────────────────────────────────────────────────────────────────────
  // STEP 1 · CAMPAIGN
  // ─────────────────────────────────────────────────────────────────────────
  const campaignRes = await callMetaGraph(`${adAccountId}/campaigns`, {
    name: payload.campaign.name,
    objective: payload.campaign.objective,
    status: 'PAUSED',
    special_ad_categories: payload.campaign.special_ad_categories || [],
    buying_type: payload.campaign.buying_type || 'AUCTION',
    daily_budget: payload.campaign.daily_budget_cents,
  }, token)

  const campaignData = await readJson(campaignRes)
  if (!campaignRes.ok || !campaignData?.id) {
    return NextResponse.json(
      { error: 'meta_campaign_failed', step: 'campaign', status: campaignRes.status, detail: campaignData?.error || campaignData },
      { status: 502 }
    )
  }
  const campaignId = campaignData.id as string

  await supabase.from('meta_ads_campaigns').insert({
    campaign_id: campaignId,
    client_id: payload.client_id,
    name: payload.campaign.name,
    objective: payload.campaign.objective,
    status: 'PAUSED',
    daily_budget: payload.campaign.daily_budget_cents / 100,
    special_ad_categories: payload.campaign.special_ad_categories || [],
    buying_type: payload.campaign.buying_type || 'AUCTION',
    ad_account_id: adAccountId,
    caller: payload.caller || 'n8n-meta-ads-creator',
    raw_response: campaignData,
  })

  // ─────────────────────────────────────────────────────────────────────────
  // STEP 2 · ADSET
  // ─────────────────────────────────────────────────────────────────────────
  const adsetRes = await callMetaGraph(`${adAccountId}/adsets`, {
    name: payload.adset.name || `${payload.campaign.name} · adset 1`,
    campaign_id: campaignId,
    status: 'PAUSED',
    targeting: payload.adset.targeting,
    optimization_goal: payload.adset.optimization_goal,
    billing_event: payload.adset.billing_event || 'IMPRESSIONS',
    daily_budget: payload.adset.daily_budget_cents || payload.campaign.daily_budget_cents,
    bid_amount: payload.adset.bid_amount,
    start_time: payload.adset.start_time,
    end_time: payload.adset.end_time,
  }, token)

  const adsetData = await readJson(adsetRes)
  if (!adsetRes.ok || !adsetData?.id) {
    return NextResponse.json(
      {
        error: 'meta_adset_failed',
        step: 'adset',
        status: adsetRes.status,
        detail: adsetData?.error || adsetData,
        campaign_id: campaignId,
      },
      { status: 502 }
    )
  }
  const adsetId = adsetData.id as string

  // ─────────────────────────────────────────────────────────────────────────
  // STEP 3 · CREATIVES (1+ per call · loop sequential to keep request scope)
  // ─────────────────────────────────────────────────────────────────────────
  const creativeIds: string[] = []
  const creativeRows: Array<{ creative_id: string; variant_id: string | null }> = []
  for (const c of payload.creatives) {
    const pageId = c.page_id || defaultPageId
    if (!pageId) {
      return NextResponse.json(
        { error: 'page_id required (no META_FB_PAGE_ID env fallback)', step: 'creative', code: 'E-META-ADS-PAGE' },
        { status: 400 }
      )
    }
    const objectStorySpec: Record<string, unknown> = {
      page_id: pageId,
      link_data: {
        message: c.body,
        link: c.link_url,
        name: c.title,
        call_to_action: c.call_to_action_type ? { type: c.call_to_action_type } : undefined,
        image_hash: c.image_hash,
      },
    }
    const creativeRes = await callMetaGraph(`${adAccountId}/adcreatives`, {
      name: c.name || `${payload.campaign.name} · creative ${creativeIds.length + 1}`,
      object_story_spec: objectStorySpec,
    }, token)
    const creativeData = await readJson(creativeRes)
    if (!creativeRes.ok || !creativeData?.id) {
      return NextResponse.json(
        {
          error: 'meta_creative_failed',
          step: 'creative',
          variant_id: c.variant_id,
          status: creativeRes.status,
          detail: creativeData?.error || creativeData,
          campaign_id: campaignId,
          adset_id: adsetId,
          creative_ids_so_far: creativeIds,
        },
        { status: 502 }
      )
    }
    const creativeId = creativeData.id as string
    creativeIds.push(creativeId)
    creativeRows.push({ creative_id: creativeId, variant_id: c.variant_id || null })

    await supabase.from('meta_ads_creatives').insert({
      creative_id: creativeId,
      client_id: payload.client_id,
      campaign_id: campaignId,
      variant_id: c.variant_id || null,
      name: c.name || null,
      title: c.title || null,
      body: c.body || null,
      call_to_action: c.call_to_action_type || null,
      link_url: c.link_url || null,
      image_hash: c.image_hash || null,
      image_url: c.image_url || null,
      agent_image_generation_id: c.agent_image_generation_id || null,
      format: 'single_image',
      raw_response: creativeData,
    })
  }

  // ─────────────────────────────────────────────────────────────────────────
  // STEP 4 · ADS (1 per creative)
  // ─────────────────────────────────────────────────────────────────────────
  const adIds: string[] = []
  for (let i = 0; i < creativeIds.length; i++) {
    const adName = payload.ad_names?.[i] || `${payload.campaign.name} · ad ${i + 1}`
    const adRes = await callMetaGraph(`${adAccountId}/ads`, {
      name: adName,
      adset_id: adsetId,
      status: 'PAUSED',
      creative: { creative_id: creativeIds[i] },
    }, token)
    const adData = await readJson(adRes)
    if (!adRes.ok || !adData?.id) {
      return NextResponse.json(
        {
          error: 'meta_ad_failed',
          step: 'ad',
          index: i,
          creative_id: creativeIds[i],
          status: adRes.status,
          detail: adData?.error || adData,
          campaign_id: campaignId,
          adset_id: adsetId,
          ad_ids_so_far: adIds,
        },
        { status: 502 }
      )
    }
    adIds.push(adData.id as string)
  }

  return NextResponse.json({
    ok: true,
    campaign_id: campaignId,
    adset_id: adsetId,
    creative_ids: creativeIds,
    ad_ids: adIds,
    status: 'PAUSED',
    note: 'All entities created with status=PAUSED · HITL approval required to flip ACTIVE',
    duration_ms: Date.now() - startTime,
    source: 'meta_graph_v21',
  })
}
