/**
 * POST /api/metricas/registrar · lo que escriben los recolectores de cada red. Contrato: raw/tasks/2026-11-02-CONTRATO-CC1-metricas-de-redes.md
 */
import { NextResponse } from 'next/server'
import { checkInternalKey } from '@/lib/internal-auth'
import { getSupabaseAdmin } from '@/lib/supabase'
import { registrarMetricas, type Db } from '@/lib/metricas/metricas'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(request: Request) {
  const llave = checkInternalKey(request)
  if (!llave.ok) return NextResponse.json({ error: 'unauthorized', code: 'E-AUTH-001', detail: llave.reason }, { status: 401 })
  let cuerpo: unknown
  try { cuerpo = await request.json() } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }) }
  try {
    const r = await registrarMetricas(getSupabaseAdmin() as unknown as Db, cuerpo)
    return NextResponse.json(r.body, { status: r.status })
  } catch (e) {
    return NextResponse.json({ error: 'metricas_error', detalle: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
