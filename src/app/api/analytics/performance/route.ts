import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { FeedbackCollector } from '@/lib/feedback-collector'

/**
 * GET /api/analytics/performance
 * Returns campaign performance data aggregated by channel/content type.
 *
 * Query params:
 *   ?client_id=uuid   — filter by client
 *   ?days=30           — lookback period (default 30)
 */
export async function GET(request: Request) {
  try {
    const supabase = getSupabaseAdmin()
    const collector = new FeedbackCollector(supabase)

    const url = new URL(request.url)
    const clientId = url.searchParams.get('client_id') || undefined
    const days = parseInt(url.searchParams.get('days') || '30', 10)

    const performance = await collector.getCampaignPerformance(clientId, days)

    return NextResponse.json({
      success: true,
      period_days: days,
      client_filter: clientId || 'all',
      channels: performance.length,
      data: performance,
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
