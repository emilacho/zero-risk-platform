/** GET /api/direccion/decisiones · solo lectura · llave interna. Contrato en el LISTO de CC1 del 01-nov. */
import { NextResponse } from 'next/server'
import { leerDecisiones } from '@/lib/direccion/decisiones'
import { checkInternalKey } from '@/lib/internal-auth'
import { getSupabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(request: Request) {
  const auth = checkInternalKey(request)
  if (!auth.ok) return NextResponse.json({ error: 'unauthorized', detail: auth.reason }, { status: 401 })
  try {
    return NextResponse.json(await leerDecisiones({ db: getSupabaseAdmin(), ahora: () => new Date() }))
  } catch {
    return NextResponse.json({ ok: false, error: 'direccion_error', detalle: 'no se pudo armar la respuesta' }, { status: 500 })
  }
}
