/**
 * POST /api/ghl/create-calendar-event — stub for GoHighLevel calendar API.
 */
import { NextResponse } from 'next/server'
import { checkInternalKey } from '@/lib/internal-auth'
import { getSupabaseAdmin } from '@/lib/supabase'
import { captureRouteError } from '@/lib/sentry-capture'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(request: Request) {
  try {
    const auth = checkInternalKey(request)
    if (!auth.ok) return NextResponse.json({ error: 'unauthorized', detail: auth.reason }, { status: 401 })

    let rawBody: unknown = {}
    try { rawBody = await request.json() } catch { rawBody = {} }
    const body: Record<string, unknown> =
      rawBody && typeof rawBody === 'object' && !Array.isArray(rawBody) ? (rawBody as Record<string, unknown>) : {}

    try {
      const supabase = getSupabaseAdmin()
      await supabase.from('ghl_calendar_log').insert({ request_body: body })
    } catch {}

    const event_id = `ghl-evt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    return NextResponse.json({
      ...body,
      ok: true,
      event_id,
      scheduled_at: body.scheduled_at || new Date(Date.now() + 3 * 86400000).toISOString(),
      fallback_mode: true,
      note: 'Stub: real GHL Calendar API integration pending.',
    })
  } catch (e: unknown) {
    captureRouteError(e, request, {
      route: '/api/ghl/create-calendar-event',
      source: 'route_handler',
    })
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ ok: true, fallback_mode: true, handler_error: msg.slice(0, 400) })
  }
}
