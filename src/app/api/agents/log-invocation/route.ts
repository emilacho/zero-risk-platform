/**
 * POST /api/agents/log-invocation · Sprint 9 cleanup NEW-A canonical.
 *
 * Logger-only endpoint canon canonical · accepts a PRE-COMPLETED agent invocation
 * row (real session data from a local Claude Code process · daemon · script ·
 * batch job) and persists it to `agent_invocations` canon canonical.
 *
 * Distinct from /api/agents/run-sdk which SPAWNS new agent invocations via
 * Anthropic API. This endpoint does NOT spawn anything · it logs existing
 * session data canonical · zero LLM cost · preserves real metrics.
 *
 * Primary consumer canon · Mission Control daemon (`mission-control/scripts/
 * daemon/health.ts`) which runs Claude Code sessions locally for health
 * monitoring and previously bypassed canon §149 via direct Supabase INSERT.
 * Post-merge canon · daemon writes via this endpoint · workflow_id mandatory
 * · canon §149 enforcement 100% across the system.
 *
 * Canon §149 enforcement aplica canon · workflow_id + workflow_execution_id
 * mandatory · 403 E-WF-ID-REQUIRED si missing (same pattern que /run-sdk).
 *
 * Body canon canonical ·
 *   workflow_id           string · mandatory · canon §149
 *   workflow_execution_id string · mandatory · canon §149
 *   agent_name            string · e.g. 'health-check-daemon'
 *   agent_id              string · canonical (defaults to agent_name si missing)
 *   session_id            string · real Claude Code session id
 *   model                 string · e.g. 'claude-sonnet-4-6'
 *   cost_usd              number · real cost from completed session
 *   duration_ms           integer · real duration
 *   tokens_input          integer
 *   tokens_output         integer
 *   tokens_cache_read     integer · optional · default 0
 *   tokens_cache_creation integer · optional · default 0
 *   num_turns             integer · optional
 *   status                'completed' | 'failed' | 'timeout' · default 'completed'
 *   exit_code             integer · optional
 *   error_message         string · optional
 *   response_text         string · optional · stored in output_summary (truncated 2000)
 *   started_at            ISO timestamp · optional · derived from ended_at - duration_ms si missing
 *   ended_at              ISO timestamp · optional · defaults to now
 *   client_id             string · optional · null for system-level
 *   journey_id            string · optional
 *   command               string · optional
 *   task_id               string · optional
 *   metadata              object · optional · merged with canonical_pattern marker
 *
 * Auth canon · x-api-key INTERNAL_API_KEY (same pattern que /run-sdk · /brain/ingest-source).
 */
import { NextResponse } from 'next/server'
import { checkInternalKey } from '@/lib/internal-auth'
import { getSupabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

type InvocationStatus = 'completed' | 'failed' | 'timeout' | 'running'

interface LogInvocationBody {
  workflow_id?: string | null
  workflow_execution_id?: string | null
  agent_name?: string | null
  agent_id?: string | null
  session_id?: string | null
  model?: string | null
  cost_usd?: number | null
  duration_ms?: number | null
  tokens_input?: number | null
  tokens_output?: number | null
  tokens_cache_read?: number | null
  tokens_cache_creation?: number | null
  num_turns?: number | null
  status?: InvocationStatus
  exit_code?: number | null
  error_message?: string | null
  response_text?: string | null
  started_at?: string | null
  ended_at?: string | null
  client_id?: string | null
  journey_id?: string | null
  command?: string | null
  task_id?: string | null
  metadata?: Record<string, unknown> | null
}

const VALID_STATUSES: ReadonlySet<InvocationStatus> = new Set([
  'completed',
  'failed',
  'timeout',
  'running',
])

export async function POST(request: Request) {
  // Auth canon · x-api-key
  const auth = checkInternalKey(request)
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: 'unauthorized', code: 'E-AUTH-001', detail: auth.reason },
      { status: 401 },
    )
  }

  // Parse body canon
  let raw: unknown = {}
  try {
    raw = await request.json()
  } catch {
    return NextResponse.json(
      { ok: false, error: 'invalid_json', code: 'E-INPUT-PARSE' },
      { status: 400 },
    )
  }
  const body = (raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}) as LogInvocationBody

  // Canon §149 enforcement · workflow_id mandatory
  const workflowId =
    typeof body.workflow_id === 'string' && body.workflow_id.length > 0
      ? body.workflow_id
      : null
  const workflowExecutionId =
    typeof body.workflow_execution_id === 'string' && body.workflow_execution_id.length > 0
      ? body.workflow_execution_id
      : null

  if (!workflowId || !workflowExecutionId) {
    const missing: string[] = []
    if (!workflowId) missing.push('workflow_id')
    if (!workflowExecutionId) missing.push('workflow_execution_id')
    console.warn(
      `[log-invocation] REJECTED · canon §149 enforcement · missing=${missing.join(',')}`,
    )
    return NextResponse.json(
      {
        ok: false,
        error: 'workflow_id_required',
        code: 'E-WF-ID-REQUIRED',
        detail:
          'canon Sprint 8D (Emilio 2026-05-24) · log-invocation canon §149 enforcement · ' +
          `missing field(s): ${missing.join(', ')} · ` +
          'pass workflow_id + workflow_execution_id top-level · ' +
          'for ad-hoc smoke tests use the canonical "Smoke Test Agent Invocation" n8n workflow',
      },
      { status: 403 },
    )
  }

  // Required fields validation
  const agentName = typeof body.agent_name === 'string' && body.agent_name.length > 0 ? body.agent_name : null
  const sessionId = typeof body.session_id === 'string' && body.session_id.length > 0 ? body.session_id : null

  if (!agentName || !sessionId) {
    const missing: string[] = []
    if (!agentName) missing.push('agent_name')
    if (!sessionId) missing.push('session_id')
    return NextResponse.json(
      {
        ok: false,
        error: 'invalid_payload',
        code: 'E-LOG-INVOCATION-MISSING',
        detail: `missing required field(s): ${missing.join(', ')}`,
      },
      { status: 400 },
    )
  }

  // Status validation canon
  const status: InvocationStatus =
    typeof body.status === 'string' && VALID_STATUSES.has(body.status as InvocationStatus)
      ? (body.status as InvocationStatus)
      : 'completed'

  // Derive started_at + ended_at canon
  const nowIso = new Date().toISOString()
  const endedAt = typeof body.ended_at === 'string' && body.ended_at.length > 0 ? body.ended_at : nowIso
  const durationMs = typeof body.duration_ms === 'number' && body.duration_ms >= 0 ? body.duration_ms : null
  const startedAt =
    typeof body.started_at === 'string' && body.started_at.length > 0
      ? body.started_at
      : durationMs !== null
        ? new Date(new Date(endedAt).getTime() - durationMs).toISOString()
        : endedAt

  // Output summary canon · truncate response_text 2000 chars
  const responseText = typeof body.response_text === 'string' ? body.response_text : ''
  const outputSummary = responseText.length > 2000 ? responseText.slice(0, 2000) + '…' : responseText || null

  // Build canonical row
  const row = {
    session_id: sessionId,
    agent_id: typeof body.agent_id === 'string' && body.agent_id.length > 0 ? body.agent_id : agentName,
    agent_name: agentName,
    command: typeof body.command === 'string' ? body.command : null,
    task_id: typeof body.task_id === 'string' ? body.task_id : null,
    workflow_id: workflowId,
    workflow_execution_id: workflowExecutionId,
    client_id: typeof body.client_id === 'string' && body.client_id.length > 0 ? body.client_id : null,
    journey_id: typeof body.journey_id === 'string' ? body.journey_id : null,
    model: typeof body.model === 'string' ? body.model : null,
    started_at: startedAt,
    ended_at: endedAt,
    duration_ms: durationMs,
    cost_usd: typeof body.cost_usd === 'number' && Number.isFinite(body.cost_usd) ? body.cost_usd : null,
    tokens_input: typeof body.tokens_input === 'number' ? body.tokens_input : null,
    tokens_output: typeof body.tokens_output === 'number' ? body.tokens_output : null,
    tokens_cache_read: typeof body.tokens_cache_read === 'number' ? body.tokens_cache_read : null,
    tokens_cache_creation: typeof body.tokens_cache_creation === 'number' ? body.tokens_cache_creation : null,
    num_turns: typeof body.num_turns === 'number' ? body.num_turns : null,
    status,
    exit_code: typeof body.exit_code === 'number' ? body.exit_code : null,
    error_message: typeof body.error_message === 'string' ? body.error_message : null,
    output_summary: outputSummary,
    metadata: {
      ...(body.metadata && typeof body.metadata === 'object' ? body.metadata : {}),
      canonical_pattern: 'log-invocation-local-session',
      logged_via: 'log-invocation-endpoint',
      logged_at: nowIso,
    },
  }

  // Persist canon
  try {
    const supabase = getSupabaseAdmin()
    const { data, error } = await supabase
      .from('agent_invocations')
      .insert([row])
      .select('id')
      .single()

    if (error) {
      console.error('[log-invocation] supabase insert failed', error)
      return NextResponse.json(
        { ok: false, error: 'persist_failed', code: 'E-PERSIST-FAILED', detail: error.message.slice(0, 400) },
        { status: 500 },
      )
    }

    return NextResponse.json(
      {
        ok: true,
        agent_invocation_id: (data as { id: string }).id,
        persisted_at: nowIso,
        canonical_pattern: 'log-invocation-local-session',
      },
      { status: 200 },
    )
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[log-invocation] unexpected error', msg)
    return NextResponse.json(
      { ok: false, error: 'unexpected_error', code: 'E-UNEXPECTED', detail: msg.slice(0, 400) },
      { status: 500 },
    )
  }
}
