import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { OnboardingOrchestrator } from '@/lib/onboarding-orchestrator'

/**
 * POST /api/onboarding — Start a new client onboarding (Day 1 auto-discovery)
 *
 * Body:
 * {
 *   "companyName": "Zero Risk Ecuador",
 *   "websiteUrl": "https://zeroriskec.com",
 *   "industry": "Seguridad industrial",
 *   "targetAudience": "Empresas industriales en Ecuador",
 *   "competitorUrls": ["https://competitor1.com", "https://competitor2.com"],
 *   "additionalNotes": "First client — industrial safety"
 * }
 *
 * GET /api/onboarding — List all onboarding sessions
 */
export async function POST(request: Request) {
  try {
    const supabase = getSupabaseAdmin()
    const orchestrator = new OnboardingOrchestrator(supabase)

    const body = await request.json()

    if (!body.companyName || !body.websiteUrl) {
      return NextResponse.json(
        { error: 'Required fields: companyName, websiteUrl' },
        { status: 400 }
      )
    }

    const result = await orchestrator.startOnboarding({
      companyName: body.companyName,
      websiteUrl: body.websiteUrl,
      industry: body.industry,
      targetAudience: body.targetAudience,
      competitorUrls: body.competitorUrls,
      additionalNotes: body.additionalNotes,
      createdBy: body.createdBy || 'api',
    })

    return NextResponse.json(result, {
      status: result.success ? 200 : 500,
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

export async function GET(request: Request) {
  try {
    const supabase = getSupabaseAdmin()
    const orchestrator = new OnboardingOrchestrator(supabase)

    const url = new URL(request.url)
    const status = url.searchParams.get('status') || undefined

    const sessions = await orchestrator.listOnboardings(status)

    return NextResponse.json({
      success: true,
      onboardings: sessions.length,
      data: sessions,
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
