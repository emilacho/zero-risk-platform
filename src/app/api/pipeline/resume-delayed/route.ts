import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { PipelineOrchestrator } from '@/lib/pipeline-orchestrator'
import { requireInternalApiKey } from '@/lib/auth-middleware'

/**
 * POST /api/pipeline/resume-delayed
 * Called by n8n cron (hourly) to resume pipelines whose delay has expired.
 *
 * Logic:
 * 1. Find all pipeline_steps with status='pending' and input_context.delay_hours > 0
 * 2. Check if scheduled_for timestamp has passed
 * 3. Resume each by calling orchestrator.resumeAfterHITL() with decision='approved'
 *
 * Returns: { resumed: number, pipelines: string[] }
 */
export async function POST(request: Request) {
  const auth = await requireInternalApiKey(request)
  if (!auth.ok) return auth.response

  try {
    const supabase = getSupabaseAdmin()

    // Find steps that are delayed (status=pending with delay metadata)
    // The pipeline is in paused_hitl state
    const { data: delayedPipelines, error: queryError } = await supabase
      .from('pipeline_executions')
      .select('id, current_step_index, steps_config')
      .eq('status', 'paused_hitl')

    if (queryError) {
      return NextResponse.json(
        { error: `Query failed: ${queryError.message}` },
        { status: 500 }
      )
    }

    if (!delayedPipelines || delayedPipelines.length === 0) {
      return NextResponse.json({
        success: true,
        resumed: 0,
        pipelines: [],
        message: 'No delayed pipelines found',
      })
    }

    const now = new Date()
    const resumed: string[] = []
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL
      || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')

    for (const pipeline of delayedPipelines) {
      // Get current step record to check for delay metadata
      const { data: stepRecord } = await supabase
        .from('pipeline_steps')
        .select('*')
        .eq('pipeline_id', pipeline.id)
        .eq('step_index', pipeline.current_step_index)
        .single()

      if (!stepRecord) continue

      // Check if this is a delayed step (has scheduled_for in input_context)
      const inputContext = stepRecord.input_context as Record<string, unknown> | null
      if (!inputContext?.delay_hours || !inputContext?.scheduled_for) continue

      const scheduledFor = new Date(inputContext.scheduled_for as string)
      if (now < scheduledFor) {
        // Delay hasn't expired yet — skip
        continue
      }

      // Delay expired — resume the pipeline
      const orchestrator = new PipelineOrchestrator(supabase, baseUrl)

      // Mark the delayed step as completed (the delay itself is the "work")
      await supabase
        .from('pipeline_steps')
        .update({
          status: 'completed',
          completed_at: now.toISOString(),
          output_text: `Delay of ${inputContext.delay_hours}h completed. Resuming optimization step.`,
        })
        .eq('pipeline_id', pipeline.id)
        .eq('step_index', pipeline.current_step_index)

      // Move pipeline to next step and resume
      const nextStep = pipeline.current_step_index + 1
      await supabase
        .from('pipeline_executions')
        .update({
          current_step_index: nextStep,
          status: 'running',
        })
        .eq('id', pipeline.id)

      // Execute from next step (non-blocking)
      orchestrator.executePipeline(pipeline.id).catch((err) => {
        console.error(`[ResumeDelayed] Pipeline ${pipeline.id} resume error:`, err)
      })

      resumed.push(pipeline.id)
    }

    return NextResponse.json({
      success: true,
      resumed: resumed.length,
      pipelines: resumed,
      checked: delayedPipelines.length,
      message: resumed.length > 0
        ? `Resumed ${resumed.length} delayed pipeline(s)`
        : 'No pipelines ready to resume yet',
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

/**
 * GET /api/pipeline/resume-delayed — endpoint info
 */
export async function GET(request: Request) {
  const auth = await requireInternalApiKey(request)
  if (!auth.ok) return auth.response

  return NextResponse.json({
    endpoint: '/api/pipeline/resume-delayed',
    method: 'POST',
    description: 'Called by n8n hourly cron to resume pipelines whose delay period has expired (e.g. 48h optimization delay).',
    called_by: 'n8n-workflows/pipeline-delay-resume.json',
  })
}
