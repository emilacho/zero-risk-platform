/**
 * HITL Approvals — EXPIRE (V3)
 *
 * Called by HITL Inbox Processor when items exceed expiration threshold.
 * Marks item as expired + optionally escalates to escalation_path.
 *
 * POST body:
 *   {
 *     item_id: string,           // required
 *     approval_type?: string,    // echoed in response
 *     age_minutes?: number,
 *     escalation_path?: string   // if provided, creates new item for escalation
 *   }
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { checkInternalKey } from '@/lib/internal-auth'

export const dynamic = 'force-dynamic'
export const maxDuration = 15

export async function POST(request: NextRequest) {
  const auth = checkInternalKey(request)
  if (!auth.ok) {
    return NextResponse.json({ error: 'unauthorized', detail: auth.reason }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  if (!body || !body.item_id) {
    return NextResponse.json({ error: 'missing item_id' }, { status: 400 })
  }

  const supabase = getSupabaseAdmin()

  // 1. Fetch current item
  const { data: item, error: fetchErr } = await supabase
    .from('hitl_pending_approvals')
    .select('*')
    .eq('item_id', body.item_id)
    .maybeSingle()

  if (fetchErr) {
    return NextResponse.json({ error: 'db_error', detail: fetchErr.message }, { status: 500 })
  }
  if (!item) {
    return NextResponse.json({ error: 'not_found', item_id: body.item_id }, { status: 404 })
  }
  if (item.status !== 'pending' && item.status !== 'notified') {
    return NextResponse.json({ ok: true, already: item.status, item_id: body.item_id })
  }

  // 2. Mark as expired
  const { error: updateErr } = await supabase
    .from('hitl_pending_approvals')
    .update({ status: 'expired' })
    .eq('item_id', body.item_id)

  if (updateErr) {
    return NextResponse.json({ error: 'db_error', detail: updateErr.message }, { status: 500 })
  }

  // 3. If escalation_path provided, enqueue new escalation item
  let escalationId: string | null = null
  const escalationPath = body.escalation_path || item.escalation_path
  if (escalationPath) {
    const { data: escalated } = await supabase
      .from('hitl_pending_approvals')
      .insert({
        approval_type: `escalation:${item.approval_type}`,
        required_approver: escalationPath,
        escalation_path: null, // no further auto-escalation
        request_id: item.request_id,
        client_id: item.client_id,
        phase: item.phase,
        payload: {
          ...(item.payload || {}),
          _escalated_from: item.item_id,
          _escalated_at: new Date().toISOString(),
          _original_age_minutes: body.age_minutes,
        },
        status: 'pending',
        expires_at: new Date(Date.now() + 24 * 3600 * 1000).toISOString(), // 24h for escalation
      })
      .select('item_id')
      .single()
    escalationId = escalated?.item_id || null
  }

  return NextResponse.json({
    ok: true,
    item_id: body.item_id,
    expired: true,
    escalated_to: escalationPath,
    escalation_item_id: escalationId,
  })
}
