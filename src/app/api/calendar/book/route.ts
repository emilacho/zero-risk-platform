/**
 * POST /api/calendar/book
 *
 * Sprint 6 Track A2 · Stack V4 GHL-Out · replaces deprecated
 * `/api/ghl/create-calendar-event` consumed by the Client Onboarding
 * E2E v2 workflow.
 *
 * Wraps Cal.com self-host (Railway) booking creation. Currently a STUB ·
 * persists a row to `calendar_bookings` so the upstream workflow has
 * a confirmation receipt. Cal.com OAuth wire-up is Sprint C2 scope.
 *
 * Body ·
 *   {
 *     client_id?: string,
 *     contact_email?: string,
 *     contact_name?: string,
 *     event_title?: string,
 *     scheduled_at?: ISO,
 *     duration_minutes?: number,
 *     metadata?: object,
 *   }
 *
 * Response (200 ok) · `{ ok, booking: BookingRow, mode: 'stub' }`
 * Response (503 ServiceUnconfigured) when CAL_API_KEY missing (post-OAuth wire).
 */
import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface BookBody {
  client_id?: string
  contact_email?: string
  contact_name?: string
  event_title?: string
  scheduled_at?: string
  duration_minutes?: number
  metadata?: Record<string, unknown>
}

export async function POST(req: Request) {
  let body: BookBody
  try {
    body = (await req.json()) as BookBody
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 })
  }
  if (!body.scheduled_at) {
    return NextResponse.json(
      { ok: false, error: 'scheduled_at_required' },
      { status: 400 },
    )
  }

  try {
    const supabase = getSupabaseAdmin()
    const { data, error } = await supabase
      .from('calendar_bookings')
      .insert({
        client_id: body.client_id ?? null,
        contact_email: body.contact_email ?? null,
        contact_name: body.contact_name ?? null,
        event_title: body.event_title ?? 'Untitled Event',
        scheduled_at: body.scheduled_at,
        duration_minutes: body.duration_minutes ?? 30,
        status: 'pending_provider_sync',
        provider: 'cal-com-stub',
        metadata: body.metadata ?? {},
      })
      .select()
      .single()
    if (error) {
      // Table may not exist · graceful degradation
      if (error.code === '42P01') {
        return NextResponse.json(
          {
            ok: false,
            code: 'ServiceUnconfigured',
            detail: 'calendar_bookings table missing · run Sprint 3 D4 migration',
          },
          { status: 503 },
        )
      }
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    }
    return NextResponse.json({ ok: true, booking: data, mode: 'stub' })
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'unknown' },
      { status: 500 },
    )
  }
}
