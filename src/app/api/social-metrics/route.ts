/**
 * /api/social-metrics
 *  POST → upsert metrics rows (daily polling cron)
 *  GET  → list, filterable by client_id/platform/since
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

  const today = new Date().toISOString().slice(0, 10)
  const rows = rowsIn.map((r: Record<string, unknown>) => ({
    schedule_id: r.schedule_id,
    client_id: r.client_id,
    platform: r.platform,
    impressions: r.impressions ?? 0,
    reach: r.reach ?? 0,
    likes: r.likes ?? 0,
    comments: r.comments ?? 0,
    shares: r.shares ?? 0,
    saves: r.saves ?? 0,
    clicks: r.clicks ?? 0,
    video_views: r.video_views ?? 0,
    engagement_rate: r.engagement_rate ?? 0,
    raw: r.raw ?? {},
    measured_at: r.measured_at ?? today,
  }))

  for (const r of rows) {
    if (!r.schedule_id || !r.client_id || !r.platform) {
      return NextResponse.json({ error: 'each row needs schedule_id, client_id, platform' }, { status: 400 })
    }
  }

  const supabase = getSupabaseAdmin()
  const { error, data } = await supabase
    .from('social_metrics')
    .upsert(rows, { onConflict: 'schedule_id,measured_at' })
    .select('id')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, upserted: data?.length ?? 0 })
}

export async function GET(request: Request) {
  const supabase = getSupabaseAdmin()
  const url = new URL(request.url)
  const limit = Math.min(Number(url.searchParams.get('limit') ?? 200), 1000)

  let q = supabase.from('social_metrics').select('*').order('measured_at', { ascending: false }).limit(limit)
  const clientId = url.searchParams.get('client_id')
  const platform = url.searchParams.get('platform')
  const since = url.searchParams.get('since')
  if (clientId) q = q.eq('client_id', clientId)
  if (platform) q = q.eq('platform', platform)
  if (since) q = q.gte('measured_at', since)

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ rows: data ?? [] })
}
