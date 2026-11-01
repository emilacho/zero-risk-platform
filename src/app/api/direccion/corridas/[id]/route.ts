/** GET /api/direccion/corridas/{workflow_execution_id} · el árbol de una corrida · solo lectura · llave interna. */
import { NextResponse } from 'next/server'
import { leerCorrida } from '@/lib/direccion/corridas'
import { checkInternalKey } from '@/lib/internal-auth'
import { getSupabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(request: Request, ctx: { params: { id: string } }) {
  const auth = checkInternalKey(request)
  if (!auth.ok) return NextResponse.json({ error: 'unauthorized', detail: auth.reason }, { status: 401 })
  let id: string
  try { id = decodeURIComponent(ctx.params.id) } catch { return NextResponse.json({ ok: false, error: 'entrada_invalida', detalle: 'el identificador de la ejecución no es válido' }, { status: 400 }) }
  try {
    const r = await leerCorrida({ db: getSupabaseAdmin(), ahora: () => new Date() }, id)
    return NextResponse.json(r.cuerpo, { status: r.status })
  } catch {
    return NextResponse.json({ ok: false, error: 'direccion_error', detalle: 'no se pudo armar la respuesta' }, { status: 500 })
  }
}
