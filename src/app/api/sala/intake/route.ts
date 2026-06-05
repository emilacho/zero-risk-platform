/**
 * POST /api/sala/intake · sala-ingress canon endpoint · Opus VEREDICTO 2026-06-05.
 *
 * The MECHANISM door · receives typed envelope from a department source
 * (Ventas deal-won · Marketing campaign · Emilio manual · RRHH · etc) ·
 * authenticates per-source-tier · emits ONE `step_completed` event to
 * `sala_event_log`. The router (separately) consumes events and
 * dispatches workers via the Model B adapter (PR #172). This endpoint
 * NEVER calls the dispatcher (Opus VEREDICTO · canon ADR-018 single
 * dispatcher).
 *
 * §148 honest · default-OFF via `SALA_INTAKE_ENABLED`. Path choice ·
 * `/api/sala/intake` rather than `/api/sala/ingress` because the latter
 * is already taken by CC#4's Model B worker phase_boundary callbacks
 * (MODELB-ADAPTER contract V3 §3.1). The Opus spec's `/api/sala/ingress`
 * literal is honored in spirit · the SUBSTANCE (envelope + 2 tables +
 * 3 tiers + idempotency + §149 stream_id) matches verbatim.
 *
 * Body shape · `IngressEnvelope` ·
 *   {
 *     source: 'ventas/deal-won' | 'emilio-manual' | ...,
 *     intent: 'onboard' | 'campaign' | ...,
 *     payload: { ...opaque... },
 *     idempotency_key: string,
 *     logical_period: string,
 *     tenant_id: string,
 *     client_id: string,
 *     correlation_id?: string,
 *     stream_id?: string
 *   }
 *
 * Auth headers (per source tier · canonical) ·
 *   - tier A (internal_key) · `x-api-key: $INTERNAL_API_KEY`
 *   - tier B (hmac)         · `x-source-signature: sha256=<hex>` +
 *                             `x-source-timestamp: <unix-seconds>`
 *   - tier C (public_gate)  · NOT IMPLEMENTED in this PR (refused with
 *                             code tier_c_filter_not_implemented)
 *
 * Response (ALWAYS 200 except 503 flag off) ·
 *   - `{ok: true, kind: "accepted", event_id, stream_id, journey_type, worker_workflow_id, inserted: true}`
 *   - `{ok: true, kind: "duplicate", event_id, stream_id, journey_type, worker_workflow_id}`
 *   - `{ok: false, code, detail}` on refuse · 200 status (canon §150 G4
 *     observability · cero retry pressure from external sources)
 */
import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import {
  SupabaseEventLogStorage,
  type EventLogStorage,
} from '@/lib/sala-event-log'
import {
  isIntakeEnabled,
  orchestrateIngress,
  parseIngressEnvelope,
  SupabaseIngressTables,
  type IngressAuthRequest,
} from '@/lib/sala-ingress'

function ok<T extends Record<string, unknown>>(body: T): NextResponse {
  return NextResponse.json({ ok: true, ...body }, { status: 200 })
}
function fail(code: string, detail: string): NextResponse {
  return NextResponse.json({ ok: false, code, detail }, { status: 200 })
}

export async function POST(request: Request) {
  // ─── 1 · feature flag (default-OFF) ───
  if (!isIntakeEnabled()) {
    return NextResponse.json(
      { ok: false, code: 'flag_disabled', detail: 'SALA_INTAKE_ENABLED!=true · default-OFF' },
      { status: 503 },
    )
  }

  // ─── 2 · read raw body (needed for HMAC tier B) ───
  let raw_body: string
  try {
    raw_body = await request.text()
  } catch {
    return fail('invalid_envelope', 'failed to read request body')
  }
  let raw: unknown
  try {
    raw = raw_body ? JSON.parse(raw_body) : {}
  } catch {
    return fail('invalid_envelope', 'body must be valid JSON')
  }

  // ─── 3 · validate envelope shape ───
  const parsed = parseIngressEnvelope(raw)
  if (!parsed.ok) {
    return fail(parsed.code, parsed.detail)
  }
  const envelope = parsed.value

  // ─── 4 · extract auth from headers ───
  const auth_request: IngressAuthRequest = {
    source: envelope.source,
    internal_key: request.headers.get('x-api-key') ?? undefined,
    signature: request.headers.get('x-source-signature') ?? undefined,
    timestamp: request.headers.get('x-source-timestamp') ?? undefined,
    raw_body,
  }

  // ─── 5 · compose storage + tables adapter ───
  let storage: EventLogStorage
  let tables: SupabaseIngressTables
  try {
    const supabase = getSupabaseAdmin()
    storage = new SupabaseEventLogStorage(supabase)
    tables = new SupabaseIngressTables(supabase)
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e)
    return fail('append_failed', `supabase admin unavailable · ${detail}`)
  }

  // ─── 6 · orchestrate (validate → auth → scope → rule → mint → append) ───
  const result = await orchestrateIngress({
    envelope,
    auth_request,
    tables,
    storage,
  })

  if (result.kind === 'refused') {
    return fail(result.code, result.detail)
  }
  if (result.kind === 'duplicate') {
    return ok({
      kind: 'duplicate',
      event_id: result.event_id,
      stream_id: result.stream_id,
      journey_type: result.journey_type,
      worker_workflow_id: result.worker_workflow_id,
    })
  }
  return ok({
    kind: 'accepted',
    event_id: result.event_id,
    stream_id: result.stream_id,
    journey_type: result.journey_type,
    worker_workflow_id: result.worker_workflow_id,
    inserted: result.inserted,
  })
}

export async function GET() {
  return NextResponse.json({
    endpoint: '/api/sala/intake',
    method: 'POST',
    description:
      'Sala generic ingress · MECHANISM door for department source events · emits event to sala_event_log · NEVER dispatches (router does that)',
    canon:
      'Opus VEREDICTO 2026-06-05 · ESCALADA-Opus-arquitectura-entradas-sala-multidepto-2026-06-05.md',
    feature_flag: 'SALA_INTAKE_ENABLED · default-OFF',
    body_shape: {
      source: 'string · matches ingress_sources.source · e.g. "ventas/deal-won"',
      intent: 'string · must be in source.intents_allowed',
      payload: 'object · opaque · routing/auth NEVER reads from it',
      idempotency_key: 'string · combines with source+intent+period for log dedup',
      logical_period: 'string · "2026-W23" | "manual" | ISO date',
      tenant_id: 'string',
      client_id: 'string',
      correlation_id: 'string · optional · ingress mints if absent',
      stream_id: 'string · optional · ingress mints deterministically if absent',
    },
    auth_per_tier: {
      A_internal_key: 'header x-api-key matches INTERNAL_API_KEY',
      B_hmac: 'header x-source-signature=sha256=<hex over `timestamp.raw_body`> + x-source-timestamp=<unix-seconds>',
      C_public_gate: 'NOT IMPLEMENTED in this PR · canon §144 pending ADR-012 wire',
    },
    response_kinds: {
      accepted: '{ok:true, kind:"accepted", event_id, stream_id, journey_type, worker_workflow_id, inserted:true}',
      duplicate: '{ok:true, kind:"duplicate", ...}',
      refused: '{ok:false, code, detail} · status 200 (canon G4 cero retry pressure)',
    },
  })
}
