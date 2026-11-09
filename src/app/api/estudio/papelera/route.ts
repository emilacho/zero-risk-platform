/** EL ESTUDIO · `GET /api/estudio/papelera?client_id=…` · lo que el dueño sacó de la galería con la ✕ (se borra solo a los 30 días). Solo lectura. */
import { NextResponse } from 'next/server'
import { checkInternalKey } from '@/lib/internal-auth'
import { depsReales } from '@/lib/estudio/deps'
import { listarPapelera } from '@/lib/estudio/servicio'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(request: Request) {
  const auth = checkInternalKey(request)
  if (!auth.ok) return NextResponse.json({ error: 'unauthorized', detail: auth.reason }, { status: 401 })
  try {
    const r = await listarPapelera(depsReales(), new URL(request.url).searchParams.get('client_id') ?? '')
    if (!r.ok) return NextResponse.json({ error: r.error, detalle: r.detalle }, { status: r.status })
    return NextResponse.json({ ok: true, piezas: r.valor })
  } catch (e) {
    return NextResponse.json({ error: 'lectura_fallida', detalle: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
