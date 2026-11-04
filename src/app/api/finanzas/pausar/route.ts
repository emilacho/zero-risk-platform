/**
 * POST /api/finanzas/pausar · el plan guarda su pedido y el material ya pagado, y termina (04-nov · Emilio: «debe haber una pausa en el flujo hasta que yo conteste»).
 * Cuerpo: `{ encargo_id, sobre, material, workflow_id, workflow_execution_id }`. Llave: `x-api-key` = `INTERNAL_API_KEY`. Solo con la oficina encendida y con las preguntas por Slack activas.
 * La pausa la suelta la respuesta del dueño: el vigía del buzón llama a `recoger` en `/api/finanzas/conversa`.
 */
import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { almacenDeFinanzas, type Db } from '@/lib/finanzas/almacen-supabase'
import { pausarOficina } from '@/lib/finanzas/conversa/pausa'
import { puertosDePausa } from '@/lib/finanzas/conversa/puertos-de-pausa'
import { checkInternalKey } from '@/lib/finanzas/ruta'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 800

export async function POST(request: Request) {
  const auth = checkInternalKey(request)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
  let cuerpo: unknown
  try { cuerpo = await request.json() } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }) }
  if (typeof cuerpo !== 'object' || cuerpo === null || Array.isArray(cuerpo)) return NextResponse.json({ error: 'entrada_invalida' }, { status: 400 })
  const c = cuerpo as Record<string, unknown>
  if (typeof c.workflow_id !== 'string' || !c.workflow_id.trim() || typeof c.workflow_execution_id !== 'string' || !c.workflow_execution_id.trim()) return NextResponse.json({ error: 'entrada_invalida', errores: ['`workflow_id` y `workflow_execution_id` son obligatorios'] }, { status: 400 })
  const db = getSupabaseAdmin() as unknown as Db
  let cfg
  try { cfg = await almacenDeFinanzas(db).leerConfig() } catch (e) { return NextResponse.json({ error: 'config_ilegible', detalle: e instanceof Error ? e.message : String(e) }, { status: 503 }) }
  if (cfg.estado === 'apagada' || cfg.conversa === 'apagado') return NextResponse.json({ error: 'conversa_apagada' }, { status: 409 })
  try {
    const r = await pausarOficina(puertosDePausa(db, cfg.preguntas_slack, c.workflow_id, c.workflow_execution_id), c)
    return NextResponse.json(r.cuerpo, { status: r.status })
  } catch (e) {
    return NextResponse.json({ error: 'pausar_error', detalle: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
