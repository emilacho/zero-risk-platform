/**
 * POST /api/finanzas/tablero · leer o firmar un tablero de la oficina financiera (F2/F4 · CC#1 · 14-oct). APAGADA = 409 (como `/bloque`).
 *  · `{ accion: 'leer', finanzas_id, client_id? }` → el bloque, sus números y su resumen en texto llano (lo que usa el plan). Un tablero de OTRO cliente no se entrega (404).
 *  · `{ accion: 'firmar', finanzas_id, dry_run (booleano), hallazgos[], correcciones_hechas }` → la firma es un acto de CÓDIGO: huella íntegra y sin críticos tras la única corrección.
 * Llave: `x-api-key` = `INTERNAL_API_KEY` (nunca `SALA_DISPATCH_KEY`).
 */
import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { almacenDeFinanzas, type Db } from '@/lib/finanzas/almacen-supabase'
import { checkInternalKey, manejarTablero } from '@/lib/finanzas/ruta'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(request: Request) {
  const auth = checkInternalKey(request)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
  let cuerpo: unknown
  try { cuerpo = await request.json() } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }) }
  const r = await manejarTablero(cuerpo, almacenDeFinanzas(getSupabaseAdmin() as unknown as Db))
  return NextResponse.json(r.cuerpo, { status: r.status })
}
