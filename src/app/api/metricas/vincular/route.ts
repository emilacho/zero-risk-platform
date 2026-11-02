/**
 * POST /api/metricas/vincular · esta publicación es de esta pieza. Nadie la llama todavía: ninguna pieza se publica sola.
 */
import { NextResponse } from 'next/server'
import { checkInternalKey } from '@/lib/internal-auth'
import { getSupabaseAdmin } from '@/lib/supabase'
import { vincularPieza, type Db } from '@/lib/metricas/metricas'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(request: Request) {
  const llave = checkInternalKey(request)
  if (!llave.ok) return NextResponse.json({ error: 'unauthorized', code: 'E-AUTH-001', detail: llave.reason }, { status: 401 })
  let cuerpo: unknown
  try { cuerpo = await request.json() } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }) }
  try {
    const r = await vincularPieza(getSupabaseAdmin() as unknown as Db, cuerpo)
    return NextResponse.json(r.body, { status: r.status })
  } catch (e) {
    return NextResponse.json({ error: 'metricas_error', detalle: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
