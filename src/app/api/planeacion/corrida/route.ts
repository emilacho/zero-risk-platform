/**
 * POST /api/planeacion/corrida · el estado de la corrida del plan v3 (V13 · CC#2 · 15-oct). NADIE la llama todavía; la tabla `plan_corridas` nace SIN aplicar.
 * Llave: `x-api-key` = `INTERNAL_API_KEY` (nunca `SALA_DISPATCH_KEY`). Cuerpo: `{ accion: 'abrir'|'reintentar'|'correr'|'cerrar', client_id, corrida, … }`.
 *   abrir      { dry_run } → crea (insert-once) o continúa; 409 `corrida_activa` si el cliente ya tiene OTRA corrida viva.
 *   reintentar { intentos_esperado } → compare-and-set; `perdiste_la_carrera` si otro re-disparo ganó.
 *   correr     { motivo? } → de `esperando` a `corriendo` (con el techo de una corrida en marcha).
 *   cerrar     { estado: 'hecha'|'fallida', motivo? }
 */
import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { checkInternalKey } from '@/lib/finanzas/ruta'
import { abrir, cerrar, correr, reintentar } from '@/lib/planeacion/corridas'
import { almacenDeCorridas, type Db } from '@/lib/planeacion/corridas-supabase'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(request: Request) {
  const auth = checkInternalKey(request)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
  let c: Record<string, unknown>
  try { const j: unknown = await request.json(); if (typeof j !== 'object' || j === null || Array.isArray(j)) throw new Error('no objeto'); c = j as Record<string, unknown> } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }) }
  const P = almacenDeCorridas(getSupabaseAdmin() as unknown as Db)
  try {
    const base = { client_id: c.client_id as string, corrida: c.corrida as string }
    const r =
      c.accion === 'abrir' ? await abrir(P, { ...base, dry_run: c.dry_run as boolean })
      : c.accion === 'reintentar' ? await reintentar(P, { ...base, intentos_esperado: c.intentos_esperado as number })
      : c.accion === 'correr' ? await correr(P, { ...base, motivo: typeof c.motivo === 'string' ? c.motivo : undefined })
      : c.accion === 'cerrar' ? await cerrar(P, { ...base, estado: c.estado as 'hecha' | 'fallida', motivo: typeof c.motivo === 'string' ? c.motivo : undefined })
      : null
    if (!r) return NextResponse.json({ error: 'entrada_invalida', errores: ['`accion` debe ser abrir, reintentar, correr o cerrar'] }, { status: 400 })
    const { status, ...cuerpo } = r
    return NextResponse.json(cuerpo, { status })
  } catch (e) {
    return NextResponse.json({ error: 'plan_corridas_error', detalle: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
