/**
 * POST /api/brain/alimentar/competidores · el dueño confirma (una vez) a qué competidores se vigila: `{ client_id, nombres: string[], dry_run }`.
 * Solo nombres que ya están en `competitor_list` de la ficha; máximo 5; no toca nada más de la config. `dry_run` obligatorio. Llave interna (`x-api-key`).
 * No enciende nada: el brazo de competencia sigue APAGADO hasta `PORTERO_BRAZO_COMPETENCIA=on`.
 */
import { NextResponse } from 'next/server'
import { checkInternalKey } from '@/lib/internal-auth'
import { getSupabaseAdmin } from '@/lib/supabase'
import type { Db } from '@/lib/portero-alimenta/alimentar'
import { guardarCompetidoresConfirmados } from '@/lib/portero-alimenta/brazos/confirmar'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 30
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(request: Request) {
  const auth = checkInternalKey(request)
  if (!auth.ok) return NextResponse.json({ error: 'unauthorized', code: 'E-AUTH-001', detail: auth.reason }, { status: 401 })
  let cuerpo: unknown
  try { cuerpo = await request.json() } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }) }
  const b = (cuerpo && typeof cuerpo === 'object' ? cuerpo : {}) as Record<string, unknown>
  if (typeof b.dry_run !== 'boolean') return NextResponse.json({ error: 'dry_run_obligatorio', detalle: '`dry_run` es obligatorio y debe ser true o false' }, { status: 400 })
  if (typeof b.client_id !== 'string' || !UUID.test(b.client_id)) return NextResponse.json({ error: 'client_id_invalido', detalle: '`client_id` debe ser un uuid' }, { status: 400 })
  if (!Array.isArray(b.nombres)) return NextResponse.json({ error: 'nombres_invalidos', detalle: '`nombres` debe ser una lista de nombres (vacía = dejar de vigilar)' }, { status: 400 })
  try {
    const r = await guardarCompetidoresConfirmados(getSupabaseAdmin() as unknown as Db, b.client_id, b.nombres, { ahora: new Date(), por: typeof b.por === 'string' && b.por.trim() ? b.por.trim().slice(0, 60) : 'dueno', dry_run: b.dry_run })
    return NextResponse.json(r.body, { status: r.estado })
  } catch (e) {
    return NextResponse.json({ error: 'portero_error', detalle: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
