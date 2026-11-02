/** GET /api/direccion/fallas?desde=&hasta=&client_id= · las fallas del flujo, días de Ecuador · solo lectura · llave interna. */
import { NextResponse } from 'next/server'
import { leerFallasDelFlujo } from '@/lib/direccion/fallas'
import { checkInternalKey } from '@/lib/internal-auth'
import { getSupabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 800

export async function GET(request: Request) {
  const auth = checkInternalKey(request)
  if (!auth.ok) return NextResponse.json({ error: 'unauthorized', detail: auth.reason }, { status: 401 })
  const q = new URL(request.url).searchParams
  try {
    const r = await leerFallasDelFlujo({ db: getSupabaseAdmin(), ahora: () => new Date() }, { desde: q.get('desde'), hasta: q.get('hasta'), client_id: q.get('client_id') })
    return NextResponse.json(r.cuerpo, { status: r.status })
  } catch {
    return NextResponse.json({ ok: false, error: 'direccion_error', detalle: 'no se pudo armar la respuesta' }, { status: 500 })
  }
}
