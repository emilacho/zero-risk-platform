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
import {
  isDiscoveryBrainPushEnabled,
  persistDiscoveryToBrain,
  populateClientConfigFromDiscovery,
  resolveDiscoverySource,
  type DiscoveryOutput,
} from '@/lib/discovery-output'
import {
  dispatchAsyncCallback,
  resolveCallbackUrl,
} from '@/lib/agent-async-callback'

export const runtime = 'nodejs'
// Sprint 12 Track U · P0 #2 bump 300→800s · Track R audit identified Journey B
// Step 3 (brand-strategist) doing ~363s real work · the 300s cap was aborting
// legitimate agent calls mid-execution. 800s is the Vercel Pro Fluid Compute
// ceiling (canon docs 2026) · still inside billed-by-second tier so cost
// differential is small. Long-term canon · migrate to Inngest async pattern
// (ENCENDIDO escalón 2 wire-in · Sprint 13+) so the cap drops out entirely.
export const maxDuration = 800 // 13.3 min — Journey B canon piloto Pérez

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
  /**
   * SPEC async-agent-callback 2026-06-09 · Track N · n8n Wait+Resume pattern.
   *
   * When the caller (typically an n8n worker · n8n's `Wait` node generates
   * `$execution.resumeUrl`) provides this URL · the route POSTs the canonical
   * baseResponse to it AFTER persist hooks complete. n8n's Wait node then
   * resumes the workflow with the response body. Works around the n8n HTTP
   * client keepalive cap (~155s observed 2026-06-09) that disconnects mid-
   * agent-run · agent SDK + persist hooks still run on Vercel Fluid Compute ·
   * the callback fires once everything is done.
   *
   * Backward-compat · when absent · canonical behavior unchanged (sync return).
   * Accepted top-level OR nested under `context.callback_url`.
   */
  callback_url?: string | null
  callbackUrl?: string | null
  context?: Record<string, unknown> | null
  extra?: Record<string, unknown> | null
}

/**
 * Canon canonical · SPEC lazo agentico 2026-06-05 · which agent slugs
 * SHOULD have their response parsed for Discovery output JSON. The match
 * is intentionally narrow · only the Auto-Discovery surface in Phase 1.
 * Other agents return prose (cascade · evidence · brand) · parsing them
 * would be wasted work + risk false positives. Adding new slugs is a
 * canonical edit (1 line) when CC#4 expands the loop to other journeys.
 */
function isDiscoveryAgentSlug(agentSlug: string): boolean {
  const slug = (agentSlug ?? '').toLowerCase()
  return slug === 'onboarding-specialist' || slug === 'onboarding_specialist'
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

/**
 * SPEC lazo agentico 2026-06-05 follow-up · Discovery tool-call capture
 * shape · matches `DiscoveryToolCallCapture` in
 * `services/agent-runner/src/lib/agent-sdk-runner.ts` byte-aligned. When
 * present · the platform PREFERS this over the text parser (parser stays
 * as defense-in-depth fallback). The Railway runner captures the agent's
 * `emit_discovery_output` tool_use blocks from the SDK stream · args are
 * pre-validated against the zod schema in the MCP server so shape is
 * canonical per SDK contract.
 */
interface DiscoveryToolCallProxyMeta {
  input: Record<string, unknown>
  emission_count: number
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
  discoveryToolCall?: DiscoveryToolCallProxyMeta
  error?: string
}

// 790 s aligns with maxDuration = 800 (Vercel Pro Fluid Compute ceiling)
// with a 10 s buffer for response cleanup / Sentry flush before the
// platform itself kills the function. Bumped from 290 s in Sprint 12
// Track U · evidence from Track R audit (Journey B Step 3 brand-strategist
// ~363 s real work was being aborted by the 290 s upstream timeout · the
// 60 s pre-bump pattern was even tighter · CC#1 confirmed 3 fires with
// identical 60 s timeout pattern execs 5931, 5933).
const RAILWAY_FETCH_TIMEOUT_MS = 790_000

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
    // SPEC lazo agentico 2026-06-05 follow-up · Discovery tool-call capture
    // forwarded from Railway runner · args are pre-validated against the zod
    // schema in the MCP server so shape is canonical per SDK contract · we
    // still defensively type-check at the proxy boundary because the runner
    // is a separate deployment surface.
    const rawDiscoveryToolCall = (result as { discoveryToolCall?: unknown }).discoveryToolCall as
      | Record<string, unknown>
      | undefined
    const discoveryToolCall: DiscoveryToolCallProxyMeta | undefined =
      rawDiscoveryToolCall &&
      typeof rawDiscoveryToolCall === 'object' &&
      !Array.isArray(rawDiscoveryToolCall) &&
      rawDiscoveryToolCall.input &&
      typeof rawDiscoveryToolCall.input === 'object' &&
      !Array.isArray(rawDiscoveryToolCall.input)
        ? {
            input: rawDiscoveryToolCall.input as Record<string, unknown>,
            emission_count:
              typeof rawDiscoveryToolCall.emission_count === 'number'
                ? rawDiscoveryToolCall.emission_count
                : 1,
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
      ...(discoveryToolCall ? { discoveryToolCall } : {}),
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

    // ─── Discovery output → brain PUSH + config populate ──────────────────
    // SPEC lazo agentico 2026-06-05 · close the loop · the agent emits a
    // structured Discovery output · the platform PERSISTS it to the brain
    // (competitive_landscape + icp_documents + chunks) and POPULATES
    // clients.config.apify (own_handles + competitor_list) so APIFY_WIRE
    // consumes dynamic targets discovered by the agent · NOT a manual list.
    //
    // Default-OFF via `SALA_DISCOVERY_BRAIN_PUSH_ENABLED` · gate at the
    // source-resolution level so the parse + tool-shape-check are also zero
    // when off. Per-agent restriction (slug heuristic) keeps the side effect
    // bounded to the Auto-Discovery surface · other agents pass through.
    //
    // SPEC follow-up (2026-06-05) · source resolution canonical · PREFER
    // tool_call (zod-validated upstream · MCP server) over text parser
    // (defense-in-depth fallback). The `source` field surfaces WHICH path
    // produced the Discovery · forensics for prose-only regressions.
    let discoveryPersist:
      | {
          source: 'tool_call' | 'text_parser' | 'none'
          parse_kind: 'ok' | 'absent' | 'malformed'
          parse_reason?: string
          tool_emission_count?: number
          competitor_landscape_rows?: number
          icp_document_rows?: number
          brain_chunks_upserted?: number
          config_handles_written?: number
          config_competitors_written?: number
          duration_ms?: number
          errors?: readonly string[]
        }
      | undefined
    // SPEC lazo agentico 2026-06-06 · CC#3↔CC#4 convergence canon ·
    // surface the resolved DiscoveryOutput in the HTTP response body so the
    // worker (n8n APIFY_WIRE node) reads `response.body.discovery_output`
    // for dynamic scrape targets · canonical primary path (path A) ·
    // `clients.config.apify.competitor_list` populate via Track C stays
    // synchronous + serves as durable record (path B · backup + dashboards).
    let discoveryOutputResolved: DiscoveryOutput | undefined
    if (isDiscoveryBrainPushEnabled() && isDiscoveryAgentSlug(agentName) && clientId) {
      try {
        const resolved = resolveDiscoverySource({
          ...(result.discoveryToolCall ? { tool_call: result.discoveryToolCall } : {}),
          agent_response_text: result.response,
          expected_client_id: clientId,
        })
        if (resolved.kind === 'ok') {
          const supabase = getSupabaseAdmin()
          const brainOutcome = await persistDiscoveryToBrain({
            supabase,
            discovery: resolved.value,
          })
          const configOutcome = await populateClientConfigFromDiscovery({
            supabase,
            discovery: resolved.value,
          })
          discoveryPersist = {
            source: resolved.source,
            parse_kind: 'ok',
            ...(resolved.emission_count !== null
              ? { tool_emission_count: resolved.emission_count }
              : {}),
            competitor_landscape_rows: brainOutcome.competitor_landscape_rows,
            icp_document_rows: brainOutcome.icp_document_rows,
            brain_chunks_upserted: brainOutcome.brain_chunks_upserted,
            config_handles_written: configOutcome.handles_written,
            config_competitors_written: configOutcome.competitors_written,
            duration_ms: brainOutcome.duration_ms,
            errors: [...brainOutcome.errors, ...configOutcome.errors],
          }
          // Canon canonical · surface the resolved DiscoveryOutput on the
          // response body for the worker. Only when persist succeeded · the
          // worker's contract is "discovery_output present = brain+config
          // populated · safe to consume". Absence on a discovery-agent run
          // signals the agent didn't emit · worker should branch accordingly.
          discoveryOutputResolved = resolved.value
        } else {
          discoveryPersist = {
            source: resolved.source,
            parse_kind: resolved.kind,
            parse_reason: resolved.reason,
          }
        }
      } catch (e) {
        // §148 honest · never throw past the persist boundary · always
        // return the agent result · the persist outcome is observability only.
        discoveryPersist = {
          source: 'none',
          parse_kind: 'malformed',
          parse_reason: `persist_threw: ${e instanceof Error ? e.message : 'unknown'}`,
        }
      }
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
      // SPEC lazo agentico 2026-06-06 CC#3↔CC#4 convergence · path A canonical
      // (response.body.discovery_output) · the n8n worker reads from here for
      // APIFY_WIRE dynamic targets. Path B (clients.config.apify.competitor_list)
      // is populated synchronously by populateClientConfigFromDiscovery and
      // serves as durable backup record + dashboards source.
      ...(discoveryOutputResolved ? { discovery_output: discoveryOutputResolved } : {}),
      ...(discoveryPersist ? { discovery_persist: discoveryPersist } : {}),
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

    let finalResponse: Record<string, unknown>
    if (skipMiddleware) {
      finalResponse = baseResponse
    } else {
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
        finalResponse = { ...baseResponse, ...middlewareResult }
      } catch (middlewareError) {
        console.error('[Editor Middleware run-sdk] Failed:', middlewareError)
        finalResponse = {
          ...baseResponse,
          editor_review: { verdict: 'middleware_error', severity: 'low' },
        }
      }
    }

    // ─── SPEC async-agent-callback 2026-06-09 · Track N ──────────────────
    // n8n's `Wait` node generates `$execution.resumeUrl` and pauses the
    // worker · the caller (worker's HTTP node) forwards that URL as
    // `callback_url` here · we POST the canonical finalResponse to it
    // AFTER persist hooks complete · n8n resumes the worker with the body.
    //
    // Why · n8n's HTTP client cuts long-running connections at ~155s
    // observed 2026-06-09 (round 4 smoke) · the agent + persist take
    // ~250-300s · canonical fix is fire-and-resume via Wait pattern.
    //
    // Backward-compat · when `callback_url` absent · cero side effect ·
    // direct callers still get the canonical sync response.
    const callbackUrl = resolveCallbackUrl(body)
    let callbackOutcome:
      | {
          fired: boolean
          ok?: boolean
          kind?: string
          status_code?: number
          duration_ms?: number
          detail?: string
        }
      | undefined
    if (callbackUrl) {
      const cb = await dispatchAsyncCallback({
        callback_url: callbackUrl,
        body: finalResponse,
      })
      if (cb.ok) {
        console.info(
          `[run-sdk async-callback] OK ${cb.status_code} · ${cb.duration_ms}ms · agent=${agentName}`,
        )
        callbackOutcome = {
          fired: true,
          ok: true,
          status_code: cb.status_code,
          duration_ms: cb.duration_ms,
        }
      } else {
        console.warn(
          `[run-sdk async-callback] FAIL ${cb.kind} · ${cb.detail} · agent=${agentName}`,
        )
        callbackOutcome = {
          fired: true,
          ok: false,
          kind: cb.kind,
          detail: cb.detail,
          duration_ms: cb.duration_ms,
          ...(cb.kind === 'non_2xx' && cb.status_code !== undefined
            ? { status_code: cb.status_code }
            : {}),
        }
      }
    }

    return NextResponse.json(
      callbackOutcome
        ? { ...finalResponse, async_callback: callbackOutcome }
        : finalResponse,
    )
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
