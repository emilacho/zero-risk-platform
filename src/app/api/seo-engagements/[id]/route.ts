/**
 * /api/seo-engagements/[id]
 *  GET    → fetch one engagement (with deliverables count)
 *  PATCH  → update status / playbook / agent_outputs (n8n stages call this)
 *
 * Note: [id] accepts both UUID id and the caller-supplied task_id for n8n simplicity.
 */
import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { checkInternalKey } from '@/lib/internal-auth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function findEngagement(id: string) {
  const supabase = getSupabaseAdmin()
  const col = UUID_RE.test(id) ? 'id' : 'task_id'
  return supabase.from('seo_engagements').select('*').eq(col, id).maybeSingle()
}

export async function GET(_request: Request, ctx: { params: { id: string } }) {
  const { data, error } = await findEngagement(ctx.params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const supabase = getSupabaseAdmin()
  const { count } = await supabase
    .from('seo_deliverables')
    .select('*', { count: 'exact', head: true })
    .eq('engagement_id', data.id)

  return NextResponse.json({ engagement: data, deliverables_count: count ?? 0 })
}

export async function PATCH(request: Request, ctx: { params: { id: string } }) {
  const auth = checkInternalKey(request)
  if (!auth.ok) return NextResponse.json({ error: 'unauthorized', detail: auth.reason }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const allowed = ['status', 'playbook', 'agent_outputs', 'raw_data', 'cost_usd', 'completed_at']
  const updates: Record<string, unknown> = {}
  for (const k of allowed) if (k in body) updates[k] = body[k]
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'no updatable fields in body' }, { status: 400 })
  }
  ;(updates as Record<string, unknown>).updated_at = new Date().toISOString()

  const found = await findEngagement(ctx.params.id)
  if (found.error) return NextResponse.json({ error: found.error.message }, { status: 500 })
  if (!found.data) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('seo_engagements')
    .update(updates)
    .eq('id', found.data.id)
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ engagement: data })
}
