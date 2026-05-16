/**
 * GET /api/dashboard/activity
 *
 * Dashboard surface · recent agent_invocations feed · default last 50
 * (1..200) · sorted descending by started_at. Read-only.
 *
 * Used by dashboard live-activity panel · pairs with the realtime config
 * endpoint to power push-updates on top of the initial fetch.
 */
import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

interface ActivityRow {
  id: string
  session_id: string | null
  agent_id: string | null
  agent_name: string | null
  client_id: string | null
  model: string | null
  cost_usd: number | null
  duration_ms: number | null
  status: string | null
  started_at: string | null
  ended_at: string | null
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url)
    const rawLimit = parseInt(url.searchParams.get('limit') || '50', 10)
    const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 200) : 50
    const clientId = url.searchParams.get('client_id')
    const agentId = url.searchParams.get('agent_id')
    const status = url.searchParams.get('status')

    const supabase = getSupabaseAdmin()
    let q = supabase
      .from('agent_invocations')
      .select(
        'id, session_id, agent_id, agent_name, client_id, model, cost_usd, duration_ms, status, started_at, ended_at',
      )
      .order('started_at', { ascending: false })
      .limit(limit)
    if (clientId) q = q.eq('client_id', clientId)
    if (agentId) q = q.eq('agent_id', agentId)
    if (status) q = q.eq('status', status)
    const { data, error } = await q
    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message, code: 'E-DASHBOARD-ACTIVITY-READ' },
        { status: 500 },
      )
    }
    const rows = (data ?? []) as ActivityRow[]

    return NextResponse.json({
      ok: true,
      count: rows.length,
      filters: { client_id: clientId ?? null, agent_id: agentId ?? null, status: status ?? null, limit },
      activity: rows,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 },
    )
  }
}
