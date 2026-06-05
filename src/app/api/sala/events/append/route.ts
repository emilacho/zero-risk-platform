/**
 * POST /api/sala/events/append · worker callback receiver · Model B.
 *
 * Sprint 12 Fase 0 prep finale · Model B (conexión 2026-06-05).
 *
 * The n8n worker (existing workflow) POSTs phase-boundary events here
 * when it reaches a checkpoint (deal_won_received, notion_workspace_created,
 * journey_completed, etc). The endpoint ·
 *   1. Validates auth (dual · x-api-key OR admin session) + body
 *   2. Reconciles emitted phase vs libreto-expected next phase
 *   3. Appends the event to `sala_event_log`
 *   4. Posts a VISIBLE alert to #equipo IFF reconciliation is a mismatch
 *      (kind != 'match') · NEVER halts the worker
 *
 * §148 honest · default-OFF via `SALA_WORKFLOW_DISPATCH_ENABLED` ·
 * matches the dispatcher's flag · with that flag off the endpoint
 * returns 503 (canon · "no Model B observe surface in flight").
 *
 * Body shape (sala-native) ·
 *   {
 *     tenant_id, client_id, stream_id, journey_type,
 *     phase_step_id,       // one of JOURNEY_WORKFLOW_MAP[journey_type].phase_boundaries
 *     correlation_id?,
 *     causation_id?,
 *     payload?: {...}
 *   }
 */
import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { checkInternalOrAdmin } from '@/lib/internal-auth'
import {
  SupabaseEventLogStorage,
  buildIdempotencyKey,
  type EventAppendInput,
} from '@/lib/sala-event-log'
import { readJourneyState } from '@/lib/sala-journey-state'
import type { JourneyType } from '@/lib/sala/libretos'
import {
  getJourneyWorkflowTarget,
  isWorkflowDispatchEnabled,
  reconcileObserved,
  postReconciliationAlert,
} from '@/lib/sala-journey-dispatch'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const KNOWN_JOURNEYS: ReadonlyArray<JourneyType> = [
  'ONBOARD',
  'PRODUCE',
  'ALWAYS_ON',
  'REVIEW',
  'ACQUIRE',
  'GROWTH',
]

export async function POST(request: Request) {
  // ─── 1 · feature flag (default-OFF) ───
  if (!isWorkflowDispatchEnabled()) {
    return NextResponse.json(
      {
        error: 'sala_workflow_dispatch_disabled',
        detail:
          'SALA_WORKFLOW_DISPATCH_ENABLED must be "true" · default-OFF canon §144 escalón 6',
      },
      { status: 503 },
    )
  }

  // ─── 2 · auth ───
  const auth = await checkInternalOrAdmin(request)
  if (!auth.ok) {
    return NextResponse.json(
      { error: 'unauthorized', detail: auth.reason },
      { status: 401 },
    )
  }

  // ─── 3 · parse + validate body ───
  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return NextResponse.json(
      { error: 'invalid_json', detail: 'body must be valid JSON' },
      { status: 400 },
    )
  }
  if (!raw || typeof raw !== 'object') {
    return NextResponse.json(
      { error: 'invalid_body', detail: 'body must be a JSON object' },
      { status: 400 },
    )
  }
  const body = raw as Record<string, unknown>

  const tenant_id = typeof body.tenant_id === 'string' ? body.tenant_id : ''
  const client_id = typeof body.client_id === 'string' ? body.client_id : ''
  const stream_id = typeof body.stream_id === 'string' ? body.stream_id : ''
  const journey_type_raw = typeof body.journey_type === 'string' ? body.journey_type : ''
  const phase_step_id = typeof body.phase_step_id === 'string' ? body.phase_step_id : ''
  const correlation_id =
    typeof body.correlation_id === 'string' && body.correlation_id.length > 0
      ? body.correlation_id
      : stream_id
  const causation_id =
    typeof body.causation_id === 'string' ? body.causation_id : null

  if (!UUID_RE.test(tenant_id)) {
    return NextResponse.json(
      { error: 'invalid_body', detail: 'tenant_id must be UUID' },
      { status: 400 },
    )
  }
  if (!stream_id || stream_id.length === 0) {
    return NextResponse.json(
      { error: 'invalid_body', detail: 'stream_id required' },
      { status: 400 },
    )
  }
  if (!KNOWN_JOURNEYS.includes(journey_type_raw as JourneyType)) {
    return NextResponse.json(
      { error: 'invalid_body', detail: `journey_type must be one of ${KNOWN_JOURNEYS.join('|')}` },
      { status: 400 },
    )
  }
  if (!phase_step_id || phase_step_id.length === 0) {
    return NextResponse.json(
      { error: 'invalid_body', detail: 'phase_step_id required' },
      { status: 400 },
    )
  }
  const journey_type = journey_type_raw as JourneyType
  const target = getJourneyWorkflowTarget(journey_type)
  if (!target) {
    return NextResponse.json(
      {
        error: 'journey_not_mapped',
        detail: `JOURNEY_WORKFLOW_MAP has no entry for ${journey_type} · Model B opt-in pending`,
      },
      { status: 409 },
    )
  }

  // ─── 4 · reconcile vs libreto-expected ───
  const supabase = getSupabaseAdmin()
  const storage = new SupabaseEventLogStorage(supabase)
  const journey_state = await readJourneyState(storage, {
    tenant_id,
    stream_id,
  })
  const last_phase_step_id = journey_state.current_step ?? null

  const reconciled = reconcileObserved({
    emitted_phase_step_id: phase_step_id,
    last_phase_step_id,
    phase_boundaries: target.phase_boundaries,
  })

  // ─── 5 · append event to log ───
  const operation_type = `sala-observe.${journey_type}.${phase_step_id}`
  const logical_period = new Date().toISOString().slice(0, 10)
  const idempotency_key = buildIdempotencyKey({
    operation_type,
    client_id,
    logical_period,
    input_hash: stream_id,
  })
  const eventInput: EventAppendInput = {
    tenant_id,
    client_id,
    stream_id,
    correlation_id,
    causation_id: causation_id ?? null,
    event_type: 'step_completed',
    journey_type,
    operation_type,
    idempotency_key,
    logical_period,
    step_id: phase_step_id,
    step_state: 'done',
    payload: {
      source: 'worker-phase-boundary',
      observed_at: new Date().toISOString(),
      reconcile_kind: reconciled.kind,
      reconcile_delta: reconciled.delta,
      reconcile_expected_next: reconciled.expected_next,
      reconcile_summary: reconciled.summary,
      ...(typeof body.payload === 'object' && body.payload !== null
        ? (body.payload as Record<string, unknown>)
        : {}),
    },
    gate_type: null,
  }

  let appended_event_id: string
  try {
    const result = await storage.insert(eventInput)
    appended_event_id = result.event.event_id
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e)
    return NextResponse.json(
      { error: 'append_failed', detail },
      { status: 500 },
    )
  }

  // ─── 6 · post visible alert IFF mismatch (fail-open · NEVER halt) ───
  await postReconciliationAlert({
    result: reconciled,
    journey_type,
    stream_id,
    emitted_phase_step_id: phase_step_id,
    last_phase_step_id,
  })

  return NextResponse.json({
    ok: true,
    via: auth.via,
    appended_event_id,
    reconcile: {
      kind: reconciled.kind,
      delta: reconciled.delta,
      expected_next: reconciled.expected_next,
      summary: reconciled.summary,
    },
  })
}

export async function GET() {
  return NextResponse.json({
    endpoint: '/api/sala/events/append',
    method: 'POST',
    description:
      'Worker callback receiver · Model B OBSERVE mode · reconciles phase boundary vs libreto + appends to sala_event_log',
    feature_flag: 'SALA_WORKFLOW_DISPATCH_ENABLED · default-OFF',
    auth: 'x-api-key (INTERNAL_API_KEY) OR admin session cookie',
    body_shape: {
      tenant_id: 'uuid',
      client_id: 'string',
      stream_id: 'string',
      journey_type: KNOWN_JOURNEYS.join('|'),
      phase_step_id: 'one of JOURNEY_WORKFLOW_MAP[journey_type].phase_boundaries',
      correlation_id: 'string (optional · default stream_id)',
      causation_id: 'string (optional)',
      payload: 'object (optional · custom data)',
    },
    behavior: {
      match: 'append + log info',
      mismatch: 'append + Slack #equipo alert (NEVER halt worker)',
    },
    canon:
      'Model B conexión 2026-06-05 · SPEC-Phase-1-prep-Flip-6-CONEXION-vs-replace-2026-06-05.md',
  })
}
