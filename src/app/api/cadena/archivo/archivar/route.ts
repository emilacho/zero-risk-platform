/**
 * POST /api/cadena/archivo/archivar · archiva una campaña anterior, sin borrar nada. Sin `dry_run:false` solo dice qué haría.
 */
import { NextResponse } from 'next/server'
import { checkInternalKey } from '@/lib/internal-auth'
import { getSupabaseAdmin } from '@/lib/supabase'
import { archivarCampana, type Db } from '@/lib/oficina/archivo-de-campana'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(request: Request) {
  const llave = checkInternalKey(request)
  if (!llave.ok) return NextResponse.json({ error: 'unauthorized', code: 'E-AUTH-001', detail: llave.reason }, { status: 401 })
  let cuerpo: unknown
  try { cuerpo = await request.json() } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }) }
  try {
    const r = await archivarCampana(getSupabaseAdmin() as unknown as Db, cuerpo)
    return NextResponse.json(r.body, { status: r.status })
  } catch (e) {
    return NextResponse.json({ error: 'archivo_error', detalle: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
