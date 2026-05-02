/**
 * /api/hitl/[id]
 *  GET   → fetch one HITL item
 *  PATCH → reviewer decision: { status: 'approved'|'rejected', reviewer, decision }
 *
 * On approve/reject we stamp decided_at and (where reference_id is in metadata)
 * also bump the linked seo_engagement / content_package / experiment status.
 */
import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { checkInternalKey } from '@/lib/internal-auth'
import { validateObject } from '@/lib/input-validator'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(_request: Request, ctx: { params: { id: string } }) {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase.from('hitl_queue').select('*').eq('id', ctx.params.id).maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  return NextResponse.json({ item: data })
}

export async function PATCH(request: Request, ctx: { params: { id: string } }) {
  const auth = checkInternalKey(request)
  if (!auth.ok) return NextResponse.json({ error: 'unauthorized', detail: auth.reason }, { status: 401 })

  const _raw = await request.json().catch(() => ({}))
  const _v = validateObject<Record<string, unknown>>(_raw, 'hitl-action')
  if (!_v.ok) return _v.response
  const body = _v.data as Record<string, any>
  if (!body.status || !['approved', 'rejected', 'in_review', 'expired'].includes(body.status)) {
    return NextResponse.json({ error: 'status must be approved|rejected|in_review|expired' }, { status: 400 })
  }

  const supabase = getSupabaseAdmin()
  const updates: Record<string, unknown> = {
    status: body.status,
    reviewer: body.reviewer ?? null,
    decision: body.decision ?? {},
  }
  if (body.status === 'approved' || body.status === 'rejected') {
    updates.decided_at = new Date().toISOString()
  }

  const { data, error } = await supabase.from('hitl_queue').update(updates).eq('id', ctx.params.id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Side-effect: propagate decision to the source entity, if metadata says so.
  const meta = (data?.metadata ?? {}) as Record<string, unknown>
  const newStatus = body.status === 'approved' ? 'approved' : body.status === 'rejected' ? 'failed' : null
  if (newStatus) {
    const tableForType: Record<string, string> = {
      seo_playbook_review: 'seo_engagements',
      content_package_review: 'content_packages',
      review_response_approval: 'review_metrics',
      experiment_launch_review: 'experiments',
      client_report_review: 'client_reports',
    }
    const table = tableForType[data.type as string]
    const refId = (meta.task_id ?? meta.engagement_id ?? meta.content_package_id ?? meta.experiment_id ?? meta.report_id) as string | undefined
    if (table && refId) {
      // Best-effort; ignore errors so HITL update still wins.
      const col = table === 'seo_engagements' ? 'task_id' : 'id'
      await supabase.from(table).update({ status: newStatus }).eq(col, refId)
    }
  }

  return NextResponse.json({ item: data })
}
