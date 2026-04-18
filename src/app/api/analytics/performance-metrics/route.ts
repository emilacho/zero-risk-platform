/**
 * Analytics — Performance Metrics (READ)
 *
 * Called by Meta-Agent Weekly Learning Cycle to pull real-world campaign performance
 * metrics (ROAS, CTR, CPA, etc.) alongside agent_outcomes for correlation.
 *
 * GET ?days=7&limit=500&metric_name=xxx&client_id=xxx
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { checkInternalKey } from '@/lib/internal-auth'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const auth = checkInternalKey(request)
  if (!auth.ok) {
    return NextResponse.json({ error: 'unauthorized', detail: auth.reason }, { status: 401 })
  }

  const days = Math.max(1, Math.min(90, Number(request.nextUrl.searchParams.get('days') || '7')))
  const limit = Math.max(1, Math.min(2000, Number(request.nextUrl.searchParams.get('limit') || '500')))
  const metric_name = request.nextUrl.searchParams.get('metric_name')
  const agent_slug = request.nextUrl.searchParams.get('agent_slug')
  const client_id = request.nextUrl.searchParams.get('client_id')

  const since = new Date(Date.now() - days * 24 * 3600 * 1000).toISOString()

  const supabase = getSupabaseAdmin()
  let query = supabase
    .from('performance_metrics')
    .select('*')
    .gte('timestamp', since)
    .order('timestamp', { ascending: false })
    .limit(limit)

  if (metric_name) query = query.eq('metric_name', metric_name)
  if (agent_slug) query = query.eq('agent_slug', agent_slug)
  if (client_id) query = query.eq('client_id', client_id)

  const { data, error } = await query
  if (error) {
    console.error('[analytics/performance-metrics] query error:', error)
    return NextResponse.json({ error: 'db_error', detail: error.message }, { status: 500 })
  }

  const items = data || []
  const byMetric: Record<string, { count: number; sum: number; avg: number; min: number; max: number }> = {}
  for (const m of items) {
    const n = (m as any).metric_name || 'unknown'
    const v = Number((m as any).value)
    if (!byMetric[n]) byMetric[n] = { count: 0, sum: 0, avg: 0, min: Infinity, max: -Infinity }
    if (!isNaN(v)) {
      byMetric[n].count++
      byMetric[n].sum += v
      byMetric[n].avg = byMetric[n].sum / byMetric[n].count
      byMetric[n].min = Math.min(byMetric[n].min, v)
      byMetric[n].max = Math.max(byMetric[n].max, v)
    }
  }

  return NextResponse.json({
    items,
    count: items.length,
    days,
    summary: {
      total_records: items.length,
      by_metric: byMetric,
    },
  })
}
