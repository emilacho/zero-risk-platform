/**
 * POST /api/agents/run-sdk
 *
 * Thin proxy to the Railway-hosted agent-runner service. Vercel handles
 * auth + validation + sanitization + analytics + editor middleware; the
 * actual SDK invocation runs on Railway where pnpm installs the SDK's
 * 219.9MB optional linux-x64 native binary cleanly (Vercel's NFT could
 * not include it in the function bundle · see commit history of
 * fix/vercel-claude-agent-sdk-binary for the 7-commit triage).
 *
 * Required env vars (set in Vercel dashboard):
 *   RAILWAY_AGENT_RUNNER_URL  · e.g. https://zero-risk-agent-runner-production.up.railway.app
 *   INTERNAL_API_KEY          · shared secret for caller→Vercel AND Vercel→Railway hops
 *
 * Body shape unchanged from the pre-migration route (n8n workflows and
 * other callers don't need to know the runner moved):
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
import * as Sentry from '@sentry/nextjs'
import { sanitizeString } from '@/lib/validation'
import { capture } from '@/lib/posthog'
import { checkInternalKey } from '@/lib/internal-auth'
import { validateObject } from '@/lib/input-validator'
import { requiresEditorReview, getEditorConfig, PRIMARY_REVIEWER, SECOND_REVIEWER } from '@/lib/editor-routing'
import { runDualReviewMiddleware } from '@/lib/editor-middleware'
import { resolveAgentSlug } from '@/lib/agent-alias-map'
import { getSupabaseAdmin } from '@/lib/supabase'

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

/**
 * Shape returned by the Railway agent-runner service.
 * Must stay byte-aligned with `AgentRunResult` exported from
 * services/agent-runner/src/lib/agent-sdk-runner.ts.
 */
interface AgentRunResultProxy {
  success: boolean
  response: string
  sessionId: string | null
  inputTokens: number
  outputTokens: number
  costUsd: number
  durationMs: number
  model: string
  error?: string
}

// 60 s aligns with Vercel Pro Fluid Compute defaults. Most agent runs land
// well under this; multi-turn pipelines that need longer should re-issue
// the call (or upgrade to a streaming response if/when the SDK supports it
// inside a serverless function).
const RAILWAY_FETCH_TIMEOUT_MS = 60_000

// Inbound headers we never forward to the Railway service. `host` would
// confuse the upstream's virtual-host routing; `content-length` would
// mismatch since we re-stringify the body; `connection` / `keep-alive`
// are hop-by-hop. Everything else (trace IDs, request IDs, user-agent,
// accept, etc.) gets forwarded as-is per the "headers passthrough
// excepto host" requirement.
const HOP_BY_HOP_OR_REWRITTEN_HEADERS = new Set([
  'host',
  'content-length',
  'connection',
  'keep-alive',
  'transfer-encoding',
  'upgrade',
])

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

    // ── Proxy to Railway agent-runner ────────────────────────────────────
    // The actual SDK invocation lives in services/agent-runner/ on Railway.
    // This block forwards the request, propagates auth, and surfaces clean
    // 5xx / 504 errors per the v2 proxy spec (Sentry capture on upstream
    // failure · upstream_status surfaced in the response body).
    const railwayUrl = process.env.RAILWAY_AGENT_RUNNER_URL
    if (!railwayUrl) {
      Sentry.captureMessage(
        'agent-runner proxy: RAILWAY_AGENT_RUNNER_URL not configured on Vercel',
        'error',
      )
      return NextResponse.json(
        { error: 'agent-runner not configured', upstream_status: 0 },
        { status: 502 },
      )
    }
    const internalAuth = process.env.INTERNAL_API_KEY ?? ''
    if (!internalAuth) {
      Sentry.captureMessage(
        'agent-runner proxy: INTERNAL_API_KEY not configured on Vercel',
        'error',
      )
      return NextResponse.json(
        { error: 'agent-runner auth not configured', upstream_status: 0 },
        { status: 502 },
      )
    }

    // Forward inbound headers (except host + content-length + hop-by-hop)
    // so trace / request-id / x-vercel-id propagate through to Railway logs.
    // Then override / set the two headers we own: the upstream-auth secret
    // and content-type (which must match the re-stringified body).
    const forwardedHeaders: Record<string, string> = {}
    request.headers.forEach((value, key) => {
      if (!HOP_BY_HOP_OR_REWRITTEN_HEADERS.has(key.toLowerCase())) {
        forwardedHeaders[key] = value
      }
    })
    forwardedHeaders['x-internal-auth'] = internalAuth
    forwardedHeaders['content-type'] = 'application/json'

    // The Railway service expects camelCase keys (see
    // services/agent-runner/src/index.ts handler). The inbound Vercel API
    // contract uses snake_case (n8n convention). We translate field names
    // here · this is NOT byte-for-byte passthrough, but it IS field-for-
    // field forwarding with the rename the upstream contract requires.
    // When the Railway service learns to accept snake_case as well, this
    // block can be replaced with `JSON.stringify(body)`.
    const proxyBody = {
      agentName,
      task,
      resumeSessionId: body.resume_session_id || null,
      clientId: body.client_id || null,
      pipelineId: body.pipeline_id || null,
      stepName: body.step_name || null,
      extra: body.extra || undefined,
    }

    const controller = new AbortController()
    const timeoutHandle = setTimeout(() => controller.abort(), RAILWAY_FETCH_TIMEOUT_MS)

    let railwayResponse: Response
    try {
      railwayResponse = await fetch(`${railwayUrl.replace(/\/+$/, '')}/run-sdk`, {
        method: 'POST',
        headers: forwardedHeaders,
        body: JSON.stringify(proxyBody),
        signal: controller.signal,
      })
    } catch (err) {
      clearTimeout(timeoutHandle)
      const isAbort = err instanceof Error && err.name === 'AbortError'
      if (isAbort) {
        // Hot path · no Sentry noise for routine timeouts.
        return NextResponse.json({ error: 'agent-runner timeout' }, { status: 504 })
      }
      Sentry.captureException(
        err instanceof Error ? err : new Error(String(err)),
        { tags: { proxy: 'agent-runner', kind: 'fetch_error' } },
      )
      return NextResponse.json(
        { error: 'agent-runner upstream failed', upstream_status: 0 },
        { status: 502 },
      )
    }
    clearTimeout(timeoutHandle)

    // Read body once · need it for both the parse and the 5xx Sentry breadcrumb.
    const railwayText = await railwayResponse.text()

    // Upstream 5xx · log + 502. Skip Sentry for 502 from us (no double-count)
    // and skip when the body is a well-formed agent failure (those are app
    // errors, not infra · pass them through to the caller untouched).
    if (railwayResponse.status >= 500) {
      let isGracefulAgentFailure = false
      try {
        const parsed = JSON.parse(railwayText) as { success?: boolean; error?: string }
        isGracefulAgentFailure = parsed.success === false && typeof parsed.error === 'string'
      } catch {
        // non-JSON body · genuine infra failure
      }
      if (!isGracefulAgentFailure) {
        Sentry.captureMessage(
          `agent-runner upstream 5xx: status=${railwayResponse.status}`,
          {
            level: 'error',
            tags: { proxy: 'agent-runner', kind: 'upstream_5xx' },
            extra: { body_preview: railwayText.slice(0, 500) },
          },
        )
        return NextResponse.json(
          { error: 'agent-runner upstream failed', upstream_status: railwayResponse.status },
          { status: 502 },
        )
      }
    }

    let result: AgentRunResultProxy
    try {
      result = JSON.parse(railwayText) as AgentRunResultProxy
    } catch {
      Sentry.captureMessage(
        `agent-runner returned non-JSON: status=${railwayResponse.status}`,
        {
          level: 'error',
          tags: { proxy: 'agent-runner', kind: 'non_json' },
          extra: { body_preview: railwayText.slice(0, 500) },
        },
      )
      return NextResponse.json(
        { error: 'agent-runner upstream failed', upstream_status: railwayResponse.status },
        { status: 502 },
      )
    }
    // Defensive: ensure all fields we read below have a value even if the
    // Railway service evolves its response shape independently.
    result = {
      success: !!result.success,
      response: typeof result.response === 'string' ? result.response : '',
      sessionId: result.sessionId ?? null,
      inputTokens: typeof result.inputTokens === 'number' ? result.inputTokens : 0,
      outputTokens: typeof result.outputTokens === 'number' ? result.outputTokens : 0,
      costUsd: typeof result.costUsd === 'number' ? result.costUsd : 0,
      durationMs: typeof result.durationMs === 'number' ? result.durationMs : 0,
      model: typeof result.model === 'string' ? result.model : 'unknown',
      error: result.error,
    }

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

    // Base response — may be augmented by dual reviewer middleware below
    const baseResponse = {
      success: true,
      agent: agentName,
      response: result.response,
      session_id: result.sessionId,
      model: result.model,
      input_tokens: result.inputTokens,
      output_tokens: result.outputTokens,
      cost_usd: result.costUsd,
      duration_ms: result.durationMs,
    }

    // DUAL REVIEWER MIDDLEWARE — mirrors /api/agents/run lines 478-503 so workflows
    // hitting run-sdk also flow through Camino III HITL when a whitelist agent
    // emits content. Skipped for reviewers themselves, header opt-out, and non-whitelisted.
    const canonicalSlug = resolveAgentSlug(agentName)
    const skipMiddleware =
      request.headers.get('x-skip-editor-middleware') === '1' ||
      canonicalSlug === PRIMARY_REVIEWER ||
      canonicalSlug === SECOND_REVIEWER ||
      !requiresEditorReview(canonicalSlug)

    if (skipMiddleware) {
      return NextResponse.json(baseResponse)
    }

    const editorConfig = getEditorConfig(canonicalSlug)!
    const baseUrl =
      process.env.NEXT_PUBLIC_BASE_URL ||
      `https://${request.headers.get('host') || 'localhost:3000'}`

    try {
      const middlewareResult = await runDualReviewMiddleware({
        agentSlug: canonicalSlug,
        content: result.response ?? '',
        task,
        context: (body.extra || {}) as Record<string, unknown>,
        config: editorConfig,
        supabase: getSupabaseAdmin(),
        baseUrl,
      })
      return NextResponse.json({ ...baseResponse, ...middlewareResult })
    } catch (middlewareError) {
      console.error('[Editor Middleware run-sdk] Failed:', middlewareError)
      return NextResponse.json({
        ...baseResponse,
        editor_review: { verdict: 'middleware_error', severity: 'low' },
      })
    }
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
      'Thin proxy to the Railway agent-runner service. SDK invocation lives at services/agent-runner/ on Railway · this endpoint preserves the original API contract.',
    upstream: process.env.RAILWAY_AGENT_RUNNER_URL ? 'configured' : 'MISSING (set RAILWAY_AGENT_RUNNER_URL)',
  })
}
