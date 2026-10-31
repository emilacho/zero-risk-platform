/**
 * POST /api/brain/alimentar/informe · la mesa de análisis guarda un INFORME en el cerebro (clase `informe_de_analisis`, UNO vigente por cliente y tipo).
 *   Cuerpo: { client_id, tipo, texto, citas: [ids de ficha], fecha_de_corte, pedido_por: { oficina, agente }, dry_run, workflow_id, workflow_execution_id }.
 *   Verifica que cada cita sea una ficha de ese cliente, omite datos personales de terceros y retira el informe anterior del mismo tipo (con fecha y motivo; nada se borra).
 * El informe vuelve a las oficinas dentro de `contexto_del_cliente.informes` en el pedido y en la consulta.
 * Llave interna (`INTERNAL_API_KEY`). `dry_run` obligatorio; con false exige workflow_id + workflow_execution_id. Detrás de `PORTERO_INFORMES` (apagado por omisión). US$ 0, sin modelo.
 */
import { NextResponse } from 'next/server'
import { checkInternalKey } from '@/lib/internal-auth'
import { getSupabaseAdmin } from '@/lib/supabase'
import type { Db } from '@/lib/portero-alimenta/alimentar'
import { rutaInforme } from '@/lib/portero-alimenta/informes'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(request: Request) {
  const auth = checkInternalKey(request)
  if (!auth.ok) return NextResponse.json({ error: 'unauthorized', code: 'E-AUTH-001', detail: auth.reason }, { status: 401 })
  let cuerpo: unknown
  try { cuerpo = await request.json() } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }) }
  try {
    const r = await rutaInforme({ db: getSupabaseAdmin() as unknown as Db, activo: String(process.env.PORTERO_INFORMES ?? '').trim().toLowerCase() === 'on' }, cuerpo)
    return NextResponse.json(r.body, { status: r.status })
  } catch (e) {
    return NextResponse.json({ error: 'informe_error', detalle: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
