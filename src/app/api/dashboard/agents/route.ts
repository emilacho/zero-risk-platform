/**
 * GET /api/dashboard/agents
 *
 * Dashboard surface · list agents con rolled-up 30-day stats from
 * `agent_invocations` (sessions, tokens, cost, last_activity) + identity
 * provenance metadata. Read-only.
 *
 * Query · ?limit=N (1..200, default 100) · ?status=active|inactive
 *
 * Pattern · mirrors /api/dashboard (campaign KPIs · existing) but scoped to
 * agents · response shape `{ ok, count, agents: [...] }` matches dashboard
 * UI consumption.
 */
import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

interface AgentRow {
  id: string
  name: string
  display_name: string | null
  role: string | null
  model: string | null
  status: string | null
  identity_content: string | null
  identity_source: string | null
}

interface InvocationStatsRow {
  agent_id: string | null
  cost_usd: number | null
  tokens_input: number | null
  tokens_output: number | null
  ended_at: string | null
}

interface AgentStats {
  sessions: number
  tokens_input: number
  tokens_output: number
  cost_usd: number
  last_activity: string | null
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url)
    const rawLimit = parseInt(url.searchParams.get('limit') || '100', 10)
    const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 200) : 100
    const statusFilter = url.searchParams.get('status')

    const supabase = getSupabaseAdmin()

    let agentsQuery = supabase
      .from('agents')
      .select('id, name, display_name, role, model, status, identity_content, identity_source')
      .order('name', { ascending: true })
      .limit(limit)
    if (statusFilter) agentsQuery = agentsQuery.eq('status', statusFilter)
    const { data: agentRows, error: agentsErr } = await agentsQuery
    if (agentsErr) {
      return NextResponse.json(
        { ok: false, error: agentsErr.message, code: 'E-DASHBOARD-AGENTS-LIST' },
        { status: 500 },
      )
    }

    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
    const { data: invRows, error: invErr } = await supabase
      .from('agent_invocations')
      .select('agent_id, cost_usd, tokens_input, tokens_output, ended_at')
      .gte('started_at', since)
      .limit(10_000)
    if (invErr) {
      return NextResponse.json(
        { ok: false, error: invErr.message, code: 'E-DASHBOARD-AGENTS-STATS' },
        { status: 500 },
      )
    }

    const statsByAgent = new Map<string, AgentStats>()
    for (const row of (invRows ?? []) as InvocationStatsRow[]) {
      const key = row.agent_id ?? 'unknown'
      const s =
        statsByAgent.get(key) ??
        ({ sessions: 0, tokens_input: 0, tokens_output: 0, cost_usd: 0, last_activity: null } as AgentStats)
      s.sessions += 1
      s.tokens_input += row.tokens_input ?? 0
      s.tokens_output += row.tokens_output ?? 0
      s.cost_usd += Number(row.cost_usd ?? 0)
      if (row.ended_at && (!s.last_activity || row.ended_at > s.last_activity)) {
        s.last_activity = row.ended_at
      }
      statsByAgent.set(key, s)
    }

    const agents = ((agentRows ?? []) as AgentRow[]).map(a => {
      const stats =
        statsByAgent.get(a.name) ?? // agent_invocations.agent_id often = canonical slug = agents.name (post-alias)
        statsByAgent.get(a.id) ?? // fallback if agent_id stores the row id
        ({ sessions: 0, tokens_input: 0, tokens_output: 0, cost_usd: 0, last_activity: null } as AgentStats)
      return {
        id: a.id,
        name: a.name,
        display_name: a.display_name,
        role: a.role,
        model: a.model,
        status: a.status,
        identity_chars: a.identity_content?.length ?? 0,
        identity_source: a.identity_source,
        stats_30d: {
          sessions: stats.sessions,
          tokens_input: stats.tokens_input,
          tokens_output: stats.tokens_output,
          cost_usd: Number(stats.cost_usd.toFixed(6)),
          last_activity: stats.last_activity,
        },
      }
    })

    return NextResponse.json({
      ok: true,
      count: agents.length,
      window_days: 30,
      filters: { status: statusFilter ?? null, limit },
      agents,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 },
    )
  }
}
