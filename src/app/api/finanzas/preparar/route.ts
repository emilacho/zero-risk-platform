/**
 * POST /api/finanzas/preparar · lo que el negocio ya dio (datos), lo que falta y el pedido al agente financiero. Solo lectura, US$ 0.
 * Llave interna. Sin modelo: el flujo de n8n invoca al agente financiero entre «preparar» y «aplicar» (los agentes solo se invocan por flujos).
 */
import { NextResponse } from 'next/server'
import { checkInternalKey } from '@/lib/internal-auth'
import { getSupabaseAdmin } from '@/lib/supabase'
import { rutaPrepararFinanzas } from '@/lib/finanzas/rutas'
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
    const r = await rutaPrepararFinanzas(getSupabaseAdmin() as unknown as Db, cuerpo)
    return NextResponse.json(r.body, { status: r.status })
  } catch (e) {
    return NextResponse.json({ error: 'finanzas_error', detalle: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
