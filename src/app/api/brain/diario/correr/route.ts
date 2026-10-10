/**
 * POST /api/brain/diario/correr · los pasos 2 (comparar), 3 (limpio y ordenado) y 5 (listo para entregar) del portero diario para UN cliente. Todo código, sin modelo, US$ 0.
 * `dry_run` obligatorio y respetado desde la primera línea (con true no escribe NADA); con false exige workflow_id + workflow_execution_id. Una corrida por cliente y día. Llave interna.
 * El paso 4 (avisar) NO existe aquí: D-5 manda construir antes `output_id` en la cola de revisión. El diario nace APAGADO: nadie la llama todavía.
 */
import { NextResponse } from 'next/server'
import { checkInternalKey } from '@/lib/internal-auth'
import { getSupabaseAdmin } from '@/lib/supabase'
import type { Db } from '@/lib/cerebro/diario/correr'
import { rutaCorrer } from '@/lib/cerebro/diario/rutas'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 120

export async function POST(request: Request) {
  const auth = checkInternalKey(request)
  if (!auth.ok) return NextResponse.json({ error: 'unauthorized', code: 'E-AUTH-001', detail: auth.reason }, { status: 401 })
  let cuerpo: unknown
  try { cuerpo = await request.json() } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }) }
  try {
    const r = await rutaCorrer(getSupabaseAdmin() as unknown as Db, cuerpo)
    return NextResponse.json(r.body, { status: r.status })
  } catch (e) {
    return NextResponse.json({ error: 'diario_error', detalle: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
