import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

/**
 * Agent Pipeline — n8n Callback
 *
 * n8n calls this endpoint as the FINAL step of the workflow, posting the
 * consolidated result back so JARVIS can render it.
 *
 * Auth: shared secret in `X-Pipeline-Secret` header (set
 * `PIPELINE_CALLBACK_SECRET` in Vercel + .env.local).
 *
 * Expected body:
 *   {
 *     pipeline_id: string,
 *     status: "completed" | "error",
 *     result?: any,            // markdown or JSON from Jefe consolidador
 *     error?: string,
 *     duration_ms?: number
 *   }
 */

export const dynamic = 'force-dynamic'
export const maxDuration = 30

export async function POST(request: NextRequest) {
  try {
    // 1. Validate shared secret
    const expectedSecret = process.env.PIPELINE_CALLBACK_SECRET || ''
    if (expectedSecret) {
      const providedSecret =
        request.headers.get('x-pipeline-secret') ||
        request.headers.get('X-Pipeline-Secret') ||
        ''
      if (providedSecret !== expectedSecret) {
        return NextResponse.json(
          { error: 'Unauthorized: invalid pipeline secret' },
          { status: 401 }
        )
      }
    }

    // 2. Parse body
    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return NextResponse.json(
        { error: 'Body must be JSON' },
        { status: 400 }
      )
    }

    const pipelineId = body.pipeline_id
    if (!pipelineId || typeof pipelineId !== 'string') {
      return NextResponse.json(
        { error: 'Missing or invalid pipeline_id' },
        { status: 400 }
      )
    }

    const status: 'completed' | 'error' =
      body.status === 'error' ? 'error' : 'completed'

    // 3. Update the row in Supabase
    const supabase = getSupabaseAdmin()
    const updates: Record<string, unknown> = {
      status,
      completed_at: new Date().toISOString(),
    }

    if (status === 'completed') {
      updates.result = body.result ?? null
    } else {
      updates.error = body.error || 'Unknown error from n8n'
    }

    if (typeof body.duration_ms === 'number') {
      updates.duration_ms = body.duration_ms
    }

    const { error: updateError } = await supabase
      .from('pipeline_results')
      .update(updates)
      .eq('id', pipelineId)

    if (updateError) {
      console.error('[pipeline callback] update error:', updateError)
      return NextResponse.json(
        { error: 'Failed to update pipeline_results', details: updateError.message },
        { status: 500 }
      )
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unknown error'
    console.error('[pipeline callback] error:', error)
    return NextResponse.json(
      { error: 'Callback processing failed', details: message },
      { status: 500 }
    )
  }
}
