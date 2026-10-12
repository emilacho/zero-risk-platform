/**
 * POST /api/manual/propuesta/preparar · qué campos del manual quedaron vacíos y el pedido (uno por agente) para que los PROPONGA. Solo lectura, US$ 0, sin modelo.
 * Cuerpo: { client_id, campos? }. Llave interna. Lo llama el flujo «Manual · propuesta del agente»; los agentes solo se invocan por flujos.
 */
import { NextResponse } from 'next/server'
import { checkInternalKey } from '@/lib/internal-auth'
import { getSupabaseAdmin } from '@/lib/supabase'
import { rutaPrepararPropuesta } from '@/lib/manual/propuesta-rutas'
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
    const r = await rutaPrepararPropuesta(getSupabaseAdmin() as unknown as Db, cuerpo)
    return NextResponse.json(r.body, { status: r.status })
  } catch (e) {
    return NextResponse.json({ error: 'propuesta_error', detalle: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
