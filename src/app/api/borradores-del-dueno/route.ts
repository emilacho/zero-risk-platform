/**
 * /api/borradores-del-dueno · lo que el dueño marcó en el manual o el plan y aún no pidió (Emilio, 3-nov 18:13Z). US$ 0, sin modelo. Llave interna (`x-api-key`).
 *   GET    ?client_id&documento                                                   → { ok, borrador | null }
 *   PUT    { client_id, documento, documento_id, acciones, revision_base?, reviewer? } → { ok, borrador } · 409 `borrador_cambio` si otro equipo lo cambió · `acciones` vacío lo borra
 *   DELETE ?client_id&documento                                                   → { ok, borrador: null }
 */
import { NextResponse } from 'next/server'
import { checkInternalKey } from '@/lib/internal-auth'
import { getSupabaseAdmin } from '@/lib/supabase'
import { borrarBorrador, guardarBorrador, leerBorrador, type Salida } from '@/lib/manual/borrador-del-dueno'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 800

const responder = async (accion: () => Promise<Salida>) => {
  try {
    const s = await accion()
    return NextResponse.json(s.cuerpo, { status: s.status })
  } catch (e) {
    return NextResponse.json({ ok: false, error: 'borrador_error', detalle: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}

export async function GET(request: Request) {
  const llave = checkInternalKey(request)
  if (!llave.ok) return NextResponse.json({ ok: false, error: 'unauthorized', detalle: llave.reason }, { status: 401 })
  const q = new URL(request.url).searchParams
  return responder(() => leerBorrador(getSupabaseAdmin(), q.get('client_id'), q.get('documento')))
}

export async function PUT(request: Request) {
  const llave = checkInternalKey(request)
  if (!llave.ok) return NextResponse.json({ ok: false, error: 'unauthorized', detalle: llave.reason }, { status: 401 })
  let cuerpo: unknown
  try { cuerpo = await request.json() } catch { return NextResponse.json({ ok: false, error: 'invalid_json', detalle: 'el cuerpo no es JSON' }, { status: 400 }) }
  return responder(() => guardarBorrador(getSupabaseAdmin(), cuerpo))
}

export async function DELETE(request: Request) {
  const llave = checkInternalKey(request)
  if (!llave.ok) return NextResponse.json({ ok: false, error: 'unauthorized', detalle: llave.reason }, { status: 401 })
  const q = new URL(request.url).searchParams
  return responder(() => borrarBorrador(getSupabaseAdmin(), q.get('client_id'), q.get('documento')))
}
