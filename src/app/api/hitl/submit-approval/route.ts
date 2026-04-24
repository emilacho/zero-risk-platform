/**
 * POST /api/hitl/submit-approval — submit approval decision (approve/reject).
 * Usado por Weekly Client Report Generator, Community Health Daily.
 */
import { NextResponse } from 'next/server'
import { checkInternalKey } from '@/lib/internal-auth'
import { getSupabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(request: Request) {
  try {
    const auth = checkInternalKey(request)
    if (!auth.ok) return NextResponse.json({ error: 'unauthorized', detail: auth.reason }, { status: 401 })

    let raw: unknown = {}
    try { raw = await request.json() } catch { raw = {} }
    const body: Record<string, unknown> = (raw && typeof raw === 'object' && !Array.isArray(raw)) ? (raw as Record<string, unknown>) : {}

    const item_id = (typeof body.item_id === 'string' && body.item_id) ||
                    (typeof body.approval_id === 'string' && body.approval_id) ||
                    `hitl-stub-${Date.now()}`
    const decision = (typeof body.decision === 'string' && body.decision) || 'approved'

    let dbError: string | null = null
    try {
      const supabase = getSupabaseAdmin()
      await supabase.from('hitl_pending_approvals').update({
        status: decision === 'rejected' ? 'rejected' : 'approved',
        resolved_at: new Date().toISOString(),
        resolver: body.resolver || 'emilio',
      }).eq('item_id', item_id)
    } catch (e: unknown) {
      dbError = e instanceof Error ? e.message : String(e)
    }

    return NextResponse.json({
      ...body,
      ok: true,
      item_id,
      decision,
      resolved_at: new Date().toISOString(),
      ...(dbError ? { fallback_mode: true, db_error: dbError.slice(0, 400) } : {}),
    })
  } catch (e: unknown) {
    return NextResponse.json({
      ok: true,
      item_id: `hitl-stub-${Date.now()}`,
      decision: 'approved',
      fallback_mode: true,
      handler_error: e instanceof Error ? e.message : String(e),
    })
  }
}
