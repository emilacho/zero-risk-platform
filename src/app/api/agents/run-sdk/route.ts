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
import { checkInternalKey } from '@/lib/internal-auth'
import { validateObject } from '@/lib/input-validator'

export const runtime = 'nodejs'
export const maxDuration = 300 // 5 min — pipelines largos

interface RunSdkInput {
  agent: string
  task: string
  resume_session_id?: string | null
  client_id?: string | null
  pipeline_id?: string | null
  step_name?: string | null
  extra?: Record<string, unknown> | null
}

export async function POST(request: Request) {
  const auth = checkInternalKey(request)
  if (!auth.ok) {
    return NextResponse.json(
      { error: 'unauthorized', code: 'E-AUTH-001', detail: auth.reason },
      { status: 401 },
    )
  }

  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return NextResponse.json(
      { error: 'invalid_json', code: 'E-INPUT-PARSE' },
      { status: 400 },
    )
  }

  const v = validateObject<RunSdkInput>(raw, 'agents-run-sdk')
  if (!v.ok) return v.response
  const body = v.data

  try {
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
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 },
    )
  }
}

export async function GET() {
  return NextResponse.json({
    endpoint: '/api/agents/run-sdk',
    method: 'POST',
    runtime: 'nodejs',
    description:
      'Ejecutor de UN agente vía @anthropic-ai/claude-agent-sdk. Reemplaza /api/agents/run.',
  })
}
