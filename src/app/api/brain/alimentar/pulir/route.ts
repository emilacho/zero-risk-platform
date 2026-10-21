/**
 * POST /api/brain/alimentar/pulir · el pulido del resumen vivo, en su PROPIO paso (después del cierre; nunca dentro de ④ ni del despertar).
 * `dry_run` obligatorio; con false exige workflow_id + workflow_execution_id. Llave interna (`x-api-key`). Tope US$ 0,30 por corrida y cliente; una vez por día.
 * APAGADO por `PORTERO_RESUMEN_VIVO` + `PORTERO_RESUMEN_PULIDO`. Si el agente falla, tarda más que su plazo o pasa el tope, queda el resumen armado por código.
 */
import { NextResponse } from 'next/server'
import { checkInternalKey } from '@/lib/internal-auth'
import { getSupabaseAdmin } from '@/lib/supabase'
import type { Db } from '@/lib/portero-alimenta/alimentar'
import { interruptoresDelEntorno, RAZONAMIENTO_DEL_PULIDO, TOPE_DEL_PULIDO_APARTE_USD, umbralesDeGastoDelEntorno } from '@/lib/portero-alimenta/datos'
import { avisarAAlertas } from '@/lib/portero-alimenta/avisos'
import { agenteDelRoster } from '@/lib/portero-alimenta/entorno'
import { AGENTE_DEL_PULIDO } from '@/lib/portero-alimenta/resumen-pulido'
import { rutaPulir } from '@/lib/portero-alimenta/pulido-aparte'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 300

/** el agente tarda ~100 s: se le espera hasta 200 s y no más */
const PLAZO_DEL_AGENTE_MS = 200_000

export async function POST(request: Request) {
  const auth = checkInternalKey(request)
  if (!auth.ok) return NextResponse.json({ error: 'unauthorized', code: 'E-AUTH-001', detail: auth.reason }, { status: 401 })
  let cuerpo: unknown
  try { cuerpo = await request.json() } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }) }
  try {
    const b = (cuerpo && typeof cuerpo === 'object' ? cuerpo : {}) as Record<string, unknown>
    const real = b.dry_run === false && typeof b.workflow_id === 'string' && typeof b.workflow_execution_id === 'string' && typeof b.client_id === 'string'
    const db = getSupabaseAdmin() as unknown as Db
    const origen = new URL(request.url).origin
    const llave = process.env.INTERNAL_API_KEY ?? ''
    const r = await rutaPulir({
      db, interruptores: interruptoresDelEntorno(), avisar: avisarAAlertas(), umbrales: umbralesDeGastoDelEntorno(),
      pulirResumen: real ? agenteDelRoster({ origen, llaveInterna: llave, workflowId: b.workflow_id as string, ejecucionId: b.workflow_execution_id as string, clientId: b.client_id as string, agente: AGENTE_DEL_PULIDO, topeUsd: TOPE_DEL_PULIDO_APARTE_USD, plazoMs: PLAZO_DEL_AGENTE_MS, razonamiento: RAZONAMIENTO_DEL_PULIDO }) : undefined,
    }, cuerpo)
    return NextResponse.json(r.body, { status: r.status })
  } catch (e) {
    return NextResponse.json({ error: 'pulir_error', detalle: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
