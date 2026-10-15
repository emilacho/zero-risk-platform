/**
 * POST /api/planeacion/corrida/barrer · el barrido de las corridas del plan que pasaron su `vence_en` (lo llama un reloj de n8n; V13 · CC#2 · 15-oct). NADIE la llama todavía.
 * `esperando` vencida ⇒ `vencida` (declarado); `corriendo` vencida ⇒ `fallida`. Idempotente. Cuerpo opcional `{ dry_run?: boolean }` (true = solo cuenta).
 * Llave: `x-api-key` = `INTERNAL_API_KEY`.
 */
import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { checkInternalKey } from '@/lib/finanzas/ruta'
import { barrer, vencibles } from '@/lib/planeacion/corridas'
import { almacenDeCorridas, type Db } from '@/lib/planeacion/corridas-supabase'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(request: Request) {
  const auth = checkInternalKey(request)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const cuerpo: unknown = await request.json().catch(() => ({}))
  const dry = typeof cuerpo === 'object' && cuerpo !== null && (cuerpo as Record<string, unknown>).dry_run
  if (dry !== undefined && dry !== false && dry !== true) return NextResponse.json({ error: 'entrada_invalida', errores: ['`dry_run` debe ser verdadero o falso'] }, { status: 400 })
  try {
    const P = almacenDeCorridas(getSupabaseAdmin() as unknown as Db)
    if (dry === true) { const v = await vencibles(P); return NextResponse.json({ accion: 'dry_run', vencibles: v.map((f) => ({ id: f.id, estado: f.estado })), escribio: false }, { status: 200 }) }
    return NextResponse.json({ accion: 'barrido', ...(await barrer(P)) }, { status: 200 })
  } catch (e) {
    return NextResponse.json({ error: 'plan_corridas_error', detalle: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
