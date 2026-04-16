import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

// Disable Next.js route handler caching — always fresh data
export const dynamic = 'force-dynamic'
export const revalidate = 0

/**
 * GET /api/hitl/pending
 * List all pipeline steps waiting for human approval.
 * Used by Mission Control inbox and Slack notifications.
 */
export async function GET() {
  const supabase = getSupabaseAdmin()

  // Step 1: Get all pending HITL steps (simple query, no joins)
  const { data: pendingSteps, error: stepsError } = await supabase
    .from('pipeline_steps')
    .select('id, pipeline_id, step_index, step_name, step_display_name, agent_name, output_text, hitl_status, created_at')
    .eq('hitl_required', true)
    .eq('hitl_status', 'pending')
    .eq('status', 'paused_hitl')
    .order('created_at', { ascending: true })

  if (stepsError) {
    return NextResponse.json({ error: stepsError.message }, { status: 500 })
  }

  if (!pendingSteps || pendingSteps.length === 0) {
    return NextResponse.json({ pending_count: 0, items: [] })
  }

  // Step 2: Get pipeline details for all matching pipeline_ids
  const pipelineIds = Array.from(new Set(pendingSteps.map(s => s.pipeline_id)))
  const { data: pipelines } = await supabase
    .from('pipeline_executions')
    .select('id, objective, client_id, created_by')
    .in('id', pipelineIds)

  // Step 3: Get client names for all client_ids
  const clientIds = Array.from(new Set((pipelines || []).map(p => p.client_id).filter(Boolean)))
  const { data: clients } = await supabase
    .from('clients')
    .select('id, name')
    .in('id', clientIds)

  // Build lookup maps
  const pipelineMap = new Map((pipelines || []).map(p => [p.id, p]))
  const clientMap = new Map((clients || []).map(c => [c.id, c]))

  // Step 4: Assemble response
  const items = pendingSteps.map((item) => {
    const pipeline = pipelineMap.get(item.pipeline_id)
    const client = pipeline?.client_id ? clientMap.get(pipeline.client_id) : null

    return {
      step_id: item.id,
      pipeline_id: item.pipeline_id,
      step_index: item.step_index,
      step_name: item.step_display_name || item.step_name,
      agent: item.agent_name,
      objective: pipeline?.objective || 'Unknown',
      client: client?.name || 'Unknown',
      preview: item.output_text?.substring(0, 500) || 'No preview available',
      submitted_at: item.created_at,
      resolve_url: `/api/hitl/resolve?step_id=${item.id}`,
    }
  })

  return NextResponse.json({
    pending_count: items.length,
    items,
  })
}
