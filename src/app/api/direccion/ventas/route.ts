/** GET /api/direccion/ventas?client_id=&desde=&hasta= · ventas del negocio en su punto de venta, días de Ecuador · solo lectura · llave interna. */
import { NextResponse } from 'next/server'
import { leerVentasDelCliente } from '@/lib/direccion/ventas-del-cliente'
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
    const r = await leerVentasDelCliente({ db: getSupabaseAdmin(), ahora: () => new Date() }, { client_id: q.get('client_id'), desde: q.get('desde'), hasta: q.get('hasta') })
    return NextResponse.json(r.cuerpo, { status: r.status })
  } catch {
    return NextResponse.json({ ok: false, error: 'direccion_error', detalle: 'no se pudo armar la respuesta' }, { status: 500 })
  }
}
