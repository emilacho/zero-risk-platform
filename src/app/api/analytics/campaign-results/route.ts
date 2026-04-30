import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { FeedbackCollector, CampaignResultRecord } from '@/lib/feedback-collector'
import { requireInternalApiKey } from '@/lib/auth-middleware'
import { captureRouteError } from '@/lib/sentry-capture'

/**
 * POST /api/analytics/campaign-results
 * Record post-publication campaign performance data.
 * Called by Optimization Agent (step 7) or n8n webhook after 48h.
 *
 * Body: CampaignResultRecord (see feedback-collector.ts)
 *
 * GET /api/analytics/campaign-results
 * List recent campaign results.
 */
export async function POST(request: Request) {
  const auth = await requireInternalApiKey(request)
  if (!auth.ok) return auth.response

  try {
    const supabase = getSupabaseAdmin()
    const collector = new FeedbackCollector(supabase)

    const body: CampaignResultRecord = await request.json()

    if (!body.clientId || !body.channel || !body.contentType) {
      return NextResponse.json(
        { error: 'Required fields: clientId, channel, contentType' },
        { status: 400 }
      )
    }

    const resultId = await collector.recordCampaignResults(body)

    if (!resultId) {
      return NextResponse.json(
        { error: 'Failed to record campaign results' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      result_id: resultId,
      message: 'Campaign results recorded. Agent outcomes updated with performance metrics.',
    })
  } catch (error) {
    captureRouteError(error, request, {
      route: '/api/analytics/campaign-results',
      source: 'route_handler',
    })
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

export async function GET(request: Request) {
  const auth = await requireInternalApiKey(request)
  if (!auth.ok) return auth.response

  try {
    const supabase = getSupabaseAdmin()

    const url = new URL(request.url)
    const clientId = url.searchParams.get('client_id')
    const limit = parseInt(url.searchParams.get('limit') || '20', 10)

    let query = supabase
      .from('campaign_results')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit)

    if (clientId) {
      query = query.eq('client_id', clientId)
    }

    const { data, error } = await query

    if (error) {
      return NextResponse.json(
        { error: `Failed to fetch campaign results: ${error.message}` },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      results: data?.length || 0,
      data: data || [],
    })
  } catch (error) {
    captureRouteError(error, request, {
      route: '/api/analytics/campaign-results',
      source: 'route_handler',
    })
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
