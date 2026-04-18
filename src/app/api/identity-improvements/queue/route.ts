/**
 * Identity Improvement Queue
 *
 * Called by Meta-Agent Weekly Learning Cycle to propose improvements
 * to agent identities based on aggregated agent_outcomes analysis.
 *
 * POST body:
 *   {
 *     agent_slug: string,               // required
 *     improvement_rationale: string,    // required — 2-3 sentences
 *     expected_impact?: string,         // e.g., "+15% success rate on content agents"
 *     proposed_changes: object,         // diff-style: { section: "responsibilities", add: [...], remove: [...] }
 *     supporting_data?: object,         // outcomes counts, error patterns
 *     priority?: "low" | "medium" | "high" | "critical",
 *     proposed_by?: string              // default "meta-agent"
 *   }
 *
 * GET ?status=pending&limit=50 → list proposals for Emilio review
 * POST /{id}/resolve (separate route if needed later)
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { checkInternalKey } from '@/lib/internal-auth'

export const dynamic = 'force-dynamic'

const VALID_PRIORITY = new Set(['low', 'medium', 'high', 'critical'])

export async function POST(request: NextRequest) {
  const auth = checkInternalKey(request)
  if (!auth.ok) {
    return NextResponse.json({ error: 'unauthorized', detail: auth.reason }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  if (!body || !body.agent_slug || !body.improvement_rationale) {
    return NextResponse.json(
      { error: 'missing_fields', required: ['agent_slug', 'improvement_rationale'] },
      { status: 400 }
    )
  }

  const row = {
    agent_slug: body.agent_slug,
    improvement_rationale: String(body.improvement_rationale).slice(0, 5000),
    expected_impact: body.expected_impact || null,
    proposed_changes: body.proposed_changes || {},
    supporting_data: body.supporting_data || {},
    priority: VALID_PRIORITY.has(body.priority) ? body.priority : 'medium',
    proposed_by: body.proposed_by || 'meta-agent',
    status: 'pending' as const,
  }

  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('identity_improvement_queue')
    .insert(row)
    .select()
    .single()

  if (error) {
    console.error('[identity-improvements/queue] insert error:', error)
    return NextResponse.json({ error: 'db_error', detail: error.message }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    proposal_id: data.proposal_id,
    priority: data.priority,
  })
}

export async function GET(request: NextRequest) {
  const auth = checkInternalKey(request)
  if (!auth.ok) {
    return NextResponse.json({ error: 'unauthorized', detail: auth.reason }, { status: 401 })
  }

  const status = request.nextUrl.searchParams.get('status') || 'pending'
  const limit = Math.min(Number(request.nextUrl.searchParams.get('limit') || '50'), 200)
  const agent_slug = request.nextUrl.searchParams.get('agent_slug')

  const supabase = getSupabaseAdmin()
  let query = supabase
    .from('identity_improvement_queue')
    .select('*')
    .order('priority', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit)

  if (status !== 'all') query = query.eq('status', status)
  if (agent_slug) query = query.eq('agent_slug', agent_slug)

  const { data, error } = await query
  if (error) {
    return NextResponse.json({ error: 'db_error', detail: error.message }, { status: 500 })
  }

  return NextResponse.json({ items: data || [], count: (data || []).length })
}
