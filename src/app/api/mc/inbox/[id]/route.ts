/**
 * PATCH /api/mc/inbox/{id} — resolver mensaje (approve/reject/read)
 * DELETE /api/mc/inbox/{id} — eliminar mensaje
 *
 * Este es el endpoint que faltaba en Mission Control (GAP #7 de HITL_FINDINGS_S33).
 * Permite a Emilio aprobar/rechazar desde MC inbox con una sola llamada.
 *
 * Body: {
 *   decision?: "approved" | "rejected" | "acknowledged"
 *   notes?: string
 *   hitl_step_id?: string   — si hay un pipeline step pendiente → llama /api/hitl/resolve
 *   hitl_approval_id?: string — si hay hitl_pending_approvals item → llama /api/hitl/submit-approval
 * }
 */
import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { sanitizeString } from '@/lib/validation'

const MASTER_PASSWORD = process.env.MC_MASTER_PASSWORD || 'zerorisk2026'
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://zero-risk-platform.vercel.app'

function checkAuth(request: Request): boolean {
  const url = new URL(request.url)
  return url.searchParams.get('masterPassword') === MASTER_PASSWORD
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const id = params.id
  let body: Record<string, unknown> = {}
  try { body = await request.json() } catch { body = {} }

  const decision = body.decision as string | undefined
  const notes = sanitizeString(String(body.notes || ''), 2000)
  const hitlStepId = body.hitl_step_id as string | undefined
  const hitlApprovalId = body.hitl_approval_id as string | undefined

  const supabase = getSupabaseAdmin()

  // 1. Update inbox message
  const updates: Record<string, unknown> = {}
  if (decision) {
    updates.decision = decision
    updates.decided_at = new Date().toISOString()
    updates.decided_by = 'emilio'
    updates.decision_notes = notes || null
    updates.status = 'resolved'
  } else {
    // Just mark as read
    updates.status = 'read'
    updates.read_at = new Date().toISOString()
  }

  const { data: msg, error } = await supabase
    .from('mission_control_inbox')
    .update(updates)
    .eq('id', id)
    .select('id, type, hitl_step_id, hitl_approval_id')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const results: Record<string, unknown> = { message_updated: true, id, decision, status: 'resolved' }

  // 2. If there's a HITL step linked → call /api/hitl/resolve
  const resolveStepId = hitlStepId || msg?.hitl_step_id
  if (resolveStepId && decision && ['approved', 'rejected'].includes(decision)) {
    try {
      const resolveRes = await fetch(`${BASE_URL}/api/hitl/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          step_id: resolveStepId,
          decision: decision === 'acknowledged' ? 'approved' : decision,
          feedback: notes || undefined,
        }),
      })
      const resolveData = await resolveRes.json()
      results.pipeline_resume = resolveData
    } catch (e) {
      results.pipeline_resume_error = e instanceof Error ? e.message : 'unknown'
    }
  }

  // 3. If there's a hitl_pending_approvals item linked → call /api/hitl/submit-approval
  const approvalId = hitlApprovalId || msg?.hitl_approval_id
  if (approvalId && decision) {
    try {
      const approvalRes = await fetch(`${BASE_URL}/api/hitl/submit-approval`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-internal-key': process.env.INTERNAL_API_KEY || '',
        },
        body: JSON.stringify({
          item_id: approvalId,
          decision: decision === 'acknowledged' ? 'approved' : decision,
          resolver: 'emilio',
        }),
      })
      const approvalData = await approvalRes.json()
      results.hitl_approval = approvalData
    } catch (e) {
      results.hitl_approval_error = e instanceof Error ? e.message : 'unknown'
    }
  }

  return NextResponse.json(results)
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const supabase = getSupabaseAdmin()
  const { error } = await supabase
    .from('mission_control_inbox')
    .delete()
    .eq('id', params.id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ deleted: true, id: params.id })
}
