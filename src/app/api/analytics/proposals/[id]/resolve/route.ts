import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { FeedbackCollector } from '@/lib/feedback-collector'
import { MetaAgent } from '@/lib/meta-agent'
import { validateObject } from '@/lib/input-validator'

/**
 * POST /api/analytics/proposals/[id]/resolve
 * Resolve an improvement proposal (HITL decision by Emilio).
 *
 * Body:
 *   { "decision": "approved"|"rejected"|"deferred",
 *     "notes": "Optional review comments",
 *     "apply": true }   ← if approved, auto-apply the change
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: proposalId } = await params
    const supabase = getSupabaseAdmin()
    const collector = new FeedbackCollector(supabase)

    let _raw: unknown
  try {
    _raw = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid_json', code: 'E-INPUT-PARSE' }, { status: 400 })
  }
  const _v = validateObject<Record<string, unknown>>(_raw, 'analytics-write')
  if (!_v.ok) return _v.response
  const body = _v.data as Record<string, any>

    if (!body.decision || !['approved', 'rejected', 'deferred'].includes(body.decision)) {
      return NextResponse.json(
        { error: 'Missing or invalid "decision". Must be: approved, rejected, or deferred.' },
        { status: 400 }
      )
    }

    // Record the HITL decision
    const resolved = await collector.resolveProposal(
      proposalId,
      body.decision,
      body.notes
    )

    if (!resolved) {
      return NextResponse.json(
        { error: `Failed to resolve proposal ${proposalId}` },
        { status: 500 }
      )
    }

    // If approved and apply=true, auto-apply the change
    let applied = false
    if (body.decision === 'approved' && body.apply) {
      const metaAgent = new MetaAgent(supabase)
      applied = await metaAgent.applyApprovedProposal(proposalId)
    }

    return NextResponse.json({
      success: true,
      proposal_id: proposalId,
      decision: body.decision,
      applied,
      message: body.decision === 'approved'
        ? applied
          ? 'Proposal approved and applied successfully.'
          : 'Proposal approved. Use apply=true to auto-apply, or apply manually.'
        : `Proposal ${body.decision}.`,
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
