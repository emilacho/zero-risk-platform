/**
 * POST /api/social/publicar-aprobado
 *
 * Publica un elemento que la bandeja APROBÓ (lote de publicación o pieza de la oficina).
 *  · por defecto, o con `real: false`: ENSAYO · arma la solicitud exacta que se mandaría a Meta (sin la llave) con las cuentas de la ficha del cliente y la guarda.
 *  · `real: true` (el booleano): publica DE VERDAD en las cuentas de la ficha, solo si la ficha tiene `redes_oficiales.publicacion_real: true`; una sola vez.
 *    Solo orgánico: nada de pauta ni promoción.
 * Idempotente: lo ya guardado (ensayo o publicación) se devuelve sin rehacerlo.
 *
 * Auth · `x-api-key: INTERNAL_API_KEY`.   Body · { hitl_id: uuid, real?: boolean }
 * 200 · { ok, ensayo | real, ya_estaba }   404 · no_existe
 * 409 · no_aprobado | tipo_no_publicable | lote_ausente | cliente_distinto | real_invalido | publicacion_real_apagada | no_publicable | entrega_caducada | programada_no_soportada
 */
import { NextResponse } from 'next/server'
import { checkInternalKey } from '@/lib/internal-auth'
import { getSupabaseAdmin } from '@/lib/supabase'
import { publicarAprobado } from '@/lib/publicacion/en-ensayo'
import { puertosDePublicacion } from '@/lib/publicacion/almacen-supabase'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 800

export async function POST(request: Request) {
  const auth = checkInternalKey(request)
  if (!auth.ok) return NextResponse.json({ ok: false, error: 'unauthorized', detail: auth.reason }, { status: 401 })
  const cuerpo = (await request.json().catch(() => null)) as Record<string, unknown> | null
  const hitl_id = cuerpo && typeof cuerpo.hitl_id === 'string' ? cuerpo.hitl_id.trim() : ''
  if (!hitl_id) return NextResponse.json({ ok: false, error: 'hitl_id_requerido' }, { status: 400 })
  try {
    const r = await publicarAprobado(puertosDePublicacion(getSupabaseAdmin()), { hitl_id, real: cuerpo?.real })
    return NextResponse.json(r, { status: r.ok ? 200 : r.status })
  } catch (e) {
    return NextResponse.json({ ok: false, error: 'bandeja_no_disponible', detail: e instanceof Error ? e.message : String(e) }, { status: 503 })
  }
}
