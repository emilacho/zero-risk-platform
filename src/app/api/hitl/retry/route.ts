import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { PipelineOrchestrator } from '@/lib/pipeline-orchestrator'
import { sanitizeString } from '@/lib/validation'

/**
 * POST /api/hitl/retry
 * Re-run a pipeline after a HITL rejection, injecting the feedback into the
 * objective so content agents incorporate reviewer notes on the next pass.
 *
 * Closes GAP #3 from HITL_FINDINGS_S33: reject was a dead-end; this gives
 * Emilio a single POST to requeue the pipeline with the stored feedback.
 *
 * Skips step 0 (Competitive Intel) — already done, unchanged by feedback.
 * Reruns steps 1-8 with enriched objective.
 *
 * Body: {
 *   step_id: uuid (required) — the rejected pipeline_steps.id
 *   additional_feedback?: string — extra notes beyond what was in the reject
 * }
 */
export async function POST(request: Request) {
  try {
    const body = await request.json()

    const stepId = sanitizeString(body.step_id, 100)
    const extraFeedback = sanitizeString(body.additional_feedback, 1000)

    if (!stepId) {
      return NextResponse.json({ error: 'Missing required field: step_id' }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()

    // Fetch the rejected step
    const { data: step, error: stepError } = await supabase
      .from('pipeline_steps')
      .select('id, pipeline_id, step_index, hitl_status, hitl_feedback, status')
      .eq('id', stepId)
      .single()

    if (stepError || !step) {
      return NextResponse.json({ error: `Step "${stepId}" not found` }, { status: 404 })
    }

    if (step.hitl_status !== 'rejected') {
      return NextResponse.json(
        { error: `Step "${stepId}" was not rejected (current hitl_status: ${step.hitl_status}). Only rejected steps can be retried.` },
        { status: 409 }
      )
    }

    // Fetch the original pipeline
    const { data: pipeline, error: pipelineError } = await supabase
      .from('pipeline_executions')
      .select('id, client_id, objective, trigger_type, trigger_source, template_name')
      .eq('id', step.pipeline_id)
      .single()

    if (pipelineError || !pipeline) {
      return NextResponse.json({ error: `Pipeline "${step.pipeline_id}" not found` }, { status: 404 })
    }

    // Build enriched objective with feedback
    const feedbackLines: string[] = []
    if (step.hitl_feedback) feedbackLines.push(step.hitl_feedback)
    if (extraFeedback) feedbackLines.push(extraFeedback)

    const feedbackBlock = feedbackLines.length > 0
      ? `\n\n[HITL Feedback — incorporar en el re-run]:\n${feedbackLines.join('\n')}`
      : ''

    const enrichedObjective = pipeline.objective + feedbackBlock

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL
      || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')

    const orchestrator = new PipelineOrchestrator(supabase, baseUrl)

    // Create new pipeline — skip step 0 (competitive intel, doesn't change based on content feedback)
    const newPipelineId = await orchestrator.createPipeline({
      clientId: pipeline.client_id,
      objective: enrichedObjective,
      triggerType: 'manual',
      triggerSource: `hitl_retry:${stepId}`,
      templateName: pipeline.template_name || 'campaign_full_9step',
      skipSteps: [0],
      createdBy: 'emilio',
    })

    // Start execution async (non-blocking)
    orchestrator.executePipeline(newPipelineId).catch((err) => {
      console.error(`Retry pipeline ${newPipelineId} execution error:`, err)
    })

    return NextResponse.json({
      success: true,
      retry_pipeline_id: newPipelineId,
      original_pipeline_id: pipeline.id,
      original_step_id: stepId,
      feedback_incorporated: feedbackLines.length > 0,
      skipped_steps: [0],
      message: `New pipeline started (step 0 skipped). Feedback from rejection incorporated into objective. Track at /api/pipeline/status?id=${newPipelineId}`,
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

/**
 * GET /api/hitl/retry — endpoint info
 */
export async function GET() {
  return NextResponse.json({
    endpoint: '/api/hitl/retry',
    method: 'POST',
    description: 'Re-run a pipeline after a HITL rejection, injecting the stored feedback. Skips step 0 (Competitive Intel). Closes GAP #3 from HITL_FINDINGS_S33.',
    body_schema: {
      step_id: 'uuid (required) — the rejected pipeline_steps.id',
      additional_feedback: 'string (optional) — extra notes beyond the original rejection feedback',
    },
    flow: [
      '1. Fetch rejected step → read hitl_feedback',
      '2. Fetch original pipeline → read objective + client_id',
      '3. Create new pipeline with enriched objective (original + feedback)',
      '4. Skip step 0 (Competitive Intel, unchanged by content feedback)',
      '5. Execute async — returns new pipeline_id immediately',
    ],
  })
}
