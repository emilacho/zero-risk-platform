/**
 * POST /api/sala/ingress · n8n worker phase_boundary callback receiver.
 *
 * Costura A closure 2026-06-05 · matches MODELB-ADAPTER contract §3.1.a.
 *
 * Body shape (CC#4 contract §2.2) ·
 *   {
 *     event_type: "phase_boundary",
 *     _sala_correlation_id, _journey_id,
 *     phase_name: "INTAKE"|"DISCOVERY"|"WORKSPACE"|"SCHEDULING"
 *                |"NOTIFICATION"|"CASCADE"|"APIFY_WIRE",
 *     phase_state: "started" | "completed",
 *     worker_id, tenant_id, client_id, ts
 *   }
 *
 * §148 honest · this endpoint ALWAYS returns 200 (per contract §3.1.a) ·
 * `{ok: true, event_id}` on success, `{ok: false, code, detail}` on
 * any failure. The worker's `neverError: true` flag won't break the
 * worker on non-2xx, but contract canon says 200 only.
 *
 * Default-OFF via `SALA_WORKFLOW_DISPATCH_ENABLED` · matches the
 * dispatcher's flag. With that flag off, the endpoint returns
 * `{ok: false, code: 'sala_workflow_dispatch_disabled'}` with 200.
 *
 * Side effects ·
 *   1. Append to `sala_event_log` (step_started OR step_completed
 *      based on `phase_state`) · stream_id = `_journey_id`
 *   2. Reconcile vs libreto's expected next phase · mismatch logs +
 *      Slack #equipo alert · NEVER halt the worker
 *
 * Dedup · operation_type = `sala-ingress.{phase_name}.{phase_state}` ·
 * combined with client_id + logical_period via `buildIdempotencyKey`
 * yields a unique key per (correlation_id-stream, phase_name, phase_state)
 * tuple · UNIQUE constraint on `sala_event_log` catches replays.
 */
import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import {
  SupabaseEventLogStorage,
  buildIdempotencyKey,
  type EventAppendInput,
  type EventType,
} from '@/lib/sala-event-log'
import { readJourneyState } from '@/lib/sala-journey-state'
import {
  buildIngressIdempotencyOperationType,
  checkSalaWebhookAuth,
  isCanonicalPhase,
  isWorkflowDispatchEnabled,
  parseIngressBody,
  postReconciliationAlert,
  reconcileObserved,
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
  // ─── 1 · feature flag (default-OFF) · respond 200 with code ───
  if (!isWorkflowDispatchEnabled()) {
    return fail200('sala_workflow_dispatch_disabled')
  }

  // ─── 2 · auth (dedicated key · fallback INTERNAL_API_KEY) ───
  const auth = checkSalaWebhookAuth({
    request,
    dedicated_env_var: 'SALA_INGRESS_API_KEY',
  })
  if (!auth.ok) {
    return fail200('unauthorized', auth.reason)
  }

  // ─── 3 · parse + validate body ───
  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return fail200('invalid_json', 'body must be valid JSON')
  }
  const parsed = parseIngressBody(raw)
  if (!parsed.ok) {
    return fail200(parsed.code, parsed.detail)
  }
  const body = parsed.value

  // ─── 4 · validate phase_name vs canonical taxonomy ───
  if (!isCanonicalPhase(body.phase_name)) {
    // We STILL accept it (per OBSERVE canon · NEVER halt worker) but
    // flag it as unknown_phase via reconciliation. The append happens
    // below · the alert fires inside `postReconciliationAlert`.
  }

  // ─── 5 · reconcile vs libreto-expected ───
  const supabase = getSupabaseAdmin()
  const storage = new SupabaseEventLogStorage(supabase)
  const stream_id = body._journey_id
  const tenant_id = body.tenant_id

  const journey_state = await readJourneyState(storage, {
    tenant_id,
    stream_id,
  })
  const last_phase_step_id = journey_state.current_step ?? null

  // Canon canonical phases for ONBOARD (Phase 1 only mapping)
  const phase_boundaries: ReadonlyArray<string> = [
    'INTAKE',
    'DISCOVERY',
    'WORKSPACE',
    'SCHEDULING',
    'NOTIFICATION',
    'CASCADE',
    'APIFY_WIRE',
  ]
  // R1 · order_tolerant=true: worker LyVoKcrypS5uLyuu has a parallel DAG —
  // phases arrive non-deterministically. Any known phase = match.
  const reconciled = reconcileObserved({
    emitted_phase_step_id: body.phase_name,
    last_phase_step_id,
    phase_boundaries,
    order_tolerant: true,
  })

  // ─── 6 · append event ───
  const event_type: EventType =
    body.phase_state === 'completed' ? 'step_completed' : 'step_started'
  const operation_type = buildIngressIdempotencyOperationType({
    phase_name: body.phase_name,
    phase_state: body.phase_state,
  })
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
    event_type,
    journey_type: 'ONBOARD',
    operation_type,
    idempotency_key,
    logical_period,
    step_id: body.phase_name,
    step_state: body.phase_state === 'completed' ? 'done' : 'running',
    payload: {
      source: 'n8n-ingress',
      worker_id: body.worker_id,
      phase_state: body.phase_state,
      ts: body.ts,
      reconcile_kind: reconciled.kind,
      reconcile_delta: reconciled.delta,
      reconcile_expected_next: reconciled.expected_next,
      reconcile_summary: reconciled.summary,
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

  // ─── 7 · Slack alert IFF mismatch · fail-open · NEVER halts ───
  await postReconciliationAlert({
    result: reconciled,
    journey_type: 'ONBOARD',
    stream_id,
    emitted_phase_step_id: body.phase_name,
    last_phase_step_id,
  })

  return ok200({
    event_id: appended_event_id,
    via: auth.via,
    reconcile: {
      kind: reconciled.kind,
      delta: reconciled.delta,
      expected_next: reconciled.expected_next,
    },
  })
}

export async function GET() {
  return NextResponse.json({
    endpoint: '/api/sala/ingress',
    method: 'POST',
    description:
      'CC#4 worker phase_boundary callback receiver · Model B OBSERVE mode',
    contract: 'MODELB-ADAPTER-LyVoKcrypS5uLyuu-contract-2026-06-05.md §3.1.a',
    feature_flag: 'SALA_WORKFLOW_DISPATCH_ENABLED · default-OFF',
    auth: 'x-api-key validated against SALA_INGRESS_API_KEY · fallback INTERNAL_API_KEY',
    response: 'ALWAYS 200 · { ok, event_id?, code? }',
    body_shape: {
      event_type: '"phase_boundary"',
      _sala_correlation_id: 'string',
      _journey_id: 'string (becomes sala stream_id)',
      phase_name:
        '"INTAKE"|"DISCOVERY"|"WORKSPACE"|"SCHEDULING"|"NOTIFICATION"|"CASCADE"|"APIFY_WIRE"',
      phase_state: '"started" | "completed"',
      worker_id: 'string',
      tenant_id: 'uuid',
      client_id: 'string',
      ts: 'ISO 8601',
    },
    dedup_key: '(correlation_id, phase_name, phase_state)',
  })
}
