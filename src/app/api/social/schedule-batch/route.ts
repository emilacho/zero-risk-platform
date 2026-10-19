/**
 * POST /api/social/schedule-batch
 *
 * La ruta que el publicador de n8n («Social Multi-Platform Publisher», nodo «Schedule Batch») llamaba y no existía.
 * NO programa ni publica nada: deja el lote de piezas en la BANDEJA (`hitl_queue`, tipo `social_batch_review`) para que se apruebe, una sola vez por `task_id`.
 * Al aprobarse en la bandeja se arma la publicación EN ENSAYO (ver /api/social/publicar-aprobado); publicar de verdad no está construido.
 *
 * Auth · `x-api-key: INTERNAL_API_KEY`.
 * Body · { client_id, task_id, piezas: [{ canal: 'instagram'|'facebook'|…, image_url?, caption?, message?, link_url? }] (1 a 10), programar_para?: ISO }
 * 201 · { ok, staged: true, hitl_id, ya_estaba, piezas }   400 · lote_invalido (con la lista de errores)   401 · sin llave
 */
import { NextResponse } from 'next/server'
import { checkInternalKey } from '@/lib/internal-auth'
import { getSupabaseAdmin } from '@/lib/supabase'
import { encolarLote } from '@/lib/publicacion/en-ensayo'
import { puertosDePublicacion } from '@/lib/publicacion/almacen-supabase'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(request: Request) {
  const auth = checkInternalKey(request)
  if (!auth.ok) return NextResponse.json({ ok: false, error: 'unauthorized', detail: auth.reason }, { status: 401 })
  const cuerpo = await request.json().catch(() => null)
  try {
    const r = await encolarLote(puertosDePublicacion(getSupabaseAdmin()), cuerpo)
    if (!r.ok) return NextResponse.json(r, { status: r.status })
    return NextResponse.json(r, { status: r.ya_estaba ? 200 : 201 })
  } catch (e) {
    return NextResponse.json({ ok: false, error: 'bandeja_no_disponible', detail: e instanceof Error ? e.message : String(e) }, { status: 503 })
  }
}
