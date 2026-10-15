/**
 * POST /api/brain/alimentar/despertar · el cerebro despierta con el raspado del ALTA: procesa lo que el alta ya dejó en `apify_raw` (solo `ensayo=false`) con el mismo filtro y el mismo
 * archivar del portero, lo lleva al índice, deja el rastro «despertar» y dice qué falta y cuánto se ahorra. US$ 0: NO llama a Apify. `dry_run` obligatorio; con false exige
 * workflow_id + workflow_execution_id. Vigilante incluido (si algo falla apaga el portero diario y avisa a #alertas). Llave interna. Detrás de `PORTERO_ALIMENTAR`.
 */
import { NextResponse } from 'next/server'
import { checkInternalKey } from '@/lib/internal-auth'
import { getSupabaseAdmin } from '@/lib/supabase'
import type { Db } from '@/lib/portero-alimenta/alimentar'
import { interruptoresDelEntorno } from '@/lib/portero-alimenta/datos'
import { apagarFlujoDelPortero, avisarAAlertas } from '@/lib/portero-alimenta/avisos'
import { agenteDelRoster, modeloRegistrado, puenteAlIndice } from '@/lib/portero-alimenta/entorno'
import { AGENTE_DEL_PULIDO } from '@/lib/portero-alimenta/resumen-pulido'
import { TOPE_DEL_PULIDO_USD } from '@/lib/portero-alimenta/datos'
import { rutaDespertar } from '@/lib/portero-alimenta/despertar'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 300

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
    const r = await rutaDespertar({
      db, interruptores: interruptoresDelEntorno(),
      llamarModelo: real ? modeloRegistrado({ origen, llaveInterna: llave, workflowId: b.workflow_id as string, ejecucionId: b.workflow_execution_id as string, clientId: b.client_id as string, comando: 'portero.juzgar' }) : undefined,
      // el pulido del resumen vivo (apagado por PORTERO_RESUMEN_PULIDO): un agente del roster por run-sdk; en seco no se llama a nadie
      pulirResumen: real ? agenteDelRoster({ origen, llaveInterna: llave, workflowId: b.workflow_id as string, ejecucionId: b.workflow_execution_id as string, clientId: b.client_id as string, agente: AGENTE_DEL_PULIDO, topeUsd: TOPE_DEL_PULIDO_USD }) : undefined,
      puente: real ? puenteAlIndice({ origen, llaveInterna: llave, db }) : undefined,
      apagar: apagarFlujoDelPortero(), avisar: avisarAAlertas(), workflowIdPortero: process.env.PORTERO_WORKFLOW_ID || undefined,
    }, cuerpo)
    return NextResponse.json(r.body, { status: r.status })
  } catch (e) {
    return NextResponse.json({ error: 'despertar_error', detalle: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
