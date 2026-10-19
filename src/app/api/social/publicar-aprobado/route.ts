/**
 * POST /api/social/publicar-aprobado
 *
 * Arma la publicación de un lote que la bandeja APROBÓ, SOLO EN ENSAYO: la solicitud exacta que se mandaría a Meta (sin la llave), qué configuración hay y qué falta.
 * No llama a Meta. Publicar de verdad no está construido: `real: true` responde 409 `real_no_habilitado`.
 * Idempotente: si el ensayo ya está guardado en el elemento de la bandeja, lo devuelve sin rehacerlo.
 *
 * Auth · `x-api-key: INTERNAL_API_KEY`.   Body · { hitl_id: uuid, real?: false }
 * 200 · { ok, ensayo, ya_estaba }   404 · no_existe   409 · no_aprobado | tipo_no_publicable | lote_ausente | cliente_distinto | real_no_habilitado
 */
import { NextResponse } from 'next/server'
import { checkInternalKey } from '@/lib/internal-auth'
import { getSupabaseAdmin } from '@/lib/supabase'
import { publicarAprobado } from '@/lib/publicacion/en-ensayo'
import { puertosDePublicacion } from '@/lib/publicacion/almacen-supabase'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

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
