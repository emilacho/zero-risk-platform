/**
 * POST /api/calendar/webhook
 *
 * Cal.com webhook receiver · Sprint 3 D4 · graceful 503 stub sin
 * CAL_COM_API_KEY presente.
 *
 * Cal.com self-host context (Sprint 3 D1):
 *   - Service deployed on Railway · project `peaceful-spirit` · service id
 *     `7c6b0d5d-f31f-4a8d-b785-934cbad1e4bc`
 *   - Domain · https://cal-com-production-e55b.up.railway.app
 *   - Source · ghcr.io/calcom/cal.com:latest
 *   - OAuth Google + Outlook NOT configured · stub mode marker
 *     CAL_COM_INTEGRATION_STUB=true
 *
 * Required env vars on Vercel side (post-Emilio key population):
 *   - CAL_COM_API_KEY · Cal.com instance admin API key
 *   - CALCOM_WEBHOOK_SECRET · HMAC signing secret for webhook verification
 *     (matches CALCOM_WEBHOOK_SECRET on Railway service · same value)
 *
 * Behavior:
 *   - When CAL_COM_API_KEY absent → 503 with helpful diagnostic message
 *   - When CAL_COM_API_KEY present → TODO: implement signature verification +
 *     event dispatch · persist to calendar_bookings table (migration
 *     202605200800_calendar_bookings.sql)
 *
 * Cal.com webhook event types expected (per Cal.com docs):
 *   BOOKING_CREATED · BOOKING_RESCHEDULED · BOOKING_CANCELLED · BOOKING_REJECTED
 *   BOOKING_REQUESTED · BOOKING_PAID · MEETING_ENDED
 */

import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 30

interface CalcomWebhookEvent {
  triggerEvent?: string
  createdAt?: string
  payload?: Record<string, unknown>
}

export async function POST(request: Request) {
  const apiKey = process.env.CAL_COM_API_KEY
  const webhookSecret = process.env.CALCOM_WEBHOOK_SECRET
  const isStub = process.env.CAL_COM_INTEGRATION_STUB === 'true'

  // Stub mode · Cal.com integration not yet fully configured
  if (!apiKey || isStub) {
    return NextResponse.json(
      {
        ok: false,
        error: 'cal_com_integration_not_ready',
        code: 'E-CALCOM-STUB',
        detail:
          'CAL_COM_API_KEY missing or CAL_COM_INTEGRATION_STUB=true. ' +
          'Cal.com self-host deployed on Railway (cal-com-production-e55b.up.railway.app) ' +
          'but OAuth + API key population pending Emilio. ' +
          'Webhook receiver remains in stub mode until env vars populated.',
        deployment_info: {
          railway_project: 'peaceful-spirit',
          railway_service_id: '7c6b0d5d-f31f-4a8d-b785-934cbad1e4bc',
          domain: 'cal-com-production-e55b.up.railway.app',
          source_image: 'ghcr.io/calcom/cal.com:latest',
          required_env_vars_pending: ['CAL_COM_API_KEY', 'GOOGLE_API_CREDENTIALS', 'MS_GRAPH_CLIENT_ID', 'MS_GRAPH_CLIENT_SECRET'],
        },
        forwarding_target_db_table: 'calendar_bookings',
        migration_ref: 'supabase/migrations/202605200800_calendar_bookings.sql',
      },
      { status: 503 },
    )
  }

  // Real handler path · TODO: implement once Emilio populates keys
  let body: CalcomWebhookEvent
  try {
    body = (await request.json()) as CalcomWebhookEvent
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_json', code: 'E-INPUT-PARSE' }, { status: 400 })
  }

  // Signature verification (TODO once keys live)
  // const signature = request.headers.get('x-cal-signature-256')
  // if (!verifyHmac(signature, webhookSecret!, await request.text())) {
  //   return NextResponse.json({ ok: false, error: 'invalid_signature' }, { status: 401 })
  // }

  // Event dispatch (TODO once keys live · skeleton for forensic clarity)
  const triggerEvent = body.triggerEvent || 'unknown'

  // Allowed triggerEvent enum (Cal.com docs)
  const allowedEvents = new Set([
    'BOOKING_CREATED', 'BOOKING_RESCHEDULED', 'BOOKING_CANCELLED',
    'BOOKING_REJECTED', 'BOOKING_REQUESTED', 'BOOKING_PAID', 'MEETING_ENDED',
  ])

  if (!allowedEvents.has(triggerEvent)) {
    return NextResponse.json(
      { ok: false, error: 'unknown_trigger_event', code: 'E-CALCOM-EVENT', received: triggerEvent },
      { status: 422 },
    )
  }

  // TODO · persist webhook_payload to calendar_bookings table (migration 202605200800)
  // const supabase = getSupabaseAdmin()
  // await supabase.from('calendar_bookings').upsert({...})

  // Acknowledge receipt · stub for downstream wire-in
  return NextResponse.json({
    ok: true,
    received_at: new Date().toISOString(),
    trigger_event: triggerEvent,
    status: 'acknowledged_skeleton',
    next_step: 'persist_to_calendar_bookings_table',
    note: 'webhook payload validated · persistence TODO post-key-population',
  })
}

export async function GET() {
  return NextResponse.json({
    endpoint: '/api/calendar/webhook',
    method: 'POST',
    purpose: 'Cal.com webhook receiver · Sprint 3 D4 (graceful stub)',
    stub_mode: process.env.CAL_COM_INTEGRATION_STUB === 'true' || !process.env.CAL_COM_API_KEY,
    cal_com_deployment: {
      domain: 'cal-com-production-e55b.up.railway.app',
      railway_project: 'peaceful-spirit',
      railway_service_id: '7c6b0d5d-f31f-4a8d-b785-934cbad1e4bc',
    },
    supported_events: ['BOOKING_CREATED', 'BOOKING_RESCHEDULED', 'BOOKING_CANCELLED', 'BOOKING_REJECTED', 'BOOKING_REQUESTED', 'BOOKING_PAID', 'MEETING_ENDED'],
    persistence_target: 'calendar_bookings (multi-tenant · tenant_id text scope)',
  })
}
