/**
 * /api/review-metrics
 *  POST → upsert one or many reviews from the 5-platform monitor
 *  GET  → list (filter by client_id, platform, status)
 *
 * Upsert key: (platform, external_id) — same review re-fetched updates in place.
 */
import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { checkInternalKey } from '@/lib/internal-auth'
import { validateObject } from '@/lib/input-validator'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(request: Request) {
  const auth = checkInternalKey(request)
  if (!auth.ok) return NextResponse.json({ error: 'unauthorized', detail: auth.reason }, { status: 401 })

  const _raw = await request.json().catch(() => ({}))
  const _v = validateObject<Record<string, unknown>>(_raw, 'analytics-write')
  if (!_v.ok) return _v.response
  const body = _v.data as Record<string, any>
  const rowsIn = Array.isArray(body) ? body : Array.isArray(body.rows) ? body.rows : [body]

  for (const r of rowsIn) {
    if (!r.client_id || !r.platform || !r.external_id || typeof r.rating !== 'number') {
      return NextResponse.json(
        { error: 'each row needs client_id, platform, external_id, rating' },
        { status: 400 }
      )
    }
  }

  const supabase = getSupabaseAdmin()
  const { error, data } = await supabase
    .from('review_metrics')
    .upsert(rowsIn, { onConflict: 'platform,external_id' })
    .select('id, status')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, upserted: data?.length ?? 0 })
}

export async function GET(request: Request) {
  const supabase = getSupabaseAdmin()
  const url = new URL(request.url)
  const limit = Math.min(Number(url.searchParams.get('limit') ?? 100), 500)

  let q = supabase.from('review_metrics').select('*').order('published_at', { ascending: false }).limit(limit)
  for (const col of ['client_id', 'platform', 'status', 'sentiment'] as const) {
    const v = url.searchParams.get(col)
    if (v) q = q.eq(col, v)
  }

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ items: data ?? [] })
}
