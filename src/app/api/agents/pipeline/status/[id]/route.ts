import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { requireInternalApiKey } from '@/lib/auth-middleware'
import { captureRouteError } from '@/lib/sentry-capture'

/**
 * Agent Pipeline — Status Polling
 *
 * The JARVIS TaskRunner polls this endpoint every ~3s with the pipeline_id
 * returned by the trigger endpoint. Returns the current row state.
 *
 * Possible statuses: pending | running | completed | error
 */

export const dynamic = 'force-dynamic'
export const maxDuration = 10

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireInternalApiKey(_request)
  if (!auth.ok) return auth.response

  try {
    const id = params.id
    if (!id || !UUID_REGEX.test(id)) {
      return NextResponse.json(
        { error: 'Invalid pipeline id' },
        { status: 400 }
      )
    }

    const supabase = getSupabaseAdmin()
    const { data, error } = await supabase
      .from('pipeline_results')
      .select(
        'id, task, status, result, error, duration_ms, created_at, completed_at'
      )
      .eq('id', id)
      .single()

    if (error || !data) {
      return NextResponse.json(
        { error: 'Pipeline not found' },
        { status: 404 }
      )
    }

    return NextResponse.json(data)
  } catch (error) {
    captureRouteError(error, null, {
      route: '/api/agents/pipeline/status/[id]',
      source: 'route_handler',
    })
    const message =
      error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json(
      { error: 'Failed to fetch pipeline status', details: message },
      { status: 500 }
    )
  }
}
