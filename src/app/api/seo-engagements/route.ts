/**
 * /api/seo-engagements
 *  POST  → create engagement (called by Flagship SEO workflow "Persist Engagement Start")
 *  GET   → list engagements (Mission Control)
 */
import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { checkInternalKey } from '@/lib/internal-auth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(request: Request) {
  const auth = checkInternalKey(request)
  if (!auth.ok) return NextResponse.json({ error: 'unauthorized', detail: auth.reason }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const required = ['task_id', 'client_id', 'domain', 'target_keyword', 'locale']
  for (const f of required) {
    if (!body?.[f]) return NextResponse.json({ error: `missing field: ${f}` }, { status: 400 })
  }

  const supabase = getSupabaseAdmin()
  const row = {
    task_id: String(body.task_id),
    client_id: String(body.client_id),
    domain: String(body.domain),
    target_keyword: String(body.target_keyword),
    secondary_keywords: body.secondary_keywords ?? [],
    locale: body.locale,
    vertical: body.vertical ?? null,
    tracking_duration_days: Number(body.tracking_duration_days ?? 90),
    status: 'started' as const,
  }

  // Idempotent on task_id — if it exists, return it.
  const { data: existing } = await supabase
    .from('seo_engagements')
    .select('*')
    .eq('task_id', row.task_id)
    .maybeSingle()

  if (existing) return NextResponse.json({ engagement: existing, idempotent: true })

  const { data, error } = await supabase.from('seo_engagements').insert(row).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ engagement: data }, { status: 201 })
}

export async function GET(request: Request) {
  const supabase = getSupabaseAdmin()
  const url = new URL(request.url)
  const clientId = url.searchParams.get('client_id')
  const status = url.searchParams.get('status')
  const limit = Math.min(Number(url.searchParams.get('limit') ?? 50), 200)

  let q = supabase.from('seo_engagements').select('*').order('created_at', { ascending: false }).limit(limit)
  if (clientId) q = q.eq('client_id', clientId)
  if (status) q = q.eq('status', status)

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ engagements: data ?? [] })
}
