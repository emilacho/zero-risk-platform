/**
 * POST /api/notion/create-success-plan — stub.
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
      await supabase.from('notion_success_plan_log').insert({ request_body: body })
    } catch {}

    const plan_id = `notion-plan-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    return NextResponse.json({
      ...body,
      ok: true,
      plan_id,
      plan_url: `https://notion.so/${plan_id}`,
      fallback_mode: true,
      note: 'Stub: real Notion API integration pending.',
    })
  } catch (e: unknown) {
    captureRouteError(e, request, {
      route: '/api/notion/create-success-plan',
      source: 'route_handler',
    })
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ ok: true, fallback_mode: true, handler_error: msg.slice(0, 400) })
  }
}
