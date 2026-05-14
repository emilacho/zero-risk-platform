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
  const provided = req.header('x-internal-auth')
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

interface RunSdkBody {
  agentName?: unknown
  task?: unknown
  resumeSessionId?: unknown
  clientId?: unknown
  pipelineId?: unknown
  stepName?: unknown
  extra?: unknown
}

function isStringOrNullable(v: unknown): v is string | null | undefined {
  return v === null || v === undefined || typeof v === 'string'
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

  // The Vercel proxy already validated via Zod and sanitized strings, but
  // re-check shape here so a misconfigured caller (e.g. a CLI smoke test)
  // gets a clear error instead of a runtime crash.
  if (typeof body.agentName !== 'string' || body.agentName.length === 0) {
    res.status(400).json({ success: false, error: 'agentName (string) required' })
    return
  }
  if (typeof body.task !== 'string' || body.task.length === 0) {
    res.status(400).json({ success: false, error: 'task (string) required' })
    return
  }
  if (!isStringOrNullable(body.resumeSessionId)) {
    res.status(400).json({ success: false, error: 'resumeSessionId must be string|null|undefined' })
    return
  }
  if (!isStringOrNullable(body.clientId)) {
    res.status(400).json({ success: false, error: 'clientId must be string|null|undefined' })
    return
  }
  if (!isStringOrNullable(body.pipelineId)) {
    res.status(400).json({ success: false, error: 'pipelineId must be string|null|undefined' })
    return
  }
  if (!isStringOrNullable(body.stepName)) {
    res.status(400).json({ success: false, error: 'stepName must be string|null|undefined' })
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

  const input: AgentRunInput = {
    agentName: body.agentName,
    task: body.task,
    resumeSessionId: body.resumeSessionId ?? null,
    clientId: body.clientId ?? null,
    pipelineId: body.pipelineId ?? null,
    stepName: body.stepName ?? null,
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
