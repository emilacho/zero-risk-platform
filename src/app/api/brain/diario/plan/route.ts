/**
 * POST /api/brain/diario/plan · qué llamadas al Servicio de Apify pide la AMPLIACIÓN del portero diario (Mapas propio + reseñas, comentarios de las publicaciones propias, páginas de reparto).
 * SOLO LECTURA, sin modelo, US$ 0. `dry_run` obligatorio (con false exige workflow_id + workflow_execution_id). Llave interna. El corte por el tope de US$ 1,00 por cliente y día se hace aquí, en código.
 * El diario nace APAGADO: nadie la llama todavía (el flujo es inactivo).
 */
import { NextResponse } from 'next/server'
import { checkInternalKey } from '@/lib/internal-auth'
import { getSupabaseAdmin } from '@/lib/supabase'
import type { Db } from '@/lib/cerebro/diario/correr'
import { rutaPlan } from '@/lib/cerebro/diario/rutas'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 120

export async function POST(request: Request) {
  const auth = checkInternalKey(request)
  if (!auth.ok) return NextResponse.json({ error: 'unauthorized', code: 'E-AUTH-001', detail: auth.reason }, { status: 401 })
  let cuerpo: unknown
  try { cuerpo = await request.json() } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }) }
  try {
    const r = await rutaPlan(getSupabaseAdmin() as unknown as Db, cuerpo)
    return NextResponse.json(r.body, { status: r.status })
  } catch (e) {
    return NextResponse.json({ error: 'diario_error', detalle: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
