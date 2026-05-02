/**
 * GET /api/agent-health-metrics — agent latency + error-rate aggregate.
 *
 * Closes W15-D-02. Workflow caller:
 *   `Zero Risk - Agent Health Monitor (10min cron)`
 *
 * Reads from `agent_outcomes` (always present — W14 schema). Aggregates over
 * the last `minutes` window (default 30, max 1440) returning per-agent p50/p95
 * latency, success rate, total invocations.
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
  agent_slug: string | null
  latency_ms: number | null
  success: boolean | null
  cost_usd: number | null
}

interface AgentMetric {
  agent_slug: string
  invocations: number
  success_rate: number
  error_rate: number
  latency_p50_ms: number | null
  latency_p95_ms: number | null
  latency_avg_ms: number | null
  cost_usd_total: number
}

function percentile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))
  return sorted[idx]
}

function aggregate(rows: OutcomeRow[]): { agents: AgentMetric[]; overall: AgentMetric } {
  const byAgent = new Map<string, OutcomeRow[]>()
  for (const r of rows) {
    const key = r.agent_slug ?? 'unknown'
    if (!byAgent.has(key)) byAgent.set(key, [])
    byAgent.get(key)!.push(r)
  }
  const agents: AgentMetric[] = []
  for (const [slug, list] of byAgent) {
    const lat = list.map(r => r.latency_ms).filter((x): x is number => typeof x === 'number').sort((a, b) => a - b)
    const successes = list.filter(r => r.success !== false).length
    const cost = list.reduce((s, r) => s + (typeof r.cost_usd === 'number' ? r.cost_usd : 0), 0)
    agents.push({
      agent_slug: slug,
      invocations: list.length,
      success_rate: list.length === 0 ? 0 : successes / list.length,
      error_rate: list.length === 0 ? 0 : 1 - successes / list.length,
      latency_p50_ms: percentile(lat, 50),
      latency_p95_ms: percentile(lat, 95),
      latency_avg_ms: lat.length === 0 ? null : Math.round(lat.reduce((a, b) => a + b, 0) / lat.length),
      cost_usd_total: Number(cost.toFixed(4)),
    })
  }
  const totalAll = rows.length
  const successAll = rows.filter(r => r.success !== false).length
  const latAll = rows.map(r => r.latency_ms).filter((x): x is number => typeof x === 'number').sort((a, b) => a - b)
  const overall: AgentMetric = {
    agent_slug: '__overall__',
    invocations: totalAll,
    success_rate: totalAll === 0 ? 0 : successAll / totalAll,
    error_rate: totalAll === 0 ? 0 : 1 - successAll / totalAll,
    latency_p50_ms: percentile(latAll, 50),
    latency_p95_ms: percentile(latAll, 95),
    latency_avg_ms: latAll.length === 0 ? null : Math.round(latAll.reduce((a, b) => a + b, 0) / latAll.length),
    cost_usd_total: Number(rows.reduce((s, r) => s + (typeof r.cost_usd === 'number' ? r.cost_usd : 0), 0).toFixed(4)),
  }
  agents.sort((a, b) => b.invocations - a.invocations)
  return { agents, overall }
}

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
  const agentSlug = url.searchParams.get('agent_slug') || undefined
  const clientId = url.searchParams.get('client_id') || undefined

  const since = new Date(Date.now() - minutes * 60 * 1000).toISOString()

  const supabase = getSupabaseAdmin()
  const r = await withSupabaseResult<OutcomeRow[]>(
    () => {
      let q = supabase
        .from('agent_outcomes')
        .select('agent_slug,latency_ms,success,cost_usd')
        .gte('created_at', since)
        .limit(10000)
      if (agentSlug) q = q.eq('agent_slug', agentSlug)
      if (clientId) q = q.eq('client_id', clientId)
      return q
    },
    { context: '/api/agent-health-metrics' },
  )

  if (r.fallback_mode) {
    return NextResponse.json({
      ok: true,
      fallback_mode: true,
      window_minutes: minutes,
      since,
      agents: [],
      overall: aggregate([]).overall,
      note: r.reason,
    })
  }

  const { agents, overall } = aggregate(r.data ?? [])
  return NextResponse.json({
    ok: true,
    window_minutes: minutes,
    since,
    filters: { agent_slug: agentSlug ?? null, client_id: clientId ?? null },
    agents,
    overall,
  })
}
