/**
 * GET /api/metricas/resumen?client_id=…&dias=30 · lo que lee el tablero. `null` es «sin dato», nunca cero.
 */
import { NextResponse } from 'next/server'
import { checkInternalKey } from '@/lib/internal-auth'
import { getSupabaseAdmin } from '@/lib/supabase'
import { leerResumen, type Db } from '@/lib/metricas/metricas'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 800

export async function GET(request: Request) {
  const llave = checkInternalKey(request)
  if (!llave.ok) return NextResponse.json({ error: 'unauthorized', code: 'E-AUTH-001', detail: llave.reason }, { status: 401 })
  const q = new URL(request.url).searchParams
  try {
    const r = await leerResumen(getSupabaseAdmin() as unknown as Db, q.get('client_id'), q.get('dias'))
    return NextResponse.json(r.body, { status: r.status })
  } catch (e) {
    return NextResponse.json({ error: 'metricas_error', detalle: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
