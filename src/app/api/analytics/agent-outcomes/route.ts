/**
 * Analytics — Agent Outcomes (READ)
 *
 * Called by Meta-Agent Weekly Learning Cycle to pull last-N-days outcomes.
 *
 * GET ?days=7&limit=500&agent_slug=xxx
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
  const agentSlug = request.nextUrl.searchParams.get('agent_slug')
  const clientId = request.nextUrl.searchParams.get('client_id')
  const successOnly = request.nextUrl.searchParams.get('success') === 'true'
  const failedOnly = request.nextUrl.searchParams.get('success') === 'false'

  const since = new Date(Date.now() - days * 24 * 3600 * 1000).toISOString()

  const supabase = getSupabaseAdmin()
  let query = supabase
    .from('agent_outcomes')
    .select('*')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (agentSlug) query = query.eq('agent_slug', agentSlug)
  if (clientId) query = query.eq('client_id', clientId)
  if (successOnly) query = query.eq('success', true)
  if (failedOnly) query = query.eq('success', false)

  const { data, error } = await query
  if (error) {
    console.error('[analytics/agent-outcomes] query error:', error)
    return NextResponse.json({ error: 'db_error', detail: error.message }, { status: 500 })
  }

  // Compute aggregate summary for convenience
  const items = data || []
  const byAgent: Record<string, { total: number; success: number; failed: number; avg_latency_ms: number; total_tokens: number }> = {}
  let totalTokens = 0
  for (const o of items) {
    const slug = (o as any).agent_slug || 'unknown'
    if (!byAgent[slug]) {
      byAgent[slug] = { total: 0, success: 0, failed: 0, avg_latency_ms: 0, total_tokens: 0 }
    }
    byAgent[slug].total++
    if ((o as any).success) byAgent[slug].success++
    else byAgent[slug].failed++
    if ((o as any).latency_ms) {
      byAgent[slug].avg_latency_ms =
        (byAgent[slug].avg_latency_ms * (byAgent[slug].total - 1) + (o as any).latency_ms) / byAgent[slug].total
    }
    const t = (o as any).tokens_used || 0
    byAgent[slug].total_tokens += t
    totalTokens += t
  }

  return NextResponse.json({
    items,
    count: items.length,
    days,
    summary: {
      total_records: items.length,
      total_tokens: totalTokens,
      by_agent: byAgent,
    },
  })
}
