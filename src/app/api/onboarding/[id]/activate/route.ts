import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { OnboardingOrchestrator } from '@/lib/onboarding-orchestrator'

/**
 * POST /api/onboarding/[id]/activate — Day 7: Activate client
 *
 * Sets client status to 'active', marks onboarding as complete.
 * After this, the client is ready for their first campaign pipeline.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: onboardingId } = await params
    const supabase = getSupabaseAdmin()
    const orchestrator = new OnboardingOrchestrator(supabase)

    const activated = await orchestrator.activateClient(onboardingId)

    if (!activated) {
      // Activation returns false when onboarding session doesn't exist · canonical 404
      // per Sprint 7 D-H2 fix · 500 was misleading (resource missing, not server fault)
      return NextResponse.json(
        {
          error: 'not_found',
          code: 'E-ONBOARDING-404',
          detail: `Onboarding session "${onboardingId}" not found or already activated`,
        },
        { status: 404 },
      )
    }

    return NextResponse.json({
      success: true,
      message: 'Client activated successfully. Client Brain is operational. Ready for first campaign.',
      next_step: 'create_first_pipeline',
    })
  } catch (error) {
    return NextResponse.json(
      {
        error: 'internal',
        code: 'E-ONBOARDING-ACTIVATE-EXC',
        detail: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    )
  }
}
