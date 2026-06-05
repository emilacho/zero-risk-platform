/**
 * POST /api/sala/callback · n8n worker run_completed terminal receiver.
 *
 * Costura A closure 2026-06-05 · matches MODELB-ADAPTER contract §3.1.b.
 *
 * Body shape (CC#4 contract §2.3) ·
 *   {
 *     event_type: "run_completed",
 *     _sala_correlation_id, _journey_id,
 *     worker_id, worker_name?,
 *     tenant_id, client_id,
 *     summary?: {...},
 *     ts
 *   }
 *
 * Same canon as `/api/sala/ingress` · ALWAYS 200 · default-OFF · auth
 * via `SALA_CALLBACK_API_KEY` (fallback INTERNAL_API_KEY).
 *
 * Side effects ·
 *   1. Append `step_completed` event to sala_event_log with
 *      step_id='journey_completed' · stream_id = `_journey_id`
 *   2. payload carries the worker's terminal summary for forensics
 *
 * Dedup · operation_type = `sala-callback.run_completed` ·
 * combined with client_id + logical_period + correlation_id hash ·
 * 1 run completed = 1 callback ever (UNIQUE constraint catches replay).
 */
import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import {
  SupabaseEventLogStorage,
  buildIdempotencyKey,
  type EventAppendInput,
} from '@/lib/sala-event-log'
import {
  buildCallbackIdempotencyOperationType,
  checkSalaWebhookAuth,
  isWorkflowDispatchEnabled,
  parseCallbackBody,
} from '@/lib/sala-journey-dispatch'

function ok200<T extends Record<string, unknown>>(body: T): NextResponse {
  return NextResponse.json({ ok: true, ...body }, { status: 200 })
}
function fail200(code: string, detail?: string): NextResponse {
  return NextResponse.json(
    { ok: false, code, ...(detail ? { detail } : {}) },
    { status: 200 },
  )
}

export async function POST(request: Request) {
  if (!isWorkflowDispatchEnabled()) {
    return fail200('sala_workflow_dispatch_disabled')
  }

  const auth = checkSalaWebhookAuth({
    request,
    dedicated_env_var: 'SALA_CALLBACK_API_KEY',
  })
  if (!auth.ok) {
    return fail200('unauthorized', auth.reason)
  }

  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return fail200('invalid_json', 'body must be valid JSON')
  }
  const parsed = parseCallbackBody(raw)
  if (!parsed.ok) {
    return fail200(parsed.code, parsed.detail)
  }
  const body = parsed.value

  const supabase = getSupabaseAdmin()
  const storage = new SupabaseEventLogStorage(supabase)
  const stream_id = body._journey_id
  const tenant_id = body.tenant_id

  const operation_type = buildCallbackIdempotencyOperationType()
  const logical_period = body.ts.slice(0, 10)
  const idempotency_key = buildIdempotencyKey({
    operation_type,
    client_id: body.client_id,
    logical_period,
    input_hash: body._sala_correlation_id,
  })
  const eventInput: EventAppendInput = {
    tenant_id,
    client_id: body.client_id,
    stream_id,
    correlation_id: body._sala_correlation_id,
    causation_id: null,
    event_type: 'step_completed',
    journey_type: 'ONBOARD',
    operation_type,
    idempotency_key,
    logical_period,
    step_id: 'journey_completed',
    step_state: 'done',
    payload: {
      source: 'n8n-callback',
      worker_id: body.worker_id,
      worker_name: body.worker_name ?? null,
      summary: body.summary ?? null,
      terminal: true,
      ts: body.ts,
    },
    gate_type: null,
  }

  let appended_event_id: string
  try {
    const result = await storage.insert(eventInput)
    appended_event_id = result.event.event_id
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e)
    return fail200('append_failed', detail)
  }

  return ok200({
    event_id: appended_event_id,
    via: auth.via,
  })
}

export async function GET() {
  return NextResponse.json({
    endpoint: '/api/sala/callback',
    method: 'POST',
    description:
      'CC#4 worker run_completed terminal callback receiver · Model B',
    contract: 'MODELB-ADAPTER-LyVoKcrypS5uLyuu-contract-2026-06-05.md §3.1.b',
    feature_flag: 'SALA_WORKFLOW_DISPATCH_ENABLED · default-OFF',
    auth: 'x-api-key validated against SALA_CALLBACK_API_KEY · fallback INTERNAL_API_KEY',
    response: 'ALWAYS 200 · { ok, event_id?, code? }',
    body_shape: {
      event_type: '"run_completed"',
      _sala_correlation_id: 'string',
      _journey_id: 'string (becomes sala stream_id)',
      worker_id: 'string',
      worker_name: 'string (optional)',
      tenant_id: 'uuid',
      client_id: 'string',
      summary: 'object (optional · terminal worker output)',
      ts: 'ISO 8601',
    },
    dedup_key: '_sala_correlation_id',
  })
}
