/**
 * POST /api/journey/resume · Wave 11 T3 · CC#1
 *
 * Resume an existing paused HITL journey. Llamado por:
 *  - HITL inbox (Mission Control) cuando user aprueba/rechaza pending
 *  - Webhooks externos (callback URL en notification)
 *  - Cron jobs en casos especiales
 *
 * Spec: docs/05-orquestacion/persist-resume/README.md
 * Lib:  src/lib/persist-resume.ts (resumeJourney)
 *
 * Auth: x-api-key (INTERNAL_API_KEY)
 *
 * Request body:
 *   { resume_token, decision?, payload? }
 *   - resume_token: string · UUID + HMAC (32hex.32hex)
 *   - decision:     'approve'|'reject'|'webhook_callback'|'cron_timeout'|'manual' (default 'manual')
 *   - payload:      objeto opcional con context adicional (HITL approver notes, etc)
 *
 * Returns:
 *   200 OK   → { journey_id, status: 'active', client_id, journey, resumed_at }
 *   400      → invalid body
 *   401      → unauthorized
 *   404      → token not found (already invalidated or never existed)
 *   410      → TTL expired · journey marked abandoned
 *   422      → token signature invalid (HMAC fail)
 *   500      → DB error
 *   503      → table missing (migration not applied)
 */
import { NextResponse } from 'next/server'
import * as Sentry from '@sentry/nextjs'
import { getSupabaseAdmin } from '@/lib/supabase'
import { checkInternalKey } from '@/lib/internal-auth'
import { capture } from '@/lib/posthog'
import {
  resumeJourney,
  PersistResumeError,
  type ResumeReason,
} from '@/lib/persist-resume'
import type { SupabaseLike } from '@/lib/journey-orchestrator'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

const VALID_REASONS: ResumeReason[] = [
  'hitl_approved',
  'hitl_rejected',
  'webhook_callback',
  'cron_timeout',
  'manual',
]

// Map decision string (UI-friendly) → ResumeReason (canonical)
const DECISION_TO_REASON: Record<string, ResumeReason> = {
  approve: 'hitl_approved',
  reject: 'hitl_rejected',
  hitl_approved: 'hitl_approved',
  hitl_rejected: 'hitl_rejected',
  webhook_callback: 'webhook_callback',
  cron_timeout: 'cron_timeout',
  manual: 'manual',
}

interface RequestBody {
  resume_token?: unknown
  decision?: unknown
  reason?: unknown
  payload?: unknown
}

const TABLE_MISSING_CODES = new Set(['PGRST205', '42P01'])

export async function POST(request: Request) {
  const auth = checkInternalKey(request)
  if (!auth.ok) {
    return NextResponse.json(
      { error: 'unauthorized', detail: auth.reason },
      { status: 401 },
    )
  }

  let body: RequestBody
  try {
    body = (await request.json()) as RequestBody
  } catch {
    return NextResponse.json(
      { error: 'validation_error', detail: 'Invalid JSON body' },
      { status: 400 },
    )
  }

  // Resume token presence
  if (typeof body.resume_token !== 'string' || body.resume_token.length < 10) {
    return NextResponse.json(
      { error: 'validation_error', detail: "Missing or invalid 'resume_token'" },
      { status: 400 },
    )
  }

  // Decision/reason resolution
  const rawDecision = (body.decision ?? body.reason ?? 'manual') as string
  const reason = DECISION_TO_REASON[rawDecision]
  if (!reason || !VALID_REASONS.includes(reason)) {
    return NextResponse.json(
      {
        error: 'validation_error',
        detail: `Invalid 'decision' (or 'reason'). Expected one of: approve, reject, ${VALID_REASONS.join(', ')}`,
      },
      { status: 400 },
    )
  }

  const supabase = getSupabaseAdmin()
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? process.env.ZERO_RISK_API_URL ?? 'https://zero-risk-platform.vercel.app'
  const secret = process.env.RESUME_TOKEN_SECRET ?? process.env.INTERNAL_API_KEY ?? ''

  if (!secret) {
    return NextResponse.json(
      {
        error: 'internal_error',
        detail: 'RESUME_TOKEN_SECRET (or INTERNAL_API_KEY fallback) not configured on server',
      },
      { status: 500 },
    )
  }

  let restoredRow
  try {
    restoredRow = await resumeJourney(
      {
        resume_token: body.resume_token,
        reason,
        payload: body.payload as Record<string, unknown> | undefined,
      },
      {
        supabase: supabase as unknown as SupabaseLike,
        baseUrl,
        secret,
      },
    )
  } catch (e: unknown) {
    if (e instanceof PersistResumeError) {
      // Map error codes a HTTP status
      if (e.code === 'E_PERSIST_003') {
        // Token not found / signature invalid
        const isSig = e.message.includes('signature') || e.message.includes('HMAC')
        return NextResponse.json(
          { error: isSig ? 'invalid_signature' : 'not_found', detail: e.message, error_code: e.code },
          { status: isSig ? 422 : 404 },
        )
      }
      if (e.code === 'E_PERSIST_002') {
        // TTL expired
        return NextResponse.json(
          { error: 'gone', detail: e.message, error_code: e.code },
          { status: 410 },
        )
      }
      // E_PERSIST_001 · DB error
      const supabaseCode = (e.details as { supabase_code?: string } | undefined)?.supabase_code
      if (supabaseCode && TABLE_MISSING_CODES.has(supabaseCode)) {
        return NextResponse.json(
          {
            error: 'service_unavailable',
            detail:
              'client_journey_state table not yet applied. Run migration 202604280001_client_journey_state.sql',
            error_code: e.code,
          },
          { status: 503 },
        )
      }
      Sentry.captureException(e, { tags: { source: 'journey-resume', error_code: e.code } })
      return NextResponse.json(
        { error: 'internal_error', detail: e.message, error_code: e.code },
        { status: 500 },
      )
    }

    Sentry.captureException(e, { tags: { source: 'journey-resume' } })
    return NextResponse.json(
      { error: 'internal_error', detail: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    )
  }

  // resumeJourney() lib retorna el row con status=active in-memory pero no
  // ejecuta el UPDATE (SupabaseLike no expone .update). El route handler hace
  // el UPDATE real con Supabase client server-side.
  const updateResult = await supabase
    .from('client_journey_state')
    .update({
      status: 'active',
      resume_token: null, // invalidate one-shot token
      metadata: {
        ...(restoredRow.metadata ?? {}),
        last_resumed_at: new Date().toISOString(),
        last_resume_reason: reason,
      },
    })
    .eq('id', restoredRow.id)
    .eq('status', 'paused_hitl') // concurrency guard

  if (updateResult.error) {
    Sentry.captureException(
      new Error(`resume UPDATE failed for ${restoredRow.id}: ${updateResult.error.message}`),
      { tags: { source: 'journey-resume' } },
    )
    return NextResponse.json(
      {
        error: 'internal_error',
        detail: `Resume succeeded conceptually but UPDATE failed: ${updateResult.error.message.slice(0, 200)}`,
      },
      { status: 500 },
    )
  }

  // Telemetry · fail-open
  try {
    capture('journey_resumed', String(restoredRow.client_id ?? 'system'), {
      journey_id: restoredRow.id,
      journey: restoredRow.journey,
      reason,
      current_stage: restoredRow.current_stage,
    })
  } catch {
    /* noop */
  }

  return NextResponse.json(
    {
      journey_id: restoredRow.id,
      client_id: restoredRow.client_id,
      journey: restoredRow.journey,
      current_stage: restoredRow.current_stage,
      status: 'active',
      resumed_at: new Date().toISOString(),
      reason,
    },
    { status: 200 },
  )
}

export async function GET() {
  return NextResponse.json({
    endpoint: '/api/journey/resume',
    method: 'POST',
    auth: 'x-api-key (INTERNAL_API_KEY)',
    request_body: {
      resume_token: 'string · UUID + HMAC (32hex.32hex)',
      decision: "'approve'|'reject'|'webhook_callback'|'cron_timeout'|'manual' (default manual)",
      payload: 'optional context object (e.g., HITL approver notes)',
    },
    returns: {
      '200': '{ journey_id, status: "active", reason, resumed_at }',
      '404': 'Token not found (already invalidated)',
      '410': 'Gone · TTL expired (journey now abandoned)',
      '422': 'Invalid token signature (HMAC fail)',
      '503': 'Table missing (migration not applied)',
    },
    spec: 'docs/05-orquestacion/persist-resume/README.md',
  })
}
