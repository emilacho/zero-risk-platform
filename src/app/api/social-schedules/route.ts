/**
 * /api/social-schedules
 *  POST → schedule a social post (Social Multi-Platform Publisher creates these)
 *  GET  → list (default order: scheduled_for ASC for queue view)
 *
 * POST accepts either a single object or { items: [...] } for batch scheduling
 * across multiple platforms with one call.
 */
import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { checkInternalKey } from '@/lib/internal-auth'
import { validateObject } from '@/lib/input-validator'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

interface ScheduleIn {
  client_id: string
  content_package_id?: string | null
  platform: string
  payload: Record<string, unknown>
  scheduled_for: string  // ISO timestamp
}

export async function POST(request: Request) {
  const auth = checkInternalKey(request)
  if (!auth.ok) return NextResponse.json({ error: 'unauthorized', detail: auth.reason }, { status: 401 })

  const _raw = await request.json().catch(() => ({}))
  const _v = validateObject<Record<string, unknown>>(_raw, 'lenient-write')
  if (!_v.ok) return _v.response
  const body = _v.data as Record<string, any>
  const itemsIn: ScheduleIn[] = Array.isArray(body.items) ? body.items : Array.isArray(body) ? body : [body]

  for (const it of itemsIn) {
    if (!it.client_id || !it.platform || !it.payload || !it.scheduled_for) {
      return NextResponse.json(
        { error: 'each item needs client_id, platform, payload, scheduled_for' },
        { status: 400 }
      )
    }
  }

  const rows = itemsIn.map((it) => ({
    client_id: it.client_id,
    content_package_id: it.content_package_id ?? null,
    platform: it.platform,
    payload: it.payload,
    scheduled_for: it.scheduled_for,
    status: 'scheduled',
  }))

  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase.from('social_schedules').insert(rows).select()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ items: data ?? [] }, { status: 201 })
}

export async function GET(request: Request) {
  const supabase = getSupabaseAdmin()
  const url = new URL(request.url)
  const limit = Math.min(Number(url.searchParams.get('limit') ?? 100), 500)

  let q = supabase
    .from('social_schedules')
    .select('*')
    .order('scheduled_for', { ascending: true })
    .limit(limit)

  const clientId = url.searchParams.get('client_id')
  const status = url.searchParams.get('status')
  const platform = url.searchParams.get('platform')
  if (clientId) q = q.eq('client_id', clientId)
  if (status) q = q.eq('status', status)
  if (platform) q = q.eq('platform', platform)

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ items: data ?? [] })
}
