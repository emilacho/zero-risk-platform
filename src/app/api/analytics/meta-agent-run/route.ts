import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { MetaAgent } from '@/lib/meta-agent'
import { requireInternalApiKey } from '@/lib/auth-middleware'

/**
 * POST /api/analytics/meta-agent-run
 * Trigger a meta-agent analysis run.
 * Typically called weekly by n8n cron, or manually by Emilio.
 *
 * Body (all optional):
 *   { "run_type": "weekly"|"manual"|"triggered",
 *     "days": 7,
 *     "max_outcomes": 100 }
 *
 * GET /api/analytics/meta-agent-run
 * Returns history of meta-agent runs.
 */
export async function POST(request: Request) {
  const auth = await requireInternalApiKey(request)
  if (!auth.ok) return auth.response

  try {
    const supabase = getSupabaseAdmin()
    const metaAgent = new MetaAgent(supabase)

    const body = await request.json().catch(() => ({}))

    const result = await metaAgent.runWeeklyAnalysis({
      runType: body.run_type || 'manual',
      sinceDays: body.days || 7,
      maxOutcomes: body.max_outcomes || 100,
    })

    return NextResponse.json({
      success: result.status === 'completed',
      ...result,
    }, {
      status: result.status === 'completed' ? 200 : 500,
    })
  } catch (error) {
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
    const metaAgent = new MetaAgent(supabase)

    const runs = await metaAgent.getRunHistory(20)

    return NextResponse.json({
      success: true,
      endpoint: '/api/analytics/meta-agent-run',
      description: 'Meta-agent weekly analysis runs. POST to trigger, GET to see history.',
      runs: runs.length,
      data: runs,
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
