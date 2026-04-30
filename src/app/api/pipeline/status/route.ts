import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { requireInternalApiKey } from '@/lib/auth-middleware'

/**
 * GET /api/pipeline/status?id=<pipeline_id>
 * Get detailed status of a pipeline execution including all steps.
 *
 * Also: GET /api/pipeline/status (no id) — list all active pipelines
 */
export async function GET(request: Request) {
  const auth = await requireInternalApiKey(request)
  if (!auth.ok) return auth.response

  const { searchParams } = new URL(request.url)
  const pipelineId = searchParams.get('id')
  const supabase = getSupabaseAdmin()

  if (!pipelineId) {
    // List active pipelines
    const { data: pipelines, error } = await supabase
      .from('pipeline_executions')
      .select(`
        id,
        objective,
        status,
        current_step_index,
        pipeline_template,
        total_input_tokens,
        total_output_tokens,
        total_cost_usd,
        created_by,
        started_at,
        completed_at,
        paused_at,
        created_at
      `)
      .order('created_at', { ascending: false })
      .limit(20)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      pipelines: pipelines || [],
      count: pipelines?.length || 0,
    })
  }

  // Get specific pipeline with all steps
  const { data: pipeline, error: pipelineError } = await supabase
    .from('pipeline_executions')
    .select('*')
    .eq('id', pipelineId)
    .single()

  if (pipelineError || !pipeline) {
    return NextResponse.json(
      { error: `Pipeline "${pipelineId}" not found` },
      { status: 404 }
    )
  }

  const { data: steps, error: stepsError } = await supabase
    .from('pipeline_steps')
    .select(`
      id,
      step_index,
      step_name,
      step_display_name,
      agent_name,
      status,
      hitl_required,
      hitl_status,
      hitl_reviewer,
      hitl_feedback,
      hitl_resolved_at,
      input_tokens,
      output_tokens,
      cost_usd,
      duration_ms,
      started_at,
      completed_at,
      error_message,
      retry_count
    `)
    .eq('pipeline_id', pipelineId)
    .order('step_index')

  if (stepsError) {
    return NextResponse.json({ error: stepsError.message }, { status: 500 })
  }

  // Calculate progress
  const totalSteps = steps?.length || 0
  const completedSteps = steps?.filter(s => s.status === 'completed').length || 0
  const failedSteps = steps?.filter(s => s.status === 'failed').length || 0
  const skippedSteps = steps?.filter(s => s.status === 'skipped').length || 0
  const progress = totalSteps > 0 ? Math.round((completedSteps / (totalSteps - skippedSteps)) * 100) : 0

  // Format timeline
  const timeline = steps?.map(s => ({
    step: s.step_index,
    name: s.step_display_name,
    status: s.status,
    agent: s.agent_name,
    duration: s.duration_ms ? `${(s.duration_ms / 1000).toFixed(1)}s` : null,
    tokens: s.input_tokens + s.output_tokens || null,
    cost: s.cost_usd ? `$${s.cost_usd.toFixed(4)}` : null,
    hitl: s.hitl_required ? {
      status: s.hitl_status,
      reviewer: s.hitl_reviewer,
      feedback: s.hitl_feedback,
    } : null,
    error: s.error_message,
  }))

  return NextResponse.json({
    pipeline: {
      id: pipeline.id,
      objective: pipeline.objective,
      status: pipeline.status,
      template: pipeline.pipeline_template,
      trigger: {
        type: pipeline.trigger_type,
        source: pipeline.trigger_source,
      },
      progress: {
        current_step: pipeline.current_step_index,
        total_steps: totalSteps,
        completed: completedSteps,
        failed: failedSteps,
        skipped: skippedSteps,
        percentage: progress,
      },
      costs: {
        total_input_tokens: pipeline.total_input_tokens,
        total_output_tokens: pipeline.total_output_tokens,
        total_tokens: pipeline.total_input_tokens + pipeline.total_output_tokens,
        total_cost_usd: `$${pipeline.total_cost_usd.toFixed(4)}`,
      },
      timing: {
        created: pipeline.created_at,
        started: pipeline.started_at,
        completed: pipeline.completed_at,
        paused: pipeline.paused_at,
      },
      created_by: pipeline.created_by,
    },
    steps: timeline,
  })
}
