/** GET /api/direccion/corridas?dias=&limite=&client_id=&workflow_id= · solo lectura · llave interna. */
import { NextResponse } from 'next/server'
import { leerCorridas } from '@/lib/direccion/corridas'
import { checkInternalKey } from '@/lib/internal-auth'
import { getSupabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(request: Request) {
  const auth = checkInternalKey(request)
  if (!auth.ok) return NextResponse.json({ error: 'unauthorized', detail: auth.reason }, { status: 401 })
  const q = new URL(request.url).searchParams
  try {
    return NextResponse.json(await leerCorridas({ db: getSupabaseAdmin(), ahora: () => new Date() }, { dias: q.get('dias') === null ? undefined : Number(q.get('dias')), limite: q.get('limite') === null ? undefined : Number(q.get('limite')), client_id: q.get('client_id'), workflow_id: q.get('workflow_id') }))
  } catch {
    return NextResponse.json({ ok: false, error: 'direccion_error', detalle: 'no se pudo armar la respuesta' }, { status: 500 })
  }
}
