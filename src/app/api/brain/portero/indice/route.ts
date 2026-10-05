/**
 * POST /api/brain/portero/indice · lo fijo + la lista numerada del cliente + el estado de cada lectura + el respaldo. SIN modelo, US$ 0.
 * Ruta NUEVA del portero del cerebro (tramo 2). Solo lectura. Auth igual a las rutas internas: `x-api-key: INTERNAL_API_KEY`.
 */
import { NextResponse } from 'next/server'
import { checkInternalKey } from '@/lib/internal-auth'
import { armarIndice } from '@/lib/cerebro/portero/indice'
import { consultaDelEntorno } from '@/lib/cerebro/portero/entorno'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(request: Request) {
  const auth = checkInternalKey(request)
  if (!auth.ok) return NextResponse.json({ error: 'unauthorized', code: 'E-AUTH-001', detail: auth.reason }, { status: 401 })
  let cuerpo: unknown
  try { cuerpo = await request.json() } catch { return NextResponse.json({ error: 'invalid_json', code: 'E-INPUT-PARSE' }, { status: 400 }) }
  const r = await armarIndice(consultaDelEntorno(), cuerpo)
  return NextResponse.json(r.cuerpo, { status: r.status })
}
