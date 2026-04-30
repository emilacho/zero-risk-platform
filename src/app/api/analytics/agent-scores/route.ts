import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { FeedbackCollector } from '@/lib/feedback-collector'
import { requireInternalApiKey } from '@/lib/auth-middleware'
import { captureRouteError } from '@/lib/sentry-capture'

/**
 * GET /api/analytics/agent-scores
 * Returns agent performance scorecards.
 *
 * Query params:
 *   ?agent=content-creator   — filter by agent name
 *   ?days=30                 — lookback period (default 30)
 */
export async function GET(request: Request) {
  const auth = await requireInternalApiKey(request)
  if (!auth.ok) return auth.response

  try {
    const supabase = getSupabaseAdmin()
    const collector = new FeedbackCollector(supabase)

    const url = new URL(request.url)
    const agentName = url.searchParams.get('agent') || undefined
    const days = parseInt(url.searchParams.get('days') || '30', 10)

    const scorecards = await collector.getAgentScorecards(agentName, days)

    return NextResponse.json({
      success: true,
      period_days: days,
      agent_filter: agentName || 'all',
      agents: scorecards.length,
      data: scorecards,
    })
  } catch (error) {
    captureRouteError(error, request, {
      route: '/api/analytics/agent-scores',
      source: 'route_handler',
    })
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
