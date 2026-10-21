/**
 * POST /api/brain/alimentar/reanudar · levanta la pausa de UN cliente que el vigilante pausó (el flujo nunca se apagó para los demás). Exige `motivo` (qué se arregló) y `por` (quién).
 * GET  /api/brain/alimentar/reanudar · los clientes pausados ahora y por qué.
 * Llave interna (`INTERNAL_API_KEY`), nunca `SALA_DISPATCH_KEY`. `dry_run` obligatorio; con false exige workflow_id + workflow_execution_id. US$ 0.
 */
import { NextResponse } from 'next/server'
import { checkInternalKey } from '@/lib/internal-auth'
import { getSupabaseAdmin } from '@/lib/supabase'
import type { Db } from '@/lib/portero-alimenta/alimentar'
import { rutaPausasAbiertas, rutaReanudar } from '@/lib/portero-alimenta/pausas'
import { resolverIncidente } from '@/lib/portero-alimenta/alertas'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 30

export async function POST(request: Request) {
  const auth = checkInternalKey(request)
  if (!auth.ok) return NextResponse.json({ error: 'unauthorized', code: 'E-AUTH-001', detail: auth.reason }, { status: 401 })
  let cuerpo: unknown
  try { cuerpo = await request.json() } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }) }
  try {
    const db = getSupabaseAdmin() as unknown as Db
    const r = await rutaReanudar({ db, resolver: resolverIncidente({ db }) }, cuerpo)
    return NextResponse.json(r.body, { status: r.status })
  } catch (e) {
    return NextResponse.json({ error: 'reanudar_error', detalle: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}

export async function GET(request: Request) {
  const auth = checkInternalKey(request)
  if (!auth.ok) return NextResponse.json({ error: 'unauthorized', code: 'E-AUTH-001', detail: auth.reason }, { status: 401 })
  try {
    const r = await rutaPausasAbiertas({ db: getSupabaseAdmin() as unknown as Db })
    return NextResponse.json(r.body, { status: r.status })
  } catch (e) {
    return NextResponse.json({ error: 'reanudar_error', detalle: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
