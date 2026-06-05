/**
 * POST /api/sala/router/consume · admin endpoint · runs one consumer tick.
 *
 * Cierra el chain de la sala · canon ADR-018 (un dispatcher único) ·
 *   ingress endpoint (PR #176) → sala_event_log
 *     → THIS consumer → workflow-dispatcher Model B (PR #172) → worker
 *
 * §148 honest · default-OFF via `SALA_ROUTER_CONSUMER_ENABLED`. Auth ·
 * `checkInternalKey` (matches the legacy admin pattern). One tick per
 * call · cero cron · cero polling loops · cadence is the caller's
 * decision (admin smoke · future Inngest cron).
 *
 * Body (optional) ·
 *   {
 *     tenant_id?: string,
 *     batch_size?: number (default 10 · cap 100),
 *     scan_window?: number (default 200 · cap 1000)
 *   }
 *
 * Response · 200 always (except 503 flag off · 401 unauth · 400 body) ·
 *   {
 *     ok: true,
 *     tick: ConsumerTickResult { tick_id, scanned, processed, outcomes: [...] }
 *   }
 */
import { NextResponse } from 'next/server'
import { checkInternalKey } from '@/lib/internal-auth'
import { getSupabaseAdmin } from '@/lib/supabase'
import { SupabaseEventLogStorage } from '@/lib/sala-event-log'
import {
  consumeIntakeTick,
  isConsumerEnabled,
  wireCapSpendQuerySupabase,
} from '@/lib/sala-router-consumer'

function fail(status: number, code: string, detail: string): NextResponse {
  return NextResponse.json({ ok: false, code, detail }, { status })
}

export async function POST(request: Request) {
  // ─── 1 · feature flag (default-OFF) ───
  if (!isConsumerEnabled()) {
    return fail(503, 'flag_disabled', 'SALA_ROUTER_CONSUMER_ENABLED!=true · default-OFF')
  }

  // ─── 2 · auth (internal key) ───
  const auth = checkInternalKey(request)
  if (!auth.ok) {
    return fail(401, 'unauthorized', auth.reason)
  }

  // ─── 3 · parse + validate body (all fields optional) ───
  let raw: Record<string, unknown> = {}
  try {
    const text = await request.text()
    raw = text ? (JSON.parse(text) as Record<string, unknown>) : {}
  } catch {
    return fail(400, 'invalid_body', 'body must be valid JSON or empty')
  }

  const tenant_id =
    typeof raw.tenant_id === 'string' && raw.tenant_id.length > 0
      ? raw.tenant_id
      : undefined
  const batch_size =
    typeof raw.batch_size === 'number' && Number.isFinite(raw.batch_size)
      ? raw.batch_size
      : undefined
  const scan_window =
    typeof raw.scan_window === 'number' && Number.isFinite(raw.scan_window)
      ? raw.scan_window
      : undefined

  // ─── 4 · compose storage + cap-wire (SPEC lazo agentico §gap §150) ───
  let storage: SupabaseEventLogStorage
  let cap_spend_query
  try {
    const supabase = getSupabaseAdmin()
    storage = new SupabaseEventLogStorage(supabase)
    // Canon canonical · production wires the Supabase-backed spend query ·
    // dispatch evaluates per-stream cumulative cost vs §150 cap before
    // dispatching to the worker.
    cap_spend_query = wireCapSpendQuerySupabase(supabase)
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e)
    return fail(503, 'supabase_unavailable', detail)
  }

  // ─── 5 · run one tick ───
  try {
    const tick = await consumeIntakeTick({
      storage,
      tenant_id,
      batch_size,
      scan_window,
      cap_spend_query,
    })
    return NextResponse.json({ ok: true, tick }, { status: 200 })
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e)
    return fail(500, 'tick_failed', detail)
  }
}

export async function GET() {
  return NextResponse.json({
    endpoint: '/api/sala/router/consume',
    method: 'POST',
    description:
      'Consumer tick · reads pending intake events from sala_event_log · routes via JOURNEY_WORKFLOW_MAP · invokes workflow-dispatcher Model B · writes marker event · ADR-018 single dispatcher',
    canon:
      'ESCALADA-Opus-arquitectura-entradas-sala-multidepto-2026-06-05.md §BUILD SPEC · "router despacha (NUNCA entrada→dispatch)"',
    chain: 'ingress (#176) → sala_event_log → THIS consumer → workflow-dispatcher Model B (#172) → worker n8n',
    feature_flag: 'SALA_ROUTER_CONSUMER_ENABLED · default-OFF',
    auth: 'x-api-key matched against INTERNAL_API_KEY',
    body_shape: {
      tenant_id: 'string · optional · scope the SELECT',
      batch_size: 'number · optional · default 10 · cap 100',
      scan_window: 'number · optional · default 200 · cap 1000',
    },
    response_kinds: {
      ok: '{ok:true, tick:{tick_id, scanned, processed, outcomes:[{kind, detail, ...}]}}',
      refused: '{ok:false, code, detail} · 503 flag · 401 auth · 400 body · 500 tick',
    },
    outcome_kinds: [
      'dispatched_ok',
      'dispatched_failed',
      'skipped_parse_error',
      'skipped_unknown_journey',
      'skipped_dispatcher_off',
      'skipped_cap_blocked',
      'marker_write_failed',
    ],
  })
}
