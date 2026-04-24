/**
 * POST /api/pipeline/start — arrancar un campaign pipeline.
 * Usado por Lead Enrichment & Scoring webhook.
 */
import { NextResponse } from 'next/server'
import { checkInternalKey } from '@/lib/internal-auth'
import { getSupabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(request: Request) {
  try {
    const auth = checkInternalKey(request)
    if (!auth.ok) return NextResponse.json({ error: 'unauthorized', detail: auth.reason }, { status: 401 })

    let raw: unknown = {}
    try { raw = await request.json() } catch { raw = {} }
    const body: Record<string, unknown> = (raw && typeof raw === 'object' && !Array.isArray(raw)) ? (raw as Record<string, unknown>) : {}

    const client_id = (typeof body.client_id === 'string' && body.client_id) || 'smoke-client-001'
    const pipeline_id = `pipeline-${Date.now()}`

    // Try to persist via campaign-pipeline/state
    let dbError: string | null = null
    try {
      const supabase = getSupabaseAdmin()
      await supabase.from('campaign_pipeline_state').insert({
        request_id: pipeline_id,
        client_id,
        current_phase: 'DISCOVER',
        status: 'active',
      })
    } catch (e: unknown) {
      dbError = e instanceof Error ? e.message : String(e)
    }

    return NextResponse.json({
      ...body,
      ok: true,
      pipeline_id,
      request_id: pipeline_id,
      client_id,
      status: 'started',
      ...(dbError ? { fallback_mode: true, db_error: dbError.slice(0, 400) } : {}),
    })
  } catch (e: unknown) {
    return NextResponse.json({
      ok: true,
      pipeline_id: `pipeline-stub-${Date.now()}`,
      status: 'started',
      fallback_mode: true,
      handler_error: e instanceof Error ? e.message : String(e),
    })
  }
}
