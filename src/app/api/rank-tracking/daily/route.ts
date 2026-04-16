/**
 * /api/rank-tracking/daily
 *  POST → upsert one or many daily rank rows (called by daily cron in n8n)
 *  GET  → query history (for KPI dashboard); ?engagement_id=... &keyword=... &since=YYYY-MM-DD
 */
import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { checkInternalKey } from '@/lib/internal-auth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

interface RankRow {
  engagement_id: string
  client_id: string
  domain: string
  keyword: string
  country: string
  rank: number | null
  url?: string | null
  serp_features?: string[]
  ai_overview_cited?: boolean
  featured_snippet?: boolean
  paa_present?: boolean
  raw?: Record<string, unknown>
  checked_at?: string
}

export async function POST(request: Request) {
  const auth = checkInternalKey(request)
  if (!auth.ok) return NextResponse.json({ error: 'unauthorized', detail: auth.reason }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const rowsIn: RankRow[] = Array.isArray(body) ? body : Array.isArray(body.rows) ? body.rows : [body]

  const today = new Date().toISOString().slice(0, 10)
  const rows = rowsIn.map((r) => ({
    engagement_id: r.engagement_id,
    client_id: r.client_id,
    domain: r.domain,
    keyword: r.keyword,
    country: r.country,
    rank: r.rank ?? null,
    url: r.url ?? null,
    serp_features: r.serp_features ?? [],
    ai_overview_cited: !!r.ai_overview_cited,
    featured_snippet: !!r.featured_snippet,
    paa_present: !!r.paa_present,
    raw: r.raw ?? {},
    checked_at: r.checked_at ?? today,
  }))

  for (const r of rows) {
    if (!r.engagement_id || !r.client_id || !r.domain || !r.keyword || !r.country) {
      return NextResponse.json({ error: 'each row needs engagement_id, client_id, domain, keyword, country' }, { status: 400 })
    }
  }

  const supabase = getSupabaseAdmin()
  const { error, data } = await supabase
    .from('rank_tracking_daily')
    .upsert(rows, { onConflict: 'engagement_id,keyword,country,checked_at' })
    .select('id')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, upserted: data?.length ?? 0 })
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  const engagementId = url.searchParams.get('engagement_id')
  const keyword = url.searchParams.get('keyword')
  const since = url.searchParams.get('since')

  const supabase = getSupabaseAdmin()
  let q = supabase.from('rank_tracking_daily').select('*').order('checked_at', { ascending: false }).limit(500)
  if (engagementId) q = q.eq('engagement_id', engagementId)
  if (keyword) q = q.eq('keyword', keyword)
  if (since) q = q.gte('checked_at', since)

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ rows: data ?? [] })
}
