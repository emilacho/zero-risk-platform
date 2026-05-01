import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { OnboardingOrchestrator } from '@/lib/onboarding-orchestrator'
import { validateObject } from '@/lib/input-validator'

/**
 * POST /api/onboarding/[id]/review — HITL review (Day 5)
 *
 * Body:
 * {
 *   "action": "submit" | "resolve",
 *   "decision": "approved" | "revision_needed" | "rejected",   // only for resolve
 *   "feedback": "Optional review notes"
 * }
 *
 * GET /api/onboarding/[id]/review — Get current onboarding status
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: onboardingId } = await params
    const supabase = getSupabaseAdmin()
    const orchestrator = new OnboardingOrchestrator(supabase)

    let _raw: unknown
  try {
    _raw = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid_json', code: 'E-INPUT-PARSE' }, { status: 400 })
  }
  const _v = validateObject<Record<string, unknown>>(_raw, 'onboarding-action')
  if (!_v.ok) return _v.response
  const body = _v.data as Record<string, any>

    if (body.action === 'submit') {
      const submitted = await orchestrator.submitForReview(onboardingId)
      return NextResponse.json({
        success: submitted,
        message: submitted
          ? 'Onboarding submitted for HITL review. Check Mission Control inbox.'
          : 'Failed to submit for review.',
      })
    }

    if (body.action === 'resolve') {
      if (!body.decision || !['approved', 'revision_needed', 'rejected'].includes(body.decision)) {
        return NextResponse.json(
          { error: 'decision must be: approved, revision_needed, or rejected' },
          { status: 400 }
        )
      }

      const resolved = await orchestrator.resolveReview(
        onboardingId,
        body.decision,
        body.feedback
      )

      return NextResponse.json({
        success: resolved,
        decision: body.decision,
        next_step: body.decision === 'approved' ? 'kickoff_and_activate' :
                   body.decision === 'revision_needed' ? 'revise_brand_book' : 'cancelled',
      })
    }

    return NextResponse.json(
      { error: 'action must be: submit or resolve' },
      { status: 400 }
    )
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: onboardingId } = await params
    const supabase = getSupabaseAdmin()
    const orchestrator = new OnboardingOrchestrator(supabase)

    const status = await orchestrator.getStatus(onboardingId)

    if (!status) {
      return NextResponse.json(
        { error: 'Onboarding session not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({ success: true, data: status })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
