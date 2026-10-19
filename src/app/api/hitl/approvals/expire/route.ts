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
import { validateObject } from '@/lib/input-validator'
import { aprobacionLegada, crearAprobacion, resolverAprobacion, TABLA_BANDEJA } from '@/lib/hitl/bandeja'

export const dynamic = 'force-dynamic'
export const maxDuration = 15

export async function POST(request: NextRequest) {
  const auth = checkInternalKey(request)
  if (!auth.ok) {
    return NextResponse.json({ error: 'unauthorized', detail: auth.reason }, { status: 401 })
  }

  const _raw = await request.json().catch(() => null)
  if (!_raw) return NextResponse.json({ error: 'invalid_json', code: 'E-INPUT-PARSE' }, { status: 400 })
  const _v = validateObject<Record<string, unknown>>(_raw, 'hitl-action')
  if (!_v.ok) return _v.response
  const body = _v.data as Record<string, any>
  if (!body || !body.item_id) {
    return NextResponse.json({ error: 'missing item_id' }, { status: 400 })
  }

  const supabase = getSupabaseAdmin()

  // 1. Fetch current item. La bandeja es una sola (`hitl_queue`, arreglo 3 · 19-oct): el vencimiento queda como «rechazada» con `decision.vencida = true` (el catálogo no admite «expired»).
  const { data: fila, error: fetchErr } = await supabase
    .from(TABLA_BANDEJA)
    .select('*')
    .eq('id', body.item_id)
    .maybeSingle()

  if (fetchErr) {
    return NextResponse.json({ error: 'db_error', detail: fetchErr.message }, { status: 500 })
  }
  if (!fila) {
    return NextResponse.json({ error: 'not_found', item_id: body.item_id }, { status: 404 })
  }
  const item = aprobacionLegada(fila)
  if (item.status !== 'pending' && item.status !== 'notified') {
    return NextResponse.json({ ok: true, already: item.status, item_id: body.item_id })
  }

  // 2. Mark as expired
  const { error: updateErr } = await resolverAprobacion(supabase, String(body.item_id), { decision: 'rejected', quien: 'hitl-inbox-processor', vencida: true, nota: 'no aprobada antes de su fecha' })

  if (updateErr) {
    return NextResponse.json({ error: 'db_error', detail: updateErr }, { status: 500 })
  }

  // 3. If escalation_path provided, enqueue new escalation item
  let escalationId: string | null = null
  const escalationPath = body.escalation_path || item.escalation_path
  if (escalationPath) {
    const escalated = await crearAprobacion(supabase, {
      approval_type: `escalation:${item.approval_type}`,
      required_approver: escalationPath,
      escalation_path: null, // no further auto-escalation
      request_id: item.request_id,
      client_id: item.client_id,
      phase: item.phase,
      payload: {
        ...((item.payload as Record<string, unknown>) || {}),
        _escalated_from: item.item_id,
        _escalated_at: new Date().toISOString(),
        _original_age_minutes: body.age_minutes,
      },
      expires_at: new Date(Date.now() + 24 * 3600 * 1000).toISOString(), // 24h for escalation
      origen: 'escalada',
    })
    escalationId = escalated.id
  }

  return NextResponse.json({
    ok: true,
    item_id: body.item_id,
    expired: true,
    escalated_to: escalationPath,
    escalation_item_id: escalationId,
  })
}
