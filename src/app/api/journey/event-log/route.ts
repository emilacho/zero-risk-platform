/**
 * POST /api/journey/event-log · Sprint 1 · Journey D ALWAYS_ON registry
 *
 * Lightweight event log endpoint · invoked by L1 dispatcher when a
 * journey of type ALWAYS_ON fires. Persists a minimal event row in
 * `client_journey_state` metadata (no separate `journey_events` table
 * created here · sprint posterior may extract).
 *
 * Behavior · idempotent · upserts a `metadata.always_on_events[]` array
 * on the active ALWAYS_ON journey row for the client, capped at 200
 * events (oldest evicted FIFO).
 */
import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 15

const MAX_EVENTS = 200

function checkInternalKey(req: Request): { ok: boolean; reason?: string } {
  const headerKey = req.headers.get('x-api-key') || ''
  const expected = process.env.INTERNAL_API_KEY || ''
  if (!expected) return { ok: false, reason: 'INTERNAL_API_KEY env not set' }
  if (!headerKey) return { ok: false, reason: 'Missing x-api-key header' }
  if (headerKey !== expected) return { ok: false, reason: 'Invalid x-api-key' }
  return { ok: true }
}

export async function POST(request: Request) {
  const auth = checkInternalKey(request)
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: 'unauthorized', detail: auth.reason, code: 'E-JOURNEY-EVENT-AUTH' },
      { status: 401 },
    )
  }

  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json(
      { ok: false, error: 'invalid_json', code: 'E-JOURNEY-EVENT-JSON' },
      { status: 400 },
    )
  }

  const client_id = typeof body.client_id === 'string' ? body.client_id : null
  const journey_id = typeof body.journey_id === 'string' ? body.journey_id : null
  const event_type = typeof body.trigger_type === 'string' ? body.trigger_type : 'event'
  if (!client_id && !journey_id) {
    return NextResponse.json(
      {
        ok: false,
        error: 'client_id_or_journey_id_required',
        code: 'E-JOURNEY-EVENT-INPUT',
      },
      { status: 400 },
    )
  }

  const supabase = getSupabaseAdmin()

  // Find the active ALWAYS_ON row for this client (or by journey_id)
  const query = supabase
    .from('client_journey_state')
    .select('id, metadata')
    .eq('journey', 'ALWAYS_ON')
    .eq('status', 'active')
    .order('started_at', { ascending: false })
    .limit(1)
  if (journey_id) query.eq('id', journey_id)
  else if (client_id) query.eq('client_id', client_id)

  const { data: rowsData, error: readErr } = await query
  if (readErr) {
    return NextResponse.json(
      { ok: false, error: readErr.message, code: 'E-JOURNEY-EVENT-READ' },
      { status: 500 },
    )
  }
  const rows = (rowsData ?? []) as Array<{ id: string; metadata: Record<string, unknown> | null }>
  if (rows.length === 0) {
    return NextResponse.json(
      {
        ok: false,
        error: 'no_active_always_on_journey',
        code: 'E-JOURNEY-EVENT-NOT-FOUND',
        hint: 'Dispatch a journey=ALWAYS_ON first via /api/journey/dispatch',
      },
      { status: 404 },
    )
  }

  const row = rows[0]
  const existing = (row.metadata?.always_on_events as Array<Record<string, unknown>> | undefined) ?? []
  const newEvent = {
    ts: new Date().toISOString(),
    event_type,
    payload: body.params ?? body,
  }
  const merged = [...existing, newEvent].slice(-MAX_EVENTS)
  const nextMeta = { ...(row.metadata ?? {}), always_on_events: merged }

  const { error: upErr } = await supabase
    .from('client_journey_state')
    .update({ metadata: nextMeta, updated_at: new Date().toISOString() })
    .eq('id', row.id)
  if (upErr) {
    return NextResponse.json(
      { ok: false, error: upErr.message, code: 'E-JOURNEY-EVENT-WRITE' },
      { status: 500 },
    )
  }

  return NextResponse.json({
    ok: true,
    journey_id: row.id,
    events_total: merged.length,
    capped_at: MAX_EVENTS,
  })
}
