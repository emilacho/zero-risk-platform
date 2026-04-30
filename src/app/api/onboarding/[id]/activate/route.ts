import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { OnboardingOrchestrator } from '@/lib/onboarding-orchestrator'
import { requireInternalApiKey } from '@/lib/auth-middleware'

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
  const auth = await requireInternalApiKey(request)
  if (!auth.ok) return auth.response

  try {
    const { id: onboardingId } = await params
    const supabase = getSupabaseAdmin()
    const orchestrator = new OnboardingOrchestrator(supabase)

    const activated = await orchestrator.activateClient(onboardingId)

    if (!activated) {
      return NextResponse.json(
        { error: 'Failed to activate client. Check onboarding session exists.' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: 'Client activated successfully. Client Brain is operational. Ready for first campaign.',
      next_step: 'create_first_pipeline',
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
