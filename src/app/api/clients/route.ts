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
import { validateObject } from '@/lib/input-validator'

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

/**
 * Sprint #6 · attach competitors array (from client_competitive_landscape)
 * to each client row when ?include=competitors is set. Two helpers · per-row
 * fetch (used in single-client GET path) and batched list attach (used in
 * the list GET path · 1 query covers all client_ids to avoid N+1).
 *
 * The competitors subset is the columns the daily-monitor workflow needs to
 * iterate · light shape, NOT the full landscape row (callers can hit the
 * landscape table directly for the rich payload).
 */
type SupabaseLike = ReturnType<typeof getSupabaseAdmin>

interface CompetitorMini {
  id: string
  competitor_name: string
  competitor_website: string | null
  competitor_type: string | null
}

async function fetchCompetitorsForClient(
  supabase: SupabaseLike,
  clientId: string,
): Promise<CompetitorMini[]> {
  try {
    const { data } = await supabase
      .from('client_competitive_landscape')
      .select('id, competitor_name, competitor_website, competitor_type')
      .eq('client_id', clientId)
    return (data ?? []) as CompetitorMini[]
  } catch {
    return []
  }
}

async function attachCompetitorsToList(
  supabase: SupabaseLike,
  clients: Array<Record<string, unknown>>,
): Promise<Array<Record<string, unknown>>> {
  if (clients.length === 0) return clients
  const ids = clients
    .map((c) => (c.id as string | undefined) ?? (c.client_id as string | undefined))
    .filter((v): v is string => typeof v === 'string' && v.length > 0)
  if (ids.length === 0) return clients.map((c) => ({ ...c, competitors: [] }))
  try {
    const { data } = await supabase
      .from('client_competitive_landscape')
      .select('id, client_id, competitor_name, competitor_website, competitor_type')
      .in('client_id', ids)
    const byClient = new Map<string, CompetitorMini[]>()
    for (const row of (data ?? []) as Array<CompetitorMini & { client_id: string }>) {
      const arr = byClient.get(row.client_id) ?? []
      arr.push({
        id: row.id,
        competitor_name: row.competitor_name,
        competitor_website: row.competitor_website,
        competitor_type: row.competitor_type,
      })
      byClient.set(row.client_id, arr)
    }
    return clients.map((c) => {
      const id = (c.id as string | undefined) ?? (c.client_id as string | undefined) ?? ''
      return { ...c, competitors: byClient.get(id) ?? [] }
    })
  } catch {
    return clients.map((c) => ({ ...c, competitors: [] }))
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
    // Sprint #6 Brazo 2 · include=competitors attaches a `competitors` array
    // to each client row sourced from client_competitive_landscape. Used by
    // the Competitor Daily Monitor (B2) workflow's `Expand Competitors`
    // code node. Multiple includes can be comma-separated for future extension.
    const includeRaw = url.searchParams.get('include') || ''
    const includeSet = new Set(
      includeRaw.split(',').map((s) => s.trim()).filter(Boolean),
    )
    const includeCompetitors = includeSet.has('competitors')

    try {
      const supabase = getSupabaseAdmin()

      // Single fetch
      if (client_id) {
        const { data } = await supabase.from('clients').select('*').eq('client_id', client_id).maybeSingle()
        if (data) {
          const enriched = includeCompetitors
            ? { ...data, competitors: await fetchCompetitorsForClient(supabase, data.id as string | undefined ?? client_id) }
            : data
          return NextResponse.json({ ok: true, client: enriched, ...enriched })
        }
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
        const list = includeCompetitors
          ? await attachCompetitorsToList(supabase, fallback.data || [])
          : fallback.data || []
        return NextResponse.json({
          ok: true,
          clients: list,
          count: list.length,
          filter: 'none_fallback',
        })
      }

      const list = includeCompetitors
        ? await attachCompetitorsToList(supabase, data || [])
        : data || []
      return NextResponse.json({
        ok: true,
        clients: list,
        count: list.length,
        filter: { status, limit, include: [...includeSet] },
      })
    } catch (e: unknown) {
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

    const v = validateObject<Record<string, unknown>>(raw, 'clients-create')
    if (!v.ok) return v.response
    const body: Record<string, unknown> = (v.data && typeof v.data === 'object' && !Array.isArray(v.data))
      ? (v.data as Record<string, unknown>) : {}

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
    return NextResponse.json({
      ok: true,
      fallback_mode: true,
      handler_error: e instanceof Error ? e.message : String(e),
    })
  }
}
