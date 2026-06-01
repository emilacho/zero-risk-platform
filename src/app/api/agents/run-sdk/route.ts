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
import { resolveClientIdFromBody } from '@/lib/client-id-resolver'
import { validateWorkflowId } from '@/lib/agent-safety'

export const runtime = 'nodejs'
export const maxDuration = 300 // 5 min — pipelines largos

interface RunSdkInput {
  agent: string
  task: string
  resume_session_id?: string | null
  client_id?: string | null
  pipeline_id?: string | null
  step_name?: string | null
  /**
   * Workflow attribution · canon Sprint 8D (Emilio 2026-05-24) · "agentes
   * solo se invocan vía workflows NUNCA directo". Both required (non-null
   * non-empty). n8n auto-populates via `$workflow.id` + `$execution.id`
   * template expressions. Server-side wrappers (cascade-runner ·
   * onboarding · evidence-validate · influencer-outreach · generate-content)
   * MUST forward the workflow_id received from their upstream n8n caller.
   * Direct CC / Cowork / smoke-script callers MUST route via the canonical
   * "Smoke Test Agent Invocation" n8n workflow.
   * Either top-level OR nested under `context.workflow_id` accepted.
   */
  workflow_id?: string | null
  workflow_execution_id?: string | null
  /**
   * Sprint 8D tail canon · workflow checkpoint/resume bypass flag. true →
   * skip cache lookup · re-execute SDK call. Accepted top-level (camelCase
   * OR snake_case) OR nested under `context`.
   */
  force_restart?: boolean
  forceRestart?: boolean
  /**
   * Sprint 9 entry canon · dry-run mode flag. true → skip Anthropic SDK
   * call · return canonical fake response · zero LLM cost · skip checkpoint
   * save (canon guard against cache pollution). Accepted top-level
   * (camelCase OR snake_case) OR nested under `context`.
   */
  dry_run?: boolean
  dryRun?: boolean
  context?: Record<string, unknown> | null
  extra?: Record<string, unknown> | null
}

/**
 * Resolve workflow_id + workflow_execution_id from request body · accepts
 * top-level OR nested under `context` (matches /api/agents/run pattern at
 * line 549-570 · symmetry across both endpoints).
 */
function resolveWorkflowAttribution(body: RunSdkInput): {
  workflow_id: string | null
  workflow_execution_id: string | null
} {
  const ctx = (body.context ?? {}) as Record<string, unknown>
  const wfId = body.workflow_id ?? (ctx.workflow_id as string | null | undefined) ?? null
  const wfExec =
    body.workflow_execution_id ??
    (ctx.workflow_execution_id as string | null | undefined) ??
    null
  return {
    workflow_id: typeof wfId === 'string' && wfId.length > 0 ? wfId : null,
    workflow_execution_id: typeof wfExec === 'string' && wfExec.length > 0 ? wfExec : null,
  }
}

/**
 * Shape returned by the Railway agent-runner service.
 * Must stay byte-aligned with `AgentRunResult` exported from
 * services/agent-runner/src/lib/agent-sdk-runner.ts.
 */
/**
 * Sprint 8B B3 · Brain enrichment metadata returned by Railway runner.
 * Surfaced on outbound response so observability writers persist it.
 */
interface BrainEnrichmentProxyMeta {
  brain_hit: boolean
  brain_chunks_count: number
  brain_query_ms: number
  brain_cost_usd: number
  brain_error?: string
}

/**
 * Sprint 8 · prompt-cache metadata returned by Railway runner. The Agent
 * SDK auto-caches with a 1h TTL default (per upstream issue #188) · these
 * counters surface the hit/write split so cost rollups reflect the 90%
 * cache-read discount.
 */
interface CacheMetricsProxyMeta {
  cache_creation_input_tokens: number
  cache_read_input_tokens: number
  cache_creation_5m_tokens: number
  cache_creation_1h_tokens: number
}

interface AgentRunResultProxy {
  success: boolean
  response: string
  sessionId: string | null
  inputTokens: number
  outputTokens: number
  costUsd: number
  durationMs: number
  model: string
  brainEnrichment?: BrainEnrichmentProxyMeta
  cacheMetrics?: CacheMetricsProxyMeta
  error?: string
}

// 290 s aligns with maxDuration = 300 (Vercel Pro Fluid Compute default)
// with a 10 s buffer for response cleanup / Sentry flush before the
// platform itself kills the function. The previous 60 s was too tight
// for legitimate SDK tasks (e.g. "Generar intake form personalizado"
// runs 30-120 s) and was aborting them prematurely · CC#1 confirmed
// 3 fires with identical 60 s timeout pattern (execs 5931, 5933).
const RAILWAY_FETCH_TIMEOUT_MS = 290_000

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

    // ── Sprint 8D · workflow_id enforcement (Emilio canon 2026-05-24) ────
    // After the spam loop incident ($19/day Anthropic spend · 2026-05-24
    // forensics) Emilio cristalizó canon · "de ahora en adelante nada se
    // activa si no es a través de un workflow". Any agent invocation
    // without workflow attribution is rejected with 403 + structured log
    // so we can audit the caller and refactor them through the canonical
    // "Smoke Test Agent Invocation" n8n workflow.
    //
    // n8n callers · auto-populate via `$workflow.id` + `$execution.id`.
    // Server-side wrappers (cascade-runner · onboarding · evidence-validate
    // · influencer-outreach · generate-content) · forward the workflow_id
    // received from their upstream n8n caller (NOT generate synthetic IDs).
    const wfAttr = resolveWorkflowAttribution(body)

    // §149 canonical gate · ADR-008-EXT v2 · `validateWorkflowId` is the
    // canonical shadow-ready gate. Runs on EVERY call (incl. missing-wf_id)
    // so its decisions can be observed before flipping to enforce mode.
    // Toggle ·  `AGENT_SAFETY_WORKFLOW_ID_ENFORCE=1` flips lib to enforce.
    // Default ("0" or unset) · shadow · logs but doesn't block · inline 403
    // below remains the live enforcer until the canonical flip dispatch.
    const safetyDecision = validateWorkflowId({
      workflow_id: wfAttr.workflow_id,
      workflow_execution_id: wfAttr.workflow_execution_id,
      client_id: body.client_id ?? null,
      agent_id: agentName,
      task,
      caller: 'api',
    })
    if (safetyDecision.would_reject || safetyDecision.metadata?.is_smoke_caller) {
      console.info(
        '[run-sdk] §149 safety decision · ' +
          JSON.stringify({
            gate: safetyDecision.gate,
            shadow_mode: safetyDecision.shadow_mode,
            would_reject: safetyDecision.would_reject,
            enforced: safetyDecision.enforced,
            reason: safetyDecision.reason,
            metadata: safetyDecision.metadata,
          }),
      )
    }

    if (!wfAttr.workflow_id || !wfAttr.workflow_execution_id) {
      const callerHint = {
        agent: agentName,
        user_agent: request.headers.get('user-agent')?.slice(0, 100) || null,
        x_vercel_id: request.headers.get('x-vercel-id')?.slice(0, 64) || null,
        body_keys: Object.keys(body as unknown as Record<string, unknown>),
        has_context: !!body.context,
        missing: [
          !wfAttr.workflow_id && 'workflow_id',
          !wfAttr.workflow_execution_id && 'workflow_execution_id',
        ].filter(Boolean),
      }
      console.warn(
        '[run-sdk] REJECTED · workflow_id enforcement · ' + JSON.stringify(callerHint),
      )
      Sentry.captureMessage(
        `[run-sdk] workflow_id enforcement reject · agent=${agentName} · missing=${callerHint.missing.join(',')}`,
        'warning',
      )
      return NextResponse.json(
        {
          error: 'workflow_id_required',
          code: 'E-WF-ID-REQUIRED',
          detail:
            'canon Sprint 8D (Emilio 2026-05-24) · agents only via workflows · ' +
            `missing field(s): ${callerHint.missing.join(', ')} · ` +
            'pass workflow_id + workflow_execution_id top-level OR nested under context · ' +
            'for ad-hoc smoke tests use the canonical "Smoke Test Agent Invocation" n8n workflow',
        },
        { status: 403 },
      )
    }

    // LOTE-C item 8 · multi-path client_id resolver. Historically callers only
    // populated `body.client_id`, but several n8n workflows nest under
    // metadata / client.id / extra. Resolve once and use the resolved value
    // for analytics, the proxy forward, and downstream observability so
    // `agent_invocations.client_id` lands populated for the new rows.
    const clientId = resolveClientIdFromBody(body)
    if (!clientId) {
      // Soft warn · the request still proceeds (a null client_id is valid
      // for system / health-probe invocations). Body keys are surfaced so
      // operators can see which payload shape arrived without the field.
      console.warn(
        '[run-sdk] no client_id resolved from body · keys=',
        Object.keys(body as unknown as Record<string, unknown>).join(','),
      )
    }

    capture('agent_run_invoked', String(clientId || 'system'), {
      agent_slug: agentName,
      model: 'sdk',
      client_id: clientId,
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
    // Sprint 8D tail · forceRestart flag (workflow checkpoint canon) ·
    // accepts top-level OR nested under context · matches workflow_id pattern.
    const ctx = (body.context ?? {}) as Record<string, unknown>
    const forceRestart =
      body.force_restart === true ||
      body.forceRestart === true ||
      ctx.force_restart === true ||
      ctx.forceRestart === true

    // Sprint 9 entry · dry-run flag · accepts top-level (camelCase OR snake_case)
    // OR nested under context. Header X-Dry-Run also honored at the proxy level
    // (forwarded as dryRun=true). Env DRY_RUN_DEFAULT panic-button is checked
    // again downstream at Railway (defense in depth).
    const headerDryRun =
      request.headers.get('x-dry-run')?.toLowerCase() === 'true'
    const dryRun =
      body.dry_run === true ||
      body.dryRun === true ||
      ctx.dry_run === true ||
      ctx.dryRun === true ||
      headerDryRun

    const proxyBody = {
      agentName,
      task,
      resumeSessionId: body.resume_session_id || null,
      clientId,
      pipelineId: body.pipeline_id || null,
      stepName: body.step_name || null,
      // Sprint 8D workflow attribution · forwarded to Railway so the
      // downstream observability writer persists workflow_id + execution_id
      // on `agent_invocations` (no more NULL rows · auditable per-workflow).
      workflowId: wfAttr.workflow_id,
      workflowExecutionId: wfAttr.workflow_execution_id,
      // Sprint 8D tail · workflow checkpoint canon · default false (use cache
      // when canonical completed checkpoint exists). Set true to bypass cache
      // and re-execute SDK call (HITL rejection re-runs · ops force-fresh).
      forceRestart,
      // Sprint 9 entry · dry-run mode · default false (real SDK call). Set
      // true to skip Anthropic + return canonical fake response · zero LLM
      // cost · enables mass-audit Phase 2 functional validation.
      dryRun,
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
    const rawBrain = (result as { brainEnrichment?: unknown }).brainEnrichment as
      | Record<string, unknown>
      | undefined
    const brainEnrichment: BrainEnrichmentProxyMeta | undefined = rawBrain && typeof rawBrain === 'object'
      ? {
          brain_hit: rawBrain.brain_hit === true,
          brain_chunks_count:
            typeof rawBrain.brain_chunks_count === 'number' ? rawBrain.brain_chunks_count : 0,
          brain_query_ms:
            typeof rawBrain.brain_query_ms === 'number' ? rawBrain.brain_query_ms : 0,
          brain_cost_usd:
            typeof rawBrain.brain_cost_usd === 'number' ? rawBrain.brain_cost_usd : 0,
          ...(typeof rawBrain.brain_error === 'string'
            ? { brain_error: rawBrain.brain_error }
            : {}),
        }
      : undefined
    const rawCache = (result as { cacheMetrics?: unknown }).cacheMetrics as
      | Record<string, unknown>
      | undefined
    const cacheMetrics: CacheMetricsProxyMeta | undefined = rawCache && typeof rawCache === 'object'
      ? {
          cache_creation_input_tokens:
            typeof rawCache.cache_creation_input_tokens === 'number' ? rawCache.cache_creation_input_tokens : 0,
          cache_read_input_tokens:
            typeof rawCache.cache_read_input_tokens === 'number' ? rawCache.cache_read_input_tokens : 0,
          cache_creation_5m_tokens:
            typeof rawCache.cache_creation_5m_tokens === 'number' ? rawCache.cache_creation_5m_tokens : 0,
          cache_creation_1h_tokens:
            typeof rawCache.cache_creation_1h_tokens === 'number' ? rawCache.cache_creation_1h_tokens : 0,
        }
      : undefined
    result = {
      success: !!result.success,
      response: typeof result.response === 'string' ? result.response : '',
      sessionId: result.sessionId ?? null,
      inputTokens: typeof result.inputTokens === 'number' ? result.inputTokens : 0,
      outputTokens: typeof result.outputTokens === 'number' ? result.outputTokens : 0,
      costUsd: typeof result.costUsd === 'number' ? result.costUsd : 0,
      durationMs: typeof result.durationMs === 'number' ? result.durationMs : 0,
      model: typeof result.model === 'string' ? result.model : 'unknown',
      brainEnrichment,
      cacheMetrics,
      error: result.error,
    }

    capture('agent_run_completed', String(clientId || 'system'), {
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

    // Base response — may be augmented by dual reviewer middleware below.
    // Sprint 8B B3 · brain_enrichment surfaced so callers + observability
    // writers (downstream /api/agents/run consumer) see Pilar 2 RAG markers.
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
      ...(result.brainEnrichment ? { brain_enrichment: result.brainEnrichment } : {}),
      ...(result.cacheMetrics ? { cache_metrics: result.cacheMetrics } : {}),
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
        // LOTE-C Fix 8c · propagate resolved client_id (PR #16 resolver
        // chain) to Camino III reviewers · symmetric with `/api/agents/run`.
        clientId: clientId,
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
