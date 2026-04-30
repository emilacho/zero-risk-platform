import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { PipelineOrchestrator } from '@/lib/pipeline-orchestrator'
import { sanitizeString } from '@/lib/validation'
import { capture } from '@/lib/posthog'
import { requireInternalApiKey } from '@/lib/auth-middleware'
import { captureRouteError } from '@/lib/sentry-capture'

/**
 * POST /api/hitl/resolve
 * Resolve a pending HITL item (approve/reject/edit).
 * This resumes the paused pipeline from where it stopped.
 *
 * Body: {
 *   step_id: uuid (required) — the pipeline_steps.id to resolve
 *   decision: "approved" | "rejected" | "edited" (required)
 *   feedback?: string — reviewer comments
 *   edited_content?: string — if decision is "edited", the corrected content
 * }
 *
 * Also accepts via query param: ?step_id=xxx for Slack webhook compatibility
 */
export async function POST(request: Request) {
  const auth = await requireInternalApiKey(request)
  if (!auth.ok) return auth.response

  try {
    const { searchParams } = new URL(request.url)
    const body = await request.json()

    const stepId = body.step_id || searchParams.get('step_id')
    const decision = body.decision as 'approved' | 'rejected' | 'edited'
    const feedback = sanitizeString(body.feedback, 2000)
    const editedContent = body.edited_content

    if (!stepId || !decision) {
      return NextResponse.json(
        { error: 'Missing required fields: step_id, decision' },
        { status: 400 }
      )
    }

    if (!['approved', 'rejected', 'edited'].includes(decision)) {
      return NextResponse.json(
        { error: 'Decision must be: approved, rejected, or edited' },
        { status: 400 }
      )
    }

    if (decision === 'edited' && !editedContent) {
      return NextResponse.json(
        { error: 'edited_content is required when decision is "edited"' },
        { status: 400 }
      )
    }

    const supabase = getSupabaseAdmin()

    // Get the step and validate it's pending HITL
    const { data: step, error: stepError } = await supabase
      .from('pipeline_steps')
      .select('id, pipeline_id, step_index, hitl_required, hitl_status, status')
      .eq('id', stepId)
      .single()

    if (stepError || !step) {
      return NextResponse.json(
        { error: `Step "${stepId}" not found` },
        { status: 404 }
      )
    }

    if (!step.hitl_required || step.hitl_status !== 'pending') {
      return NextResponse.json(
        { error: `Step "${stepId}" is not pending HITL review (current status: ${step.hitl_status})` },
        { status: 409 }
      )
    }

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL
      || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')

    const orchestrator = new PipelineOrchestrator(supabase, baseUrl)

    // Resume pipeline
    await orchestrator.resumeAfterHITL(
      step.pipeline_id,
      step.step_index,
      decision,
      feedback || undefined,
      editedContent || undefined
    )

    capture('hitl_approval_resolved', step.pipeline_id, {
      item_id: stepId,
      decision,
      reviewer_role: 'human',
    })

    // Get updated pipeline status
    const { data: pipeline } = await supabase
      .from('pipeline_executions')
      .select('status, current_step_index')
      .eq('id', step.pipeline_id)
      .single()

    return NextResponse.json({
      success: true,
      step_id: stepId,
      decision,
      pipeline_id: step.pipeline_id,
      pipeline_status: pipeline?.status,
      pipeline_current_step: pipeline?.current_step_index,
      message: decision === 'rejected'
        ? 'Pipeline stopped — content was rejected'
        : `Pipeline resumed from step ${step.step_index + 1}`,
    })
  } catch (error) {
    captureRouteError(error, request, {
      route: '/api/hitl/resolve',
      source: 'route_handler',
    })
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

/**
 * GET /api/hitl/resolve — endpoint info
 */
export async function GET(request: Request) {
  const auth = await requireInternalApiKey(request)
  if (!auth.ok) return auth.response

  return NextResponse.json({
    endpoint: '/api/hitl/resolve',
    method: 'POST',
    description: 'Resolve a pending HITL item and resume the paused pipeline.',
    body_schema: {
      step_id: 'uuid (required)',
      decision: '"approved" | "rejected" | "edited"',
      feedback: 'string (optional)',
      edited_content: 'string (required if decision is "edited")',
    },
  })
}
