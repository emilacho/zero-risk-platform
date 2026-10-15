/**
 * POST /api/brain/alimentar/vigilar · el VIGILANTE dentro del sistema: el flujo del portero lo llama al cerebro de cada corrida (después de ⑤ Cierre). Revisa las condiciones de salud;
 * si alguna falla DESACTIVA el flujo (reversible) y AVISA a #alertas con el motivo en una línea; si todo va bien, silencio (solo rastro).
 * `dry_run` obligatorio (true = solo evalúa, no escribe, no apaga, no avisa). Con false exige workflow_id + workflow_execution_id. US$ 0 (ni Apify ni modelo). Llave interna.
 * Solo apaga flujos cuyo nombre contenga «portero» (no es una puerta para apagar cualquier flujo).
 */
import { NextResponse } from 'next/server'
import { checkInternalKey } from '@/lib/internal-auth'
import { getSupabaseAdmin } from '@/lib/supabase'
import type { Db } from '@/lib/portero-alimenta/alimentar'
import { interruptoresDelEntorno } from '@/lib/portero-alimenta/datos'
import { avisarAAlertas, apagarFlujoDelPortero } from '@/lib/portero-alimenta/avisos'
import { rutaVigilar } from '@/lib/portero-alimenta/vigilante'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 300

export async function POST(request: Request) {
  const auth = checkInternalKey(request)
  if (!auth.ok) return NextResponse.json({ error: 'unauthorized', code: 'E-AUTH-001', detail: auth.reason }, { status: 401 })
  let cuerpo: unknown
  try { cuerpo = await request.json() } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }) }
  try {
    const db = getSupabaseAdmin() as unknown as Db
    const r = await rutaVigilar({ db, interruptores: interruptoresDelEntorno(), apagar: apagarFlujoDelPortero(), avisar: avisarAAlertas() }, cuerpo)
    return NextResponse.json(r.body, { status: r.status })
  } catch (e) {
    return NextResponse.json({ error: 'vigilante_error', detalle: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
