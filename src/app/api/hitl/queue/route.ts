/**
 * /api/hitl/queue
 *  POST → enqueue an HITL item (workflows call this when output needs review)
 *         `output_id` (opcional, uuid de `client_historical_outputs`): ata la decisión a LA VERSIÓN de la pieza; sin él la fila es idéntica a la de siempre
 *  GET  → list queue (Mission Control inbox)
 *
 * Note: we keep the legacy /api/hitl/pending in place; this endpoint is the
 * "write" side that the V3 workflows expect.
 */
import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { checkInternalKey } from '@/lib/internal-auth'
import { validateObject } from '@/lib/input-validator'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(request: Request) {
  const auth = checkInternalKey(request)
  if (!auth.ok) return NextResponse.json({ error: 'unauthorized', detail: auth.reason }, { status: 401 })

  const _raw = await request.json().catch(() => ({}))
  const _v = validateObject<Record<string, unknown>>(_raw, 'hitl-action')
  if (!_v.ok) return _v.response
  const body = _v.data as Record<string, any>
  for (const f of ['type', 'title']) {
    if (!body?.[f]) return NextResponse.json({ error: `missing field: ${f}` }, { status: 400 })
  }

  // `output_id` (opcional): lo que el cerebro usa para atar la decisión del aprobador a una versión. Ausente/nulo/vacío = como siempre.
  const outputIdCrudo = body.output_id
  const traeOutputId = outputIdCrudo !== undefined && outputIdCrudo !== null && outputIdCrudo !== ''
  if (traeOutputId && !(typeof outputIdCrudo === 'string' && UUID.test(outputIdCrudo))) {
    return NextResponse.json({ error: 'output_id_invalid', detail: '`output_id` debe ser el uuid de una salida de `client_historical_outputs`' }, { status: 400 })
  }

  const supabase = getSupabaseAdmin()
  // la pieza que se aprueba tiene que ser del MISMO cliente que la fila: no se ata una decisión de un cliente a la pieza de otro (y sin `client_id` no se adivina)
  if (traeOutputId) {
    if (!body.client_id) return NextResponse.json({ error: 'client_id_required_with_output_id', detail: 'con `output_id` hace falta `client_id`' }, { status: 400 })
    const { data: salida, error: errSalida } = await supabase.from('client_historical_outputs').select('client_id').eq('id', outputIdCrudo as string).maybeSingle()
    if (errSalida) return NextResponse.json({ error: errSalida.message }, { status: 500 })
    if (!salida) return NextResponse.json({ error: 'output_id_not_found', detail: 'no existe una salida con ese `output_id`' }, { status: 400 })
    if (String(salida.client_id) !== String(body.client_id)) return NextResponse.json({ error: 'output_id_other_client', detail: 'la salida es de otro cliente' }, { status: 400 })
  }
  const row = {
    client_id: body.client_id ?? null,
    // hitl_queue carries legacy V2 NOT-NULL columns (agent_name, risk_type,
    // output_preview) that the V3 route never supplied → every insert 500'd and
    // the table stayed empty. Provide all three with sensible fallbacks.
    agent_name: body.agent_name ?? 'system',
    risk_type: body.risk_type ?? 'strategic_decision',
    output_preview: body.output_preview ?? body.title ?? '(sin preview)',
    type: body.type,
    title: body.title,
    priority: body.priority ?? 'medium',
    status: 'pending',
    payload: body.payload ?? {},
    metadata: body.metadata ?? {},
    ...(traeOutputId ? { output_id: outputIdCrudo as string } : {}),
  }
  const { data, error } = await supabase.from('hitl_queue').insert(row).select().single()
  if (error) {
    // una pieza que no existe: la llave foránea de la base lo dice; se contesta claro (400), no como una caída (500)
    if (traeOutputId && (error.code === '23503' || /foreign key/i.test(error.message ?? ''))) return NextResponse.json({ error: 'output_id_not_found', detail: 'no existe una salida con ese `output_id`' }, { status: 400 })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ item: data }, { status: 201 })
}

export async function GET(request: Request) {
  const supabase = getSupabaseAdmin()
  const url = new URL(request.url)
  const status = url.searchParams.get('status') ?? 'pending'
  const limit = Math.min(Number(url.searchParams.get('limit') ?? 100), 500)
  const clientId = url.searchParams.get('client_id')
  const type = url.searchParams.get('type')

  let q = supabase
    .from('hitl_queue')
    .select('*')
    // Order: highest priority first, then oldest first within priority.
    .order('priority', { ascending: false })
    .order('created_at', { ascending: true })
    .limit(limit)
  if (status !== 'all') q = q.eq('status', status)
  if (clientId) q = q.eq('client_id', clientId)
  if (type) q = q.eq('type', type)

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ items: data ?? [] })
}
