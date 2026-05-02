/**
 * GET /api/agent-outcomes — read sibling to /api/agent-outcomes/write.
 *
 * Closes W15-D-03. Workflow caller:
 *   `Zero Risk - Agent Latency + Error Rate Monitor (10min cron)`
 *
 * Reads recent agent_outcomes rows within the `minutes` window (default 30,
 * max 1440). Supports optional grouping (`group_by=agent_slug`) and filters
 * (agent_slug, client_id, success). When grouped, returns counts per group;
 * otherwise returns the raw rows (capped at 500).
 *
 * Auth: tier 2 INTERNAL.
 * Persistence: read-only over `agent_outcomes`.
 */
import { NextResponse } from 'next/server'
import { checkInternalKey } from '@/lib/internal-auth'
import { getSupabaseAdmin } from '@/lib/supabase'
import { withSupabaseResult } from '@/lib/bridge-fallback'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

interface OutcomeRow {
  id?: string | null
  agent_slug: string | null
  task_id?: string | null
  client_id?: string | null
  latency_ms: number | null
  success: boolean | null
  error?: string | null
  cost_usd: number | null
  created_at?: string | null
}

const MAX_ROWS = 500

export async function GET(request: Request) {
  const auth = checkInternalKey(request)
  if (!auth.ok) {
    return NextResponse.json(
      { error: 'unauthorized', code: 'E-AUTH-001', detail: auth.reason },
      { status: 401 },
    )
  }

  const url = new URL(request.url)
  const rawMinutes = parseInt(url.searchParams.get('minutes') || '30', 10)
  const minutes = Number.isFinite(rawMinutes) ? Math.min(Math.max(rawMinutes, 1), 1440) : 30
  const groupBy = url.searchParams.get('group_by') || ''
  const agentSlug = url.searchParams.get('agent_slug') || undefined
  const clientId = url.searchParams.get('client_id') || undefined
  const successOnly = url.searchParams.get('success')

  const since = new Date(Date.now() - minutes * 60 * 1000).toISOString()

  const supabase = getSupabaseAdmin()
  const r = await withSupabaseResult<OutcomeRow[]>(
    () => {
      let q = supabase
        .from('agent_outcomes')
        .select('id,agent_slug,task_id,client_id,latency_ms,success,error,cost_usd,created_at')
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(MAX_ROWS)
      if (agentSlug) q = q.eq('agent_slug', agentSlug)
      if (clientId) q = q.eq('client_id', clientId)
      if (successOnly === 'true') q = q.eq('success', true)
      else if (successOnly === 'false') q = q.eq('success', false)
      return q
    },
    { context: '/api/agent-outcomes' },
  )

  if (r.fallback_mode) {
    return NextResponse.json({
      ok: true,
      fallback_mode: true,
      window_minutes: minutes,
      since,
      count: 0,
      outcomes: [],
      groups: [],
      note: r.reason,
    })
  }

  const rows = r.data ?? []

  if (groupBy === 'agent_slug') {
    const groups = new Map<string, { agent_slug: string; count: number; success_count: number; error_count: number }>()
    for (const row of rows) {
      const key = row.agent_slug ?? 'unknown'
      if (!groups.has(key)) groups.set(key, { agent_slug: key, count: 0, success_count: 0, error_count: 0 })
      const g = groups.get(key)!
      g.count++
      if (row.success === false) g.error_count++
      else g.success_count++
    }
    const arr = Array.from(groups.values()).sort((a, b) => b.count - a.count)
    return NextResponse.json({
      ok: true,
      window_minutes: minutes,
      since,
      group_by: 'agent_slug',
      count: rows.length,
      groups: arr,
    })
  }

  return NextResponse.json({
    ok: true,
    window_minutes: minutes,
    since,
    filters: { agent_slug: agentSlug ?? null, client_id: clientId ?? null, success: successOnly ?? null },
    count: rows.length,
    truncated: rows.length === MAX_ROWS,
    outcomes: rows,
  })
}
