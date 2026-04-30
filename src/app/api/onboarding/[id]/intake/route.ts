import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { OnboardingOrchestrator } from '@/lib/onboarding-orchestrator'
import { requireInternalApiKey } from '@/lib/auth-middleware'
import { captureRouteError } from '@/lib/sentry-capture'

/**
 * POST /api/onboarding/[id]/intake — Process Day 2 intake form
 *
 * Body: IntakeFormData
 * {
 *   "toneAccurate": true,
 *   "toneAdjustments": "More technical, less casual",
 *   "forbiddenWords": ["cheap", "barato"],
 *   "requiredTerminology": ["protección premium", "seguridad industrial"],
 *   "icpDescription": "Gerentes de planta industrial",
 *   "painPoints": ["cumplimiento normativo", "riesgo de accidentes"],
 *   "buyingProcess": "Licitación formal con 3+ cotizaciones",
 *   "competitorsCorrect": true,
 *   "competitorsMissing": ["https://newcompetitor.com"],
 *   "primaryGoal": "lead_generation",
 *   "targetKpi": "50 MQLs/month",
 *   "monthlyBudget": 5000,
 *   "timelineWeeks": 8
 * }
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

    const body = await request.json()

    const result = await orchestrator.processIntakeForm(onboardingId, {
      toneAccurate: body.toneAccurate ?? true,
      toneAdjustments: body.toneAdjustments,
      forbiddenWords: body.forbiddenWords,
      requiredTerminology: body.requiredTerminology,
      icpDescription: body.icpDescription,
      painPoints: body.painPoints,
      buyingProcess: body.buyingProcess,
      competitorsCorrect: body.competitorsCorrect ?? true,
      competitorsMissing: body.competitorsMissing,
      primaryGoal: body.primaryGoal,
      targetKpi: body.targetKpi,
      monthlyBudget: body.monthlyBudget,
      timelineWeeks: body.timelineWeeks,
    })

    return NextResponse.json({
      success: result.success,
      onboarding_id: onboardingId,
      updated_fields: result.updatedFields,
      next_step: 'enrichment_and_review',
    })
  } catch (error) {
    captureRouteError(error, request, {
      route: '/api/onboarding/[id]/intake',
      source: 'route_handler',
    })
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
