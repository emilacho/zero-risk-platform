import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { FeedbackCollector } from '@/lib/feedback-collector'
import { requireInternalApiKey } from '@/lib/auth-middleware'
import { captureRouteError } from '@/lib/sentry-capture'

/**
 * GET /api/analytics/proposals
 * Returns pending improvement proposals for Emilio to review.
 *
 * Query params:
 *   ?status=pending|approved|rejected|deferred|applied  (default: pending)
 */
export async function GET(request: Request) {
  const auth = await requireInternalApiKey(request)
  if (!auth.ok) return auth.response

  try {
    const supabase = getSupabaseAdmin()
    const collector = new FeedbackCollector(supabase)

    const url = new URL(request.url)
    const status = url.searchParams.get('status') || 'pending'

    if (status === 'pending') {
      const proposals = await collector.getPendingProposals()
      return NextResponse.json({
        success: true,
        status_filter: status,
        proposals: proposals.length,
        data: proposals,
      })
    }

    // For non-pending statuses, query directly
    const { data, error } = await supabase
      .from('agent_improvement_proposals')
      .select(`
        *,
        meta_agent_runs (
          executive_summary,
          outcomes_analyzed,
          completed_at
        )
      `)
      .eq('status', status)
      .order('created_at', { ascending: false })
      .limit(50)

    if (error) {
      return NextResponse.json(
        { error: `Failed to fetch proposals: ${error.message}` },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      status_filter: status,
      proposals: data?.length || 0,
      data: data || [],
    })
  } catch (error) {
    captureRouteError(error, request, {
      route: '/api/analytics/proposals',
      source: 'route_handler',
    })
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
