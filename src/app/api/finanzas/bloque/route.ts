/**
 * POST /api/finanzas/bloque · el bloque de números de la oficina financiera (F2 · CC#1 · 14-oct). NADIE la llama todavía y la oficina nace APAGADA:
 * con `finanzas_config.estado = 'apagada'` devuelve 409 (no calcula, no escribe, no gasta; tampoco en `dry_run`).
 * Llave: `x-api-key` = `INTERNAL_API_KEY` (nunca `SALA_DISPATCH_KEY`). Cuerpo: `{ client_id, dry_run (booleano, obligatorio), entrada, workflow_execution_id? }`.
 * Nunca bloquea al plan: entrada inválida = 422 con motivos y `sin_bloque: true`.
 */
import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { almacenDeFinanzas, type Db } from '@/lib/finanzas/almacen-supabase'
import { checkInternalKey, manejarBloque } from '@/lib/finanzas/ruta'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(request: Request) {
  const auth = checkInternalKey(request)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
  let cuerpo: unknown
  try { cuerpo = await request.json() } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }) }
  const r = await manejarBloque(cuerpo, almacenDeFinanzas(getSupabaseAdmin() as unknown as Db))
  return NextResponse.json(r.cuerpo, { status: r.status })
}
