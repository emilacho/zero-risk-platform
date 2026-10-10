/**
 * /api/hitl/[id]
 *  GET   → fetch one HITL item
 *  PATCH → reviewer decision: { status: 'approved'|'rejected'|'edited', reviewer, decision, frase_del_aprobador?, hora_de_la_frase? }
 *
 * On approve/reject/edit we stamp decided_at AND resolved_at (el cerebro fecha la decisión con resolved_at). `frase_del_aprobador` (opcional, solo con una decisión)
 * guarda en `metadata.decision_humana` la frase del aprobador y la hora, para que una decisión humana no se confunda con el clic de un empleado.
 * On approve/reject we also (where reference_id is in metadata)
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
  if (!body.status || !['approved', 'rejected', 'edited', 'in_review', 'expired'].includes(body.status)) {
    return NextResponse.json({ error: 'status must be approved|rejected|edited|in_review|expired' }, { status: 400 })
  }
  const esDecision = body.status === 'approved' || body.status === 'rejected' || body.status === 'edited'

  // la frase del aprobador (opcional): solo con una decisión; texto de 1 a 2000 caracteres; la hora de la frase, si viene, debe ser una fecha legible
  const traeFrase = body.frase_del_aprobador !== undefined && body.frase_del_aprobador !== null
  let frase: string | null = null
  let horaDeLaFrase: string | null = null
  if (traeFrase) {
    if (typeof body.frase_del_aprobador !== 'string' || !body.frase_del_aprobador.trim() || body.frase_del_aprobador.trim().length > 2000 || !esDecision) {
      return NextResponse.json({ error: 'frase_del_aprobador_invalid', detail: 'la frase es un texto de 1 a 2000 caracteres y solo va con approved|rejected|edited' }, { status: 400 })
    }
    frase = body.frase_del_aprobador.trim()
    if (body.hora_de_la_frase !== undefined && body.hora_de_la_frase !== null) {
      const t = typeof body.hora_de_la_frase === 'string' ? Date.parse(body.hora_de_la_frase) : NaN
      if (Number.isNaN(t)) return NextResponse.json({ error: 'hora_de_la_frase_invalid', detail: 'fecha ilegible' }, { status: 400 })
      horaDeLaFrase = new Date(t).toISOString()
    }
  }

  const supabase = getSupabaseAdmin()
  const updates: Record<string, unknown> = {
    status: body.status,
    reviewer: body.reviewer ?? null,
    decision: body.decision ?? {},
  }
  const hora = new Date().toISOString()
  if (esDecision) {
    updates.decided_at = hora
    updates.resolved_at = hora
  }
  if (frase !== null) {
    // se lee lo que ya traía la fila para no borrarlo; sin frase NO se lee ni se escribe `metadata` (la ruta de hoy)
    const { data: previa } = await supabase.from('hitl_queue').select('metadata').eq('id', ctx.params.id).maybeSingle()
    if (!previa) return NextResponse.json({ error: 'not_found' }, { status: 404 })
    updates.metadata = {
      ...(previa.metadata !== null && typeof previa.metadata === 'object' && !Array.isArray(previa.metadata) ? (previa.metadata as Record<string, unknown>) : {}), // un `metadata` que no es un objeto se trata como {}
      decision_humana: { frase, hora, estado: body.status, reviewer: body.reviewer ?? null, ...(horaDeLaFrase ? { hora_de_la_frase: horaDeLaFrase } : {}) },
    }
  }

  const { data, error } = await supabase.from('hitl_queue').update(updates).eq('id', ctx.params.id).select().single()
  if (error) {
    // la tabla solo admite pending|approved|rejected|edited: «expired» e «in_review» pasan la puerta de esta ruta (como siempre) pero la base los rechaza (23514).
    // Se dice claro en vez de un 500 genérico: una pieza vencida se cierra con rejected + decision.vencida = true (lo que hace el vigía de la oficina).
    if (error.code === '23514') {
      return NextResponse.json({ error: 'estado_no_admitido_por_la_bandeja', detail: `la bandeja no admite el estado «${body.status}»; para cerrar una pieza vencida use rejected con decision.vencida = true` }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

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
