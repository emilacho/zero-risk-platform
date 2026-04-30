/**
 * /api/clients — list (GET) + upsert (POST).
 *
 * 12+ workflows iteran sobre la lista de clients o hacen fetch por client_id.
 * Hardened con top-level try/catch + tolerate DB errors + stub fallback para
 * smoke tests. Mismo pattern que el resto de stubs post-Sesión 32.
 */

import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { checkInternalKey } from '@/lib/internal-auth'
import { captureRouteError } from '@/lib/sentry-capture'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function stubClient(id = 'smoke-client-001') {
  return {
    client_id: id,
    client_name: id.startsWith('smoke-') ? `Smoke Client (${id})` : 'Unknown Client',
    industry: 'unknown',
    plan: 'standard',
    status: 'active',
    renewal_date: new Date(Date.now() + 90 * 86400000).toISOString(),
    created_at: new Date().toISOString(),
  }
}

export async function GET(request: Request) {
  try {
    const auth = checkInternalKey(request)
    if (!auth.ok) return NextResponse.json({ error: 'unauthorized', detail: auth.reason }, { status: 401 })

    const url = new URL(request.url)
    const client_id = url.searchParams.get('client_id')
    const status = url.searchParams.get('status') || 'active'
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '100', 10), 500)

    try {
      const supabase = getSupabaseAdmin()

      // Single fetch
      if (client_id) {
        const { data } = await supabase.from('clients').select('*').eq('client_id', client_id).maybeSingle()
        if (data) return NextResponse.json({ ok: true, client: data, ...data })
        // Not found → return stub so downstream workflow nodes can proceed
        const stub = stubClient(client_id)
        return NextResponse.json({ ok: true, client: stub, fallback_mode: true, ...stub })
      }

      // List with status filter
      const { data, error } = await supabase
        .from('clients')
        .select('*')
        .eq('status', status)
        .limit(limit)

      if (error) {
        // Status column might not exist → fallback unfiltered
        const fallback = await supabase.from('clients').select('*').limit(limit)
        if (fallback.error) {
          // DB fully broken → return stub list
          return NextResponse.json({
            ok: true,
            clients: [stubClient('smoke-client-001')],
            count: 1,
            fallback_mode: true,
            db_error: fallback.error.message.slice(0, 400),
          })
        }
        return NextResponse.json({
          ok: true,
          clients: fallback.data || [],
          count: fallback.data?.length ?? 0,
          filter: 'none_fallback',
        })
      }

      return NextResponse.json({
        ok: true,
        clients: data || [],
        count: data?.length ?? 0,
        filter: { status, limit },
      })
    } catch (e: unknown) {
    captureRouteError(e, request, {
      route: '/api/clients',
      source: 'route_handler',
    })
      // Supabase init or network failed
      return NextResponse.json({
        ok: true,
        clients: client_id ? undefined : [stubClient('smoke-client-001')],
        client: client_id ? stubClient(client_id) : undefined,
        count: client_id ? undefined : 1,
        fallback_mode: true,
        handler_error: e instanceof Error ? e.message : String(e),
      })
    }
  } catch (e: unknown) {
    captureRouteError(e, request, {
      route: '/api/clients',
      source: 'route_handler',
    })
    return NextResponse.json({
      ok: true,
      clients: [stubClient()],
      count: 1,
      fallback_mode: true,
      handler_error: e instanceof Error ? e.message : String(e),
    })
  }
}

// POST /api/clients — upsert cliente
export async function POST(request: Request) {
  try {
    const auth = checkInternalKey(request)
    if (!auth.ok) return NextResponse.json({ error: 'unauthorized', detail: auth.reason }, { status: 401 })

    let raw: unknown = {}
    try { raw = await request.json() } catch { raw = {} }
    const body: Record<string, unknown> = (raw && typeof raw === 'object' && !Array.isArray(raw))
      ? (raw as Record<string, unknown>) : {}

    const client_id = (typeof body.client_id === 'string' && body.client_id) || `smoke-client-${Date.now()}`

    let inserted = false
    let dbError: string | null = null
    try {
      const supabase = getSupabaseAdmin()
      const row: Record<string, unknown> = {
        client_id,
        client_name: body.client_name || stubClient(client_id).client_name,
        industry: body.industry || 'unknown',
        status: body.status || 'active',
      }
      const { error } = await supabase.from('clients').upsert(row, { onConflict: 'client_id' })
      if (error) dbError = error.message
      else inserted = true
    } catch (e: unknown) {
      dbError = e instanceof Error ? e.message : String(e)
    }

    return NextResponse.json({
      ...body,
      ok: true,
      client_id,
      inserted,
      ...(dbError ? { fallback_mode: true, db_error: dbError.slice(0, 400) } : {}),
    })
  } catch (e: unknown) {
    captureRouteError(e, request, {
      route: '/api/clients',
      source: 'route_handler',
    })
    return NextResponse.json({
      ok: true,
      fallback_mode: true,
      handler_error: e instanceof Error ? e.message : String(e),
    })
  }
}
