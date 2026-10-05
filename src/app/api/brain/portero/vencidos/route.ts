/**
 * GET|POST /api/brain/portero/vencidos · «qué vence o venció de este cliente en N días». SOLO LECTURA, sin modelo, US$ 0.
 *   GET  ?cliente=<id>&dias=7        POST { "cliente": "<id>", "dias": 7 }
 * Ruta NUEVA del portero del cerebro. Auth igual a las otras rutas del portero: `x-api-key: INTERNAL_API_KEY`.
 */
import { NextResponse } from 'next/server'
import { checkInternalKey } from '@/lib/internal-auth'
import { consultaDelEntorno } from '@/lib/cerebro/portero/entorno'
import { armarVencidos } from '@/lib/cerebro/portero/vencidos'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

const noAutorizado = (razon: string) => NextResponse.json({ error: 'unauthorized', code: 'E-AUTH-001', detail: razon }, { status: 401 })

export async function GET(request: Request) {
  const auth = checkInternalKey(request)
  if (!auth.ok) return noAutorizado(auth.reason)
  const q = new URL(request.url).searchParams
  const r = await armarVencidos(consultaDelEntorno(), { cliente: q.get('cliente') ?? undefined, dias: q.get('dias') ?? undefined })
  return NextResponse.json(r.cuerpo, { status: r.status })
}

export async function POST(request: Request) {
  const auth = checkInternalKey(request)
  if (!auth.ok) return noAutorizado(auth.reason)
  let cuerpo: unknown
  try { cuerpo = await request.json() } catch { return NextResponse.json({ error: 'invalid_json', code: 'E-INPUT-PARSE' }, { status: 400 }) }
  const r = await armarVencidos(consultaDelEntorno(), cuerpo)
  return NextResponse.json(r.cuerpo, { status: r.status })
}
