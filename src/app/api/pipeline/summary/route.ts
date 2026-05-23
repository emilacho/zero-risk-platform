/**
 * GET /api/pipeline/summary?client_id=<uuid>&days=<n>
 *
 * Sprint 6 Track A2 · Stack V4 GHL-Out · replaces deprecated
 * `/api/ghl/pipeline-summary?client_id=…&days=7` consumed by the
 * Weekly Client Report Generator v2 workflow.
 *
 * Returns aggregate pipeline activity for the client over a rolling
 * window · reads `client_journey_state` for current journey + recent
 * agent_invocations + cascade_runs for activity volume.
 *
 * Response shape ·
 *   {
 *     ok, client_id, window_days,
 *     journey: { state, stage, status, started_at, last_activity_at }|null,
 *     activity: {
 *       agent_invocations: number,
 *       cascade_runs: number,
 *       hitl_approvals_pending: number,
 *     }
 *   }
 */
import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const url = new URL(req.url)
  const clientId = url.searchParams.get('client_id')
  const days = Number(url.searchParams.get('days') ?? 7)
  if (!clientId) {
    return NextResponse.json(
      { ok: false, error: 'client_id_required' },
      { status: 400 },
    )
  }
  const sinceIso = new Date(Date.now() - days * 24 * 3600 * 1000).toISOString()

  try {
    const supabase = getSupabaseAdmin()

    const [journeyRes, invsRes, cascRes, hitlRes] = await Promise.all([
      supabase
        .from('client_journey_state')
        .select('journey, current_stage, status, started_at, updated_at, completed_at')
        .eq('client_id', clientId)
        .neq('status', 'completed')
        .order('updated_at', { ascending: false })
        .limit(1),
      supabase
        .from('agent_invocations')
        .select('id', { count: 'exact', head: true })
        .eq('client_id', clientId)
        .gte('created_at', sinceIso),
      supabase
        .from('cascade_runs')
        .select('id', { count: 'exact', head: true })
        .eq('client_id', clientId)
        .gte('started_at', sinceIso),
      supabase
        .from('hitl_approvals')
        .select('id', { count: 'exact', head: true })
        .eq('client_id', clientId)
        .eq('status', 'pending'),
    ])

    const journey = (journeyRes.data ?? [])[0] ?? null

    return NextResponse.json({
      ok: true,
      client_id: clientId,
      window_days: days,
      journey: journey
        ? {
            state: journey.journey,
            stage: journey.current_stage,
            status: journey.status,
            started_at: journey.started_at,
            last_activity_at: journey.updated_at,
            completed_at: journey.completed_at,
          }
        : null,
      activity: {
        agent_invocations: invsRes.count ?? 0,
        cascade_runs: cascRes.count ?? 0,
        hitl_approvals_pending: hitlRes.count ?? 0,
      },
    })
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'unknown' },
      { status: 500 },
    )
  }
}
