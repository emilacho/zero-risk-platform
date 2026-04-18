/**
 * HITL Approvals — PENDING list (V3)
 *
 * Called by HITL Inbox Processor workflow (cron every 15 min).
 * Returns items from hitl_pending_approvals table filtered by status.
 *
 * GET ?status=pending&limit=100
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { checkInternalKey } from '@/lib/internal-auth'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const auth = checkInternalKey(request)
  if (!auth.ok) {
    return NextResponse.json({ error: 'unauthorized', detail: auth.reason }, { status: 401 })
  }

  const status = request.nextUrl.searchParams.get('status') || 'pending'
  const limit = Math.min(Number(request.nextUrl.searchParams.get('limit') || '100'), 500)
  const client_id = request.nextUrl.searchParams.get('client_id')

  const supabase = getSupabaseAdmin()
  let query = supabase
    .from('hitl_pending_approvals')
    .select('*')
    .order('created_at', { ascending: true })
    .limit(limit)

  if (status !== 'all') query = query.eq('status', status)
  if (client_id) query = query.eq('client_id', client_id)

  const { data, error } = await query

  if (error) {
    console.error('[hitl/approvals/pending] query error:', error)
    return NextResponse.json({ error: 'db_error', detail: error.message }, { status: 500 })
  }

  return NextResponse.json({
    items: data || [],
    count: (data || []).length,
  })
}
