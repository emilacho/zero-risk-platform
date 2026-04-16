import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { PipelineOrchestrator } from '@/lib/pipeline-orchestrator'
import { sanitizeString } from '@/lib/validation'

/**
 * POST /api/pipeline/run
 * Start a new 9-step campaign pipeline execution.
 *
 * Body: {
 *   client_id: uuid (required) — which client this campaign is for
 *   objective: string (required) — campaign objective/goal
 *   trigger_type?: "manual" | "scheduled" | "webhook" | "n8n"
 *   trigger_source?: string — e.g. "Mission Control", "Slack"
 *   template?: string — pipeline template name (default: campaign_full_9step)
 *   skip_steps?: number[] — step indexes to skip
 *   async?: boolean — if true, returns immediately with pipeline_id (default: true)
 * }
 */
export async function POST(request: Request) {
  try {
    const body = await request.json()

    const clientId = body.client_id
    const objective = sanitizeString(body.objective, 2000)
    const triggerType = body.trigger_type || 'manual'
    const triggerSource = body.trigger_source || 'api'
    const template = body.template || 'campaign_full_9step'
    const skipSteps = body.skip_steps || []
    const isAsync = body.async !== false // default true

    if (!clientId || !objective) {
      return NextResponse.json(
        { error: 'Missing required fields: client_id, objective' },
        { status: 400 }
      )
    }

    // Validate client exists
    const supabase = getSupabaseAdmin()
    const { data: client, error: clientError } = await supabase
      .from('clients')
      .select('id, name')
      .eq('id', clientId)
      .single()

    if (clientError || !client) {
      return NextResponse.json(
        { error: `Client "${clientId}" not found` },
        { status: 404 }
      )
    }

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL
      || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')

    const orchestrator = new PipelineOrchestrator(supabase, baseUrl)

    // Create pipeline
    const pipelineId = await orchestrator.createPipeline({
      clientId,
      objective,
      triggerType,
      triggerSource,
      templateName: template,
      skipSteps,
      createdBy: 'emilio', // single-tenant
    })

    if (isAsync) {
      // Start execution in background (non-blocking)
      // In production: use Vercel Background Functions or a queue
      orchestrator.executePipeline(pipelineId).catch((err) => {
        console.error(`Pipeline ${pipelineId} execution error:`, err)
      })

      return NextResponse.json({
        success: true,
        pipeline_id: pipelineId,
        client: client.name,
        objective,
        template,
        status: 'running',
        message: `Pipeline started for ${client.name}. Track progress at /api/pipeline/status?id=${pipelineId}`,
      })
    } else {
      // Synchronous execution (blocks until complete or HITL pause)
      await orchestrator.executePipeline(pipelineId)

      const { data: pipeline } = await supabase
        .from('pipeline_executions')
        .select('*')
        .eq('id', pipelineId)
        .single()

      return NextResponse.json({
        success: true,
        pipeline_id: pipelineId,
        status: pipeline?.status,
        current_step: pipeline?.current_step_index,
      })
    }
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

/**
 * GET /api/pipeline/run — endpoint info
 */
export async function GET() {
  return NextResponse.json({
    endpoint: '/api/pipeline/run',
    method: 'POST',
    description: 'Start a new 9-step campaign pipeline. Returns pipeline_id for tracking.',
    body_schema: {
      client_id: 'uuid (required)',
      objective: 'string (required) — campaign goal',
      trigger_type: '"manual" | "scheduled" | "webhook" | "n8n" (default: manual)',
      trigger_source: 'string (optional)',
      template: 'string (default: campaign_full_9step)',
      skip_steps: 'number[] (optional) — step indexes to skip',
      async: 'boolean (default: true) — return immediately or wait for completion',
    },
    pipeline_steps: [
      '0: Competitive Intelligence (5-layer)',
      '1: Campaign Brief',
      '2: Jefe de Marketing Review',
      '3: Content Creation (parallel agents)',
      '4: QA Review (Editor en Jefe)',
      '5: Human Review (HITL)',
      '6: Publication (n8n)',
      '7: Optimization (delayed 48h)',
      '8: Reporting + HITL',
    ],
  })
}
