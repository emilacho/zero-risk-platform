/**
 * POST /api/notion/create-client-workspace — stub.
 * Real impl will call Notion API to create a new workspace page for a client
 * under the parent page. For now just logs the request and returns a synthetic
 * workspace_id + workspace_url so downstream workflow nodes can proceed.
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

    const client_id = (typeof body.client_id === 'string' && body.client_id) || 'unknown'
    const client_name = (typeof body.client_name === 'string' && body.client_name) || 'Unknown Client'

    // Log for observability
    try {
      const supabase = getSupabaseAdmin()
      await supabase.from('notion_workspace_log').insert({ client_id, client_name, request_body: body })
    } catch {}

    const workspace_id = `notion-workspace-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    return NextResponse.json({
      ...body,
      ok: true,
      workspace_id,
      workspace_url: `https://notion.so/${workspace_id}`,
      client_id,
      fallback_mode: true,
      note: 'Stub: real Notion API integration pending.',
    })
  } catch (e: unknown) {
    captureRouteError(e, request, {
      route: '/api/notion/create-client-workspace',
      source: 'route_handler',
    })
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ ok: true, fallback_mode: true, handler_error: msg.slice(0, 400) })
  }
}
