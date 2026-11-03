/**
 * POST /api/esperas-del-dueno · el alta guarda aquí el sobre del plan: la cadena espera a que Emilio apruebe el manual (ajuste de Emilio, 3-nov 14:49Z).
 * Cuerpo: { client_id, tipo: 'manual', sobre, workflow_id?, workflow_execution_id? } · contesta { ok, kind: 'guardada' | 'duplicate' | 'ya_aprobada' } o { ok: false, code, detail }.
 */
import { NextResponse } from 'next/server'
import { checkInternalKey } from '@/lib/internal-auth'
import { getSupabaseAdmin } from '@/lib/supabase'
import { guardarEsperaDelManual } from '@/lib/manual/pedir-plan'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 800

export async function POST(request: Request) {
  const llave = checkInternalKey(request)
  if (!llave.ok) return NextResponse.json({ ok: false, code: 'E-AUTH-001', detail: llave.reason }, { status: 401 })
  let cuerpo: unknown
  try { cuerpo = await request.json() } catch { return NextResponse.json({ ok: false, code: 'invalid_json', detail: 'el cuerpo no es JSON' }, { status: 400 }) }
  try {
    const r = await guardarEsperaDelManual(getSupabaseAdmin(), cuerpo)
    return NextResponse.json(r.cuerpo, { status: r.status })
  } catch (e) {
    return NextResponse.json({ ok: false, code: 'espera_error', detail: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
