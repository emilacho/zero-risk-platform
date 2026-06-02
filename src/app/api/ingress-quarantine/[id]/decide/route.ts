/**
 * /api/ingress-quarantine/[id]/decide · POST HITL decision canon canonical
 *
 * Spec · ADR-012 §5.3 quarantine workflow + R7 #3 audit own panel canon §150 G4
 *
 * Canon canonical · admin-only · internal-auth · accepts canon canonical
 * decision values · updates status + writes audit trail.
 *
 * Decision values canon canonical ·
 *   - 'approve' → status='approved' · payload procesa downstream (NO downstream
 *     canon canonical hoy · build phase only · canonical-future)
 *   - 'reject' → status='rejected' · payload descartado
 *   - 'add_deny_pattern' → operator agrega pattern al canon · status='rejected'
 *
 * Canon canonical · status quo canon canonical SOLO actualiza ingress_quarantine
 * row + opcionalmente inserta a ingress_deny_patterns. Event log emit (sala ·
 * ADR-018) canonical NO en build phase · operator manualmente trazable via
 * `hitl_decided_by` + `hitl_decided_at` + `hitl_reason`.
 */
import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { checkInternalKey } from '@/lib/internal-auth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const VALID_DECISIONS = ['approve', 'reject', 'add_deny_pattern'] as const
type ValidDecision = (typeof VALID_DECISIONS)[number]

interface DecideBody {
  decision: ValidDecision
  reason?: string
  add_pattern?: {
    pattern_id: string
    pattern_regex: string
    description: string
    severity: 'LOW' | 'MEDIUM' | 'HIGH'
    locale?: 'en' | 'es' | 'all'
  }
}

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function POST(request: Request, ctx: RouteContext) {
  const auth = checkInternalKey(request)
  if (!auth.ok) {
    return NextResponse.json({ error: 'unauthorized', detail: auth.reason }, { status: 401 })
  }

  const { id } = await ctx.params
  if (!id || typeof id !== 'string') {
    return NextResponse.json({ error: 'missing_id' }, { status: 400 })
  }

  const body = (await request.json().catch(() => null)) as DecideBody | null
  if (!body || !VALID_DECISIONS.includes(body.decision)) {
    return NextResponse.json(
      { error: 'invalid_decision', valid: VALID_DECISIONS },
      { status: 400 },
    )
  }

  const supabase = getSupabaseAdmin()
  const decidedBy = request.headers.get('x-actor') ?? 'admin_emilio'
  const now = new Date().toISOString()

  const newStatus = body.decision === 'approve' ? 'approved' : 'rejected'

  const { error: updateErr } = await supabase
    .from('ingress_quarantine')
    .update({
      status: newStatus,
      hitl_decided_by: decidedBy,
      hitl_decided_at: now,
      hitl_reason: body.reason ?? null,
    })
    .eq('id', id)
    .eq('status', 'pending') // canon canonical · only transition pending → terminal

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 })
  }

  // canon canonical · if add_deny_pattern provided · insert canonical
  if (body.decision === 'add_deny_pattern' && body.add_pattern) {
    const p = body.add_pattern
    const { error: insertErr } = await supabase.from('ingress_deny_patterns').insert({
      pattern_id: p.pattern_id,
      pattern_regex: p.pattern_regex,
      description: p.description,
      severity: p.severity,
      scope: 'global',
      scope_value: null,
      locale: p.locale ?? 'all',
      is_active: true,
      version: 1,
      created_by: decidedBy,
    })
    if (insertErr) {
      return NextResponse.json({ error: insertErr.message, hint: 'quarantine_updated_pattern_failed' }, { status: 500 })
    }
  }

  return NextResponse.json({
    ok: true,
    id,
    status: newStatus,
    decided_by: decidedBy,
    decided_at: now,
  })
}
