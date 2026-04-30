/**
 * POST /api/agents/run-sdk
 *
 * Ejecutor de UN agente usando @anthropic-ai/claude-agent-sdk.
 * Este endpoint es el reemplazo de /api/agents/run (que llama Messages API directo).
 *
 * IMPORTANTE: runtime = "nodejs" obligatorio. El SDK spawnea el CLI `claude`
 * como subproceso — no funciona en Edge Runtime.
 *
 * Body:
 *   {
 *     agent: string,
 *     task: string,
 *     resume_session_id?: string,     // para encadenar pasos del pipeline
 *     client_id?: string,             // activa MCP Client Brain
 *     pipeline_id?: string,
 *     step_name?: string,
 *     extra?: Record<string, unknown>
 *   }
 */

import { NextResponse } from 'next/server'
import { runAgentViaSDK } from '@/lib/agent-sdk-runner'
import { sanitizeString } from '@/lib/validation'
import { capture } from '@/lib/posthog'
import { requireInternalApiKey } from '@/lib/auth-middleware'
import { captureRouteError } from '@/lib/sentry-capture'

export const runtime = 'nodejs'
export const maxDuration = 300 // 5 min — pipelines largos

export async function POST(request: Request) {
  const auth = await requireInternalApiKey(request)
  if (!auth.ok) return auth.response

  try {
    const body = await request.json()

    const agentName = sanitizeString(body.agent, 50)
    const task = sanitizeString(body.task, 8000)

    if (!agentName || !task) {
      return NextResponse.json({ error: 'Missing required fields: agent, task' }, { status: 400 })
    }

    capture('agent_run_invoked', String(body.client_id || 'system'), {
      agent_slug: agentName,
      model: 'sdk',
      client_id: body.client_id || null,
      has_pipeline_id: !!body.pipeline_id,
    })

    const result = await runAgentViaSDK({
      agentName,
      task,
      resumeSessionId: body.resume_session_id || null,
      clientId: body.client_id || null,
      pipelineId: body.pipeline_id || null,
      stepName: body.step_name || null,
      extra: body.extra || undefined,
    })

    capture('agent_run_completed', String(body.client_id || 'system'), {
      agent_slug: agentName,
      success: result.success,
      duration_ms: result.durationMs ?? 0,
      input_tokens: result.inputTokens ?? 0,
      output_tokens: result.outputTokens ?? 0,
      cost_usd: result.costUsd ?? 0,
    })

    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      agent: agentName,
      response: result.response,
      session_id: result.sessionId,
      model: result.model,
      input_tokens: result.inputTokens,
      output_tokens: result.outputTokens,
      cost_usd: result.costUsd,
      duration_ms: result.durationMs,
    })
  } catch (error) {
    captureRouteError(error, request, {
      route: '/api/agents/run-sdk',
      source: 'route_handler',
    })
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 },
    )
  }
}

export async function GET(request: Request) {
  const auth = await requireInternalApiKey(request)
  if (!auth.ok) return auth.response

  return NextResponse.json({
    endpoint: '/api/agents/run-sdk',
    method: 'POST',
    runtime: 'nodejs',
    description:
      'Ejecutor de UN agente vía @anthropic-ai/claude-agent-sdk. Reemplaza /api/agents/run.',
  })
}
