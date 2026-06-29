/**
 * POST /api/calendar/book
 *
 * Stack V4 · Cal.com Cloud (free) booking creation. Consumed by the Client
 * Onboarding E2E v2 workflow (replaces the deprecated GHL calendar event).
 *
 * History · this used to be a STUB that only persisted a `calendar_bookings`
 * row (provider `cal-com-stub`) because the Cal.com self-host on Railway was
 * never operational (build failed · service down). That self-host is now
 * abandoned · we call the Cal.com Cloud API v2 directly and persist the
 * confirmed booking as the upstream-workflow receipt.
 *
 * Body ·
 *   {
 *     client_id?: string,
 *     contact_email: string,        // required · Cal.com attendee email
 *     contact_name?: string,
 *     event_title?: string,
 *     scheduled_at: ISO,            // required · maps to Cal.com `start`
 *     duration_minutes?: number,
 *     event_type_id?: number,       // overrides CALCOM_EVENT_TYPE_ID
 *     time_zone?: string,           // attendee TZ · default America/Guayaquil
 *     metadata?: object,
 *   }
 *
 * Env ·
 *   - CALCOM_API_KEY        · required · Bearer token (Cal.com Cloud)
 *   - CALCOM_EVENT_TYPE_ID  · default event type when body.event_type_id absent
 *
 * Responses ·
 *   200 ok       · { ok, booking: BookingRow, cal: { uid, status }, mode: 'cal-com-cloud' }
 *   400          · invalid_json | scheduled_at_required | contact_email_required | event_type_required
 *   401          · unauthorized
 *   502          · cal_com_upstream_failed (Cal.com rejected the booking)
 *   503          · ServiceUnconfigured (CALCOM_API_KEY missing OR calendar_bookings table missing)
 */
import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { checkInternalKey } from '@/lib/internal-auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const CALCOM_API_BASE = 'https://api.cal.com/v2'
const CAL_API_VERSION = '2024-08-13'
const DEFAULT_TIME_ZONE = 'America/Guayaquil'
const DEFAULT_LANGUAGE = 'es'

// Cal.com booking status → calendar_bookings_status_check allowed values.
const CAL_STATUS_MAP: Record<string, string> = {
  accepted: 'confirmed',
  pending: 'pending',
  awaiting_host: 'pending',
  cancelled: 'cancelled',
  rejected: 'cancelled',
}

interface BookBody {
  client_id?: string
  contact_email?: string
  contact_name?: string
  event_title?: string
  scheduled_at?: string
  duration_minutes?: number
  event_type_id?: number
  time_zone?: string
  metadata?: Record<string, unknown>
}

export async function POST(req: Request) {
  const auth = checkInternalKey(req)
  if (!auth.ok)
    return NextResponse.json(
      { error: 'unauthorized', code: 'E-AUTH-001', detail: auth.reason },
      { status: 401 },
    )

  let body: BookBody
  try {
    body = (await req.json()) as BookBody
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 })
  }
  if (!body.scheduled_at)
    return NextResponse.json({ ok: false, error: 'scheduled_at_required' }, { status: 400 })
  if (!body.contact_email)
    return NextResponse.json({ ok: false, error: 'contact_email_required' }, { status: 400 })

  // Cal.com Cloud config · graceful 503 when the key is not populated yet
  // (mirrors the prior stub's ServiceUnconfigured contract · the upstream
  // workflow treats 503 as "calendar not wired" rather than a hard error).
  const apiKey = process.env.CALCOM_API_KEY
  if (!apiKey)
    return NextResponse.json(
      {
        ok: false,
        code: 'ServiceUnconfigured',
        detail: 'CALCOM_API_KEY missing · populate Cal.com Cloud key on Vercel',
      },
      { status: 503 },
    )

  const eventTypeIdRaw = body.event_type_id ?? process.env.CALCOM_EVENT_TYPE_ID
  const eventTypeId = Number(eventTypeIdRaw)
  if (!eventTypeIdRaw || !Number.isFinite(eventTypeId))
    return NextResponse.json(
      {
        ok: false,
        error: 'event_type_required',
        detail: 'pass body.event_type_id or set CALCOM_EVENT_TYPE_ID',
      },
      { status: 400 },
    )

  // ── Create the booking on Cal.com Cloud (API v2) ───────────────────────
  const calPayload = {
    start: new Date(body.scheduled_at).toISOString(),
    eventTypeId,
    attendee: {
      name: body.contact_name ?? 'Guest',
      email: body.contact_email,
      timeZone: body.time_zone ?? DEFAULT_TIME_ZONE,
      language: DEFAULT_LANGUAGE,
    },
    metadata: (body.metadata ?? {}) as Record<string, string>,
  }

  let calData: Record<string, unknown>
  try {
    const calRes = await fetch(`${CALCOM_API_BASE}/bookings`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'cal-api-version': CAL_API_VERSION,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(calPayload),
    })
    const calJson = (await calRes.json().catch(() => ({}))) as {
      status?: string
      data?: Record<string, unknown>
      error?: unknown
    }
    if (!calRes.ok || calJson.status !== 'success' || !calJson.data) {
      return NextResponse.json(
        {
          ok: false,
          error: 'cal_com_upstream_failed',
          upstream_status: calRes.status,
          detail: calJson.error ?? calJson,
        },
        { status: 502 },
      )
    }
    calData = calJson.data
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        error: 'cal_com_upstream_failed',
        upstream_status: 0,
        detail: e instanceof Error ? e.message : 'fetch_error',
      },
      { status: 502 },
    )
  }

  const calUid = (calData.uid as string) ?? null
  const calStatus = (calData.status as string) ?? 'accepted'
  // Map Cal.com booking status → calendar_bookings_status_check allowed set
  // (pending · confirmed · cancelled · no_show · completed · rescheduled).
  // Cal.com returns 'accepted' for a created booking → persist 'confirmed'.
  const dbStatus = CAL_STATUS_MAP[calStatus] ?? 'confirmed'
  const calStart = (calData.start as string) ?? body.scheduled_at
  const calEnd = (calData.end as string) ?? null
  const meetingUrl =
    (calData.meetingUrl as string) ?? (calData.location as string) ?? null

  // ── Persist the confirmed booking · receipt for the upstream workflow ──
  try {
    const supabase = getSupabaseAdmin()
    const { data, error } = await supabase
      .from('calendar_bookings')
      .insert({
        client_id: body.client_id ?? null,
        contact_email: body.contact_email,
        contact_name: body.contact_name ?? null,
        attendee_email: body.contact_email,
        attendee_name: body.contact_name ?? null,
        event_title: body.event_title ?? 'Untitled Event',
        scheduled_at: body.scheduled_at,
        scheduled_start: calStart,
        scheduled_end: calEnd,
        duration_minutes: body.duration_minutes ?? 30,
        status: dbStatus,
        // Canon provider value · the calendar_bookings_provider_check CHECK
        // constraint allows 'cal_com' (real bookings) vs 'cal-com-stub' (old
        // stub). Cloud bookings use the canonical 'cal_com'.
        provider: 'cal_com',
        provider_booking_id: calUid,
        meeting_url: meetingUrl,
        webhook_payload: calData,
        metadata: body.metadata ?? {},
      })
      .select()
      .single()
    if (error) {
      // Table may not exist · graceful degradation (the Cal.com booking IS
      // created · surface it so the caller can still proceed / reconcile).
      if (error.code === '42P01') {
        return NextResponse.json(
          {
            ok: false,
            code: 'ServiceUnconfigured',
            detail: 'calendar_bookings table missing · run Sprint 3 D4 migration',
            cal: { uid: calUid, status: calStatus },
          },
          { status: 503 },
        )
      }
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    }
    return NextResponse.json({
      ok: true,
      booking: data,
      cal: { uid: calUid, status: calStatus },
      mode: 'cal-com-cloud',
    })
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'unknown' },
      { status: 500 },
    )
  }
}
