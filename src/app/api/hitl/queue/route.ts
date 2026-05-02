/**
 * /api/hitl/queue
 *  POST → enqueue an HITL item (workflows call this when output needs review)
 *  GET  → list queue (Mission Control inbox)
 *
 * Note: we keep the legacy /api/hitl/pending in place; this endpoint is the
 * "write" side that the V3 workflows expect.
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
  const _v = validateObject<Record<string, unknown>>(_raw, 'hitl-action')
  if (!_v.ok) return _v.response
  const body = _v.data as Record<string, any>
  for (const f of ['type', 'title']) {
    if (!body?.[f]) return NextResponse.json({ error: `missing field: ${f}` }, { status: 400 })
  }

  const supabase = getSupabaseAdmin()
  const row = {
    client_id: body.client_id ?? null,
    type: body.type,
    title: body.title,
    priority: body.priority ?? 'medium',
    status: 'pending',
    payload: body.payload ?? {},
    metadata: body.metadata ?? {},
  }
  const { data, error } = await supabase.from('hitl_queue').insert(row).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ item: data }, { status: 201 })
}

export async function GET(request: Request) {
  const supabase = getSupabaseAdmin()
  const url = new URL(request.url)
  const status = url.searchParams.get('status') ?? 'pending'
  const limit = Math.min(Number(url.searchParams.get('limit') ?? 100), 500)
  const clientId = url.searchParams.get('client_id')
  const type = url.searchParams.get('type')

  let q = supabase
    .from('hitl_queue')
    .select('*')
    // Order: highest priority first, then oldest first within priority.
    .order('priority', { ascending: false })
    .order('created_at', { ascending: true })
    .limit(limit)
  if (status !== 'all') q = q.eq('status', status)
  if (clientId) q = q.eq('client_id', clientId)
  if (type) q = q.eq('type', type)

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ items: data ?? [] })
}
