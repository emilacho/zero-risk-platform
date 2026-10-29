/**
 * POST/GET /api/brain/aprendizaje/medida · los contadores del aprendizaje (los llena la oficina). Llave interna.
 *  · POST `{ client_id, pieza_ref, aprobada_a_la_primera, cambios_pedidos?, usado_aprendizaje?, registrado_por? }`: una fila por pieza (repetir la misma pieza la actualiza).
 *  · GET `?client_id=` (opcional): piezas, aprobadas a la primera, % y cambios por pieza, con y sin aprendizaje usado.
 */
import { NextResponse } from 'next/server'
import { checkInternalKey } from '@/lib/internal-auth'
import { getSupabaseAdmin } from '@/lib/supabase'
import type { Db } from '@/lib/portero-alimenta/alimentar'
import { leerMedidas, registrarMedida } from '@/lib/portero-alimenta/aprendizaje/medidas'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 30

export async function POST(request: Request) {
  const auth = checkInternalKey(request)
  if (!auth.ok) return NextResponse.json({ error: 'unauthorized', code: 'E-AUTH-001', detail: auth.reason }, { status: 401 })
  let cuerpo: unknown
  try { cuerpo = await request.json() } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }) }
  try {
    const r = await registrarMedida(getSupabaseAdmin() as unknown as Db, cuerpo)
    return NextResponse.json(r.body, { status: r.status })
  } catch (e) { return NextResponse.json({ error: 'medida_error', detalle: e instanceof Error ? e.message : String(e) }, { status: 500 }) }
}
export async function GET(request: Request) {
  const auth = checkInternalKey(request)
  if (!auth.ok) return NextResponse.json({ error: 'unauthorized', code: 'E-AUTH-001', detail: auth.reason }, { status: 401 })
  try {
    const r = await leerMedidas(getSupabaseAdmin() as unknown as Db, new URL(request.url).searchParams.get('client_id'))
    return NextResponse.json(r.body, { status: r.status })
  } catch (e) { return NextResponse.json({ error: 'medida_error', detalle: e instanceof Error ? e.message : String(e) }, { status: 500 }) }
}
