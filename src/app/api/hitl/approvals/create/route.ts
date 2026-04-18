/**
 * HITL Approvals — CREATE (V3)
 *
 * Called by NEXUS + RUFLO + any agent when hitting an HITL gate.
 * Writes to hitl_pending_approvals table (V3 schema, separate from V2 hitl_queue).
 *
 * POST body:
 *   {
 *     approval_type: string,           // required — e.g., "phase_fail_max_retries"
 *     required_approver?: string,      // default "emilio"
 *     escalation_path?: string,        // e.g., "jefe-client-success"
 *     request_id?: string,
 *     client_id?: string,
 *     phase?: string,
 *     payload?: any,
 *     expires_in_hours?: number        // default 72
 *   }
 *
 * Returns: { ok, item_id, expires_at }
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
  if (!body || typeof body !== 'object' || !body.approval_type) {
    return NextResponse.json(
      { error: 'missing_fields', required: ['approval_type'] },
      { status: 400 }
    )
  }

  const expiresHours = typeof body.expires_in_hours === 'number' ? body.expires_in_hours : 72
  const expiresAt = new Date(Date.now() + expiresHours * 3600 * 1000).toISOString()

  // Accept both `context` (what workflows send) and `payload` (canonical name)
  const payload = body.context || body.payload || {}
  const validPriority = new Set(['low', 'medium', 'high', 'critical'])
  const priority = validPriority.has(body.priority) ? body.priority : 'medium'

  const row = {
    approval_type: body.approval_type,
    required_approver: body.required_approver || 'emilio',
    escalation_path: body.escalation_path || null,
    request_id: body.request_id || null,
    client_id: body.client_id || null,
    phase: body.phase || null,
    priority,
    payload,
    status: 'pending' as const,
    expires_at: expiresAt,
  }

  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('hitl_pending_approvals')
    .insert(row)
    .select()
    .single()

  if (error) {
    console.error('[hitl/approvals/create] insert error:', error)
    return NextResponse.json({ error: 'db_error', detail: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, item_id: data.item_id, expires_at: data.expires_at })
}
