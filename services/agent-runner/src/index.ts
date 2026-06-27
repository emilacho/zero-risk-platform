/**
 * Zero Risk · Agent Runner Service · Express entry
 *
 * Lives on Railway. Receives POST /run-sdk requests proxied from Vercel
 * (zero-risk-platform/src/app/api/agents/run-sdk/route.ts) and invokes the
 * Claude Agent SDK, which on Linux x64 has its full native binary chain
 * available (unlike Vercel serverless where NFT prunes the optional dep).
 *
 * Editor middleware (Camino III dual review · whitelist agents) does NOT
 * run here — that stays in the Vercel proxy where the routing/whitelist
 * logic already lives. This service returns the raw AgentRunResult and
 * the proxy layers the editor decision on top.
 */

import express, { type Request, type Response } from 'express'
import { runAgentViaSDK, type AgentRunInput } from './lib/agent-sdk-runner.js'

const PORT = Number(process.env.PORT) || 8080
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY ?? ''

const startedAt = Date.now()

const app = express()

// Express defaults are fine for a single-machine service. Limit body size to
// avoid abuse: the SDK accepts long prompts but 1MB is plenty (the route on
// Vercel sanitizes to 8KB task + 50 char agent name long before we see it).
app.use(express.json({ limit: '1mb' }))

// ── Auth ─────────────────────────────────────────────────────────────────

function isAuthed(req: Request): boolean {
  if (!INTERNAL_API_KEY) {
    // Refuse to run without a configured secret. Logged once per request so
    // the operator sees this in Railway logs and fixes the env var.
    console.error('[agent-runner] INTERNAL_API_KEY not set in service env — denying all requests')
    return false
  }
  // Sprint 8D Fase 1 · accept both x-internal-auth (Vercel proxy header)
  // and x-api-key (n8n direct caller header) so n8n can bypass Vercel for
  // long-running LLM steps that exceed Vercel's 300s function timeout. Both
  // headers carry the same INTERNAL_API_KEY secret · comparison is
  // identical · only the header name differs by caller convention.
  const provided = req.header('x-internal-auth') ?? req.header('x-api-key')
  return typeof provided === 'string' && provided === INTERNAL_API_KEY
}

// ── Routes ───────────────────────────────────────────────────────────────

app.get('/', (_req, res) => {
  res.json({
    service: 'zero-risk-agent-runner',
    version: '0.1.0',
    endpoints: {
      'POST /run-sdk': 'Execute one agent via @anthropic-ai/claude-agent-sdk',
      'GET /health': 'Healthcheck for Railway',
    },
  })
})

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
  })
})

// Sprint 8D Fase 1 · body accepts both camelCase (Vercel proxy convention ·
// pre-canon) and snake_case (n8n direct caller convention · canon post Vercel
// proxy Sprint 8B B4). Each field has both accessor paths · whichever is
// present wins · camelCase preferred when both present (defensive · old
// Vercel proxy callers stay byte-for-byte compatible).
interface RunSdkBody {
  agentName?: unknown
  agent?: unknown
  agent_name?: unknown
  task?: unknown
  resumeSessionId?: unknown
  resume_session_id?: unknown
  clientId?: unknown
  client_id?: unknown
  pipelineId?: unknown
  pipeline_id?: unknown
  stepName?: unknown
  step_name?: unknown
  /**
   * Sprint 8D workflow attribution (§149) · the Vercel proxy forwards the
   * workflow_id / workflow_execution_id it received from n8n. Accepted in
   * both camelCase + snake_case (same alias pattern as the other fields) ·
   * normalized at line ~151 and forwarded into AgentRunInput.
   */
  workflowId?: unknown
  workflow_id?: unknown
  workflowExecutionId?: unknown
  workflow_execution_id?: unknown
  /**
   * Sprint 8D tail canon · workflow checkpoint/resume bypass flag. true →
   * skip cache lookup · re-execute SDK call. Default false → use cached
   * `completed` checkpoint if present.
   */
  forceRestart?: unknown
  force_restart?: unknown
  /**
   * Sprint 9 entry canon · dry-run mode flag. true → skip Anthropic SDK
   * call · return canonical fake response · zero LLM cost · zero MCP
   * invocation · zero Client Brain enrichment. Skips checkpoint save
   * canon-guard (no fake-response cache pollution).
   */
  dryRun?: unknown
  dry_run?: unknown
  context?: unknown
  extra?: unknown
}

function isStringOrNullable(v: unknown): v is string | null | undefined {
  return v === null || v === undefined || typeof v === 'string'
}

/** Pick first string-valued candidate from a list (canon-aware aliasing). */
function pickString(...candidates: unknown[]): string | undefined {
  for (const c of candidates) {
    if (typeof c === 'string' && c.length > 0) return c
  }
  return undefined
}

/** Pick first string|null candidate · undefined if all absent. */
function pickStringOrNull(...candidates: unknown[]): string | null | undefined {
  for (const c of candidates) {
    if (c === null) return null
    if (typeof c === 'string') return c
  }
  return undefined
}

app.post('/run-sdk', async (req: Request, res: Response) => {
  if (!isAuthed(req)) {
    res.status(401).json({ success: false, error: 'unauthorized' })
    return
  }

  const body = req.body as RunSdkBody | undefined
  if (!body || typeof body !== 'object') {
    res.status(400).json({ success: false, error: 'body must be a JSON object' })
    return
  }

  // Sprint 8D Fase 1 · resolve camelCase/snake_case alias pairs into the
  // canonical camelCase shape the SDK runner expects. n8n direct callers
  // typically send snake_case + `agent` (the n8n template form); Vercel
  // proxy historically sent camelCase. Both flow through this normalizer.
  const agentName = pickString(body.agentName, body.agent, body.agent_name)
  const resumeSessionId = pickStringOrNull(body.resumeSessionId, body.resume_session_id)
  const clientId = pickStringOrNull(body.clientId, body.client_id)
  const pipelineId = pickStringOrNull(body.pipelineId, body.pipeline_id)
  const stepName = pickStringOrNull(body.stepName, body.step_name)
  // Sprint 8D workflow attribution · same alias pattern as other fields ·
  // Vercel proxy enforces NON-NULL at the gateway · runner just normalizes
  // and forwards into the AgentRunInput (the observability writer in
  // agent-sdk-runner.ts then includes them on agent_invocations rows).
  const workflowId = pickStringOrNull(body.workflowId, body.workflow_id)
  const workflowExecutionId = pickStringOrNull(
    body.workflowExecutionId,
    body.workflow_execution_id,
  )

  // The Vercel proxy already validated via Zod and sanitized strings, but
  // re-check shape here so a misconfigured caller (e.g. a CLI smoke test)
  // gets a clear error instead of a runtime crash.
  if (typeof agentName !== 'string' || agentName.length === 0) {
    res.status(400).json({ success: false, error: 'agentName (or agent | agent_name · string) required' })
    return
  }
  if (typeof body.task !== 'string' || body.task.length === 0) {
    res.status(400).json({ success: false, error: 'task (string) required' })
    return
  }
  if (!isStringOrNullable(resumeSessionId)) {
    res.status(400).json({ success: false, error: 'resumeSessionId / resume_session_id must be string|null|undefined' })
    return
  }
  if (!isStringOrNullable(clientId)) {
    res.status(400).json({ success: false, error: 'clientId / client_id must be string|null|undefined' })
    return
  }
  if (!isStringOrNullable(pipelineId)) {
    res.status(400).json({ success: false, error: 'pipelineId / pipeline_id must be string|null|undefined' })
    return
  }
  if (!isStringOrNullable(stepName)) {
    res.status(400).json({ success: false, error: 'stepName / step_name must be string|null|undefined' })
    return
  }
  // Sprint 8D · workflow_id enforcement at Railway too (Emilio canon
  // 2026-05-24 · "agentes solo se invocan vía workflows"). Closes the
  // direct-bypass loophole · post Sprint 8D Fase 1 some n8n workflows hit
  // Railway directly to escape Vercel 300s function timeout · without this
  // server-side gate they could submit without workflow attribution. n8n
  // workflows auto-populate via `$workflow.id` + `$execution.id`. Reject
  // 403 mirrors the Vercel proxy enforcement so any caller (Vercel or
  // direct) faces the same canon.
  if (typeof workflowId !== 'string' || workflowId.length === 0) {
    res.status(403).json({
      success: false,
      error: 'workflow_id_required',
      code: 'E-WF-ID-REQUIRED',
      detail: 'canon Sprint 8D · workflowId / workflow_id required (n8n $workflow.id) · agents only via workflows',
    })
    return
  }
  if (typeof workflowExecutionId !== 'string' || workflowExecutionId.length === 0) {
    res.status(403).json({
      success: false,
      error: 'workflow_execution_id_required',
      code: 'E-WF-EXEC-ID-REQUIRED',
      detail: 'canon Sprint 8D · workflowExecutionId / workflow_execution_id required (n8n $execution.id)',
    })
    return
  }
  if (
    body.extra !== undefined &&
    body.extra !== null &&
    (typeof body.extra !== 'object' || Array.isArray(body.extra))
  ) {
    res.status(400).json({ success: false, error: 'extra must be object|null|undefined' })
    return
  }

  // Sprint 8D tail · workflow checkpoint canon · forceRestart flag accepted
  // top-level OR nested under context (matches workflow_id pattern).
  const ctxObj =
    body.context && typeof body.context === 'object' && !Array.isArray(body.context)
      ? (body.context as Record<string, unknown>)
      : {}
  const forceRestart =
    body.forceRestart === true ||
    body.force_restart === true ||
    ctxObj.forceRestart === true ||
    ctxObj.force_restart === true

  // Sprint 9 entry canon · dry-run flag · accepts top-level (camelCase OR
  // snake_case) OR nested under context. Plus env var DRY_RUN_DEFAULT as
  // global panic button (mirror dry-run-mode.ts resolveDryRun).
  const dryRun =
    body.dryRun === true ||
    body.dry_run === true ||
    ctxObj.dryRun === true ||
    ctxObj.dry_run === true ||
    (typeof process.env.DRY_RUN_DEFAULT === 'string' &&
      process.env.DRY_RUN_DEFAULT.toLowerCase() === 'true')

  const input: AgentRunInput = {
    agentName: agentName,
    task: body.task,
    resumeSessionId: resumeSessionId ?? null,
    clientId: clientId ?? null,
    pipelineId: pipelineId ?? null,
    stepName: stepName ?? null,
    workflowId: workflowId ?? null,
    workflowExecutionId: workflowExecutionId ?? null,
    forceRestart,
    dryRun,
    extra: (body.extra as Record<string, unknown> | undefined) ?? undefined,
  }

  try {
    const result = await runAgentViaSDK(input)
    // The SDK runner already builds a typed AgentRunResult with success+error.
    // 500 only when success is false AND no usable response was produced —
    // matches the Vercel route.ts contract from before the migration.
    if (!result.success) {
      res.status(500).json(result)
      return
    }
    res.status(200).json(result)
  } catch (err) {
    console.error('[agent-runner] unexpected error in /run-sdk:', err)
    res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    })
  }
})

// ── Boot ─────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`[agent-runner] listening on port ${PORT}`)
  if (!INTERNAL_API_KEY) {
    console.warn(
      '[agent-runner] WARNING: INTERNAL_API_KEY is not set. All /run-sdk requests will be rejected.',
    )
  }
})

// Defensive: log unhandled rejections so they appear in Railway logs instead
// of crashing the container silently.
process.on('unhandledRejection', (reason) => {
  console.error('[agent-runner] unhandled rejection:', reason)
})
process.on('uncaughtException', (err) => {
  console.error('[agent-runner] uncaught exception:', err)
})
