/**
 * POST /api/finanzas/aplicar · lee lo que contestó el agente, valida cada supuesto, CALCULA y (si dry_run es false) guarda el bloque financiero. dry_run obligatorio.
 * Llave interna. Sin modelo: el flujo de n8n invoca al agente financiero entre «preparar» y «aplicar» (los agentes solo se invocan por flujos).
 */
import { NextResponse } from 'next/server'
import { checkInternalKey } from '@/lib/internal-auth'
import { getSupabaseAdmin } from '@/lib/supabase'
import { rutaAplicarFinanzas } from '@/lib/finanzas/rutas'
import type { Db } from '@/lib/manual/revision'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(request: Request) {
  const auth = checkInternalKey(request)
  if (!auth.ok) return NextResponse.json({ error: 'unauthorized', code: 'E-AUTH-001', detail: auth.reason }, { status: 401 })
  let cuerpo: unknown
  try { cuerpo = await request.json() } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }) }
  try {
    const r = await rutaAplicarFinanzas(getSupabaseAdmin() as unknown as Db, cuerpo)
    return NextResponse.json(r.body, { status: r.status })
  } catch (e) {
    return NextResponse.json({ error: 'finanzas_error', detalle: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
