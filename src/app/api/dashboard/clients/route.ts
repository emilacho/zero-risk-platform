/**
 * GET /api/dashboard/clients
 *
 * Dashboard surface · list clientes with metadata + rolled-up counts
 * (invocations, agents touched, total spend USD). Read-only.
 *
 * Query · ?limit=N (1..200, default 100) · ?status=active|paused ·
 *        ?includeArchived=true (default false · honors archived_at
 *        soft-delete from Sprint 6 cleanup 2026-05-17)
 */
import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

interface ClientRow {
  id: string
  name: string | null
  slug: string | null
  website_url: string | null
  domain: string | null
  industry: string | null
  market: string | null
  country: string | null
  language: string | null
  status: string | null
  logo_url: string | null
  brand_colors: unknown
  created_at: string | null
  updated_at: string | null
  archived_at: string | null
  archived_reason: string | null
}

interface InvocationCountRow {
  client_id: string | null
  agent_id: string | null
  cost_usd: number | null
}

interface ClientStats {
  invocations: number
  agents_touched: Set<string>
  total_spend_usd: number
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url)
    const rawLimit = parseInt(url.searchParams.get('limit') || '100', 10)
    const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 200) : 100
    const statusFilter = url.searchParams.get('status')
    const includeArchived = url.searchParams.get('includeArchived') === 'true'

    const supabase = getSupabaseAdmin()

    let q = supabase
      .from('clients')
      .select(
        'id, name, slug, website_url, domain, industry, market, country, language, status, logo_url, brand_colors, created_at, updated_at, archived_at, archived_reason',
      )
      .order('created_at', { ascending: false })
      .limit(limit)
    if (statusFilter) q = q.eq('status', statusFilter)
    if (!includeArchived) q = q.is('archived_at', null)
    const { data: clientRows, error: clientsErr } = await q
    if (clientsErr) {
      return NextResponse.json(
        { ok: false, error: clientsErr.message, code: 'E-DASHBOARD-CLIENTS-LIST' },
        { status: 500 },
      )
    }
    const clients = (clientRows ?? []) as ClientRow[]
    const clientIds = clients.map(c => c.id)

    const statsByClient = new Map<string, ClientStats>()
    if (clientIds.length > 0) {
      const { data: invRows } = await supabase
        .from('agent_invocations')
        .select('client_id, agent_id, cost_usd')
        .in('client_id', clientIds)
        .limit(20_000)
      for (const row of (invRows ?? []) as InvocationCountRow[]) {
        const cid = row.client_id
        if (!cid) continue
        const s =
          statsByClient.get(cid) ??
          ({ invocations: 0, agents_touched: new Set<string>(), total_spend_usd: 0 } as ClientStats)
        s.invocations += 1
        if (row.agent_id) s.agents_touched.add(row.agent_id)
        s.total_spend_usd += Number(row.cost_usd ?? 0)
        statsByClient.set(cid, s)
      }
    }

    const enriched = clients.map(c => {
      const s = statsByClient.get(c.id)
      return {
        id: c.id,
        name: c.name,
        slug: c.slug,
        website_url: c.website_url,
        domain: c.domain,
        industry: c.industry,
        market: c.market,
        country: c.country,
        language: c.language,
        status: c.status,
        logo_url: c.logo_url,
        brand_colors: c.brand_colors,
        created_at: c.created_at,
        updated_at: c.updated_at,
        archived_at: c.archived_at,
        archived_reason: c.archived_reason,
        stats: {
          invocations: s?.invocations ?? 0,
          agents_touched: s ? s.agents_touched.size : 0,
          total_spend_usd: s ? Number(s.total_spend_usd.toFixed(6)) : 0,
        },
      }
    })

    return NextResponse.json({
      ok: true,
      count: enriched.length,
      filters: { status: statusFilter ?? null, limit, includeArchived },
      clients: enriched,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 },
    )
  }
}
