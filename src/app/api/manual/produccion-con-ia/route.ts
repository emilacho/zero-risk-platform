/**
 * POST /api/manual/produccion-con-ia · encargo 16 (21-nov) · las DOS puertas de la sección «Cómo se produce con IA»,
 * por `accion` (como las demás puertas del manual, para que el flujo de n8n las llame; ningún guion directo escribe):
 *  · `accion: 'preparar'` → lee el cerebro entero (fotos propias con oferta y fecha, hechos, referencias) y devuelve el
 *    pedido del agente (`task`) con sus conteos. US$ 0, solo lectura. `reescribir: true` deja preparar sobre un manual
 *    que ya trae la sección.
 *  · `accion: 'escribir'` → guarda la prosa como versión NUEVA del manual que SOLO agrega `produccion_con_ia`.
 *    `dry_run` BOOLEANO OBLIGATORIO; con `dry_run: true` valida todo y no escribe nada.
 * Llave interna (`x-api-key`). El modelo no se llama aquí: lo llama el flujo por `run-sdk` entre las dos puertas.
 */
import { NextResponse } from 'next/server'
import { checkInternalKey } from '@/lib/internal-auth'
import { getSupabaseAdmin } from '@/lib/supabase'
import type { Db } from '@/lib/manual/revision'
import { prepararProduccionConIa } from '@/lib/cerebro/manual-produccion-con-ia'
import { escribirProduccionConIa } from '@/lib/manual/produccion-con-ia'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'
export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(request: Request) {
  const auth = checkInternalKey(request)
  if (!auth.ok) return NextResponse.json({ error: 'unauthorized', code: 'E-AUTH-001', detail: auth.reason }, { status: 401 })
  let cuerpo: unknown
  try { cuerpo = await request.json() } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }) }
  const b = (cuerpo && typeof cuerpo === 'object' ? cuerpo : {}) as Record<string, unknown>
  const clientId = typeof b.client_id === 'string' ? b.client_id.trim() : ''
  if (!clientId) return NextResponse.json({ error: 'entrada_invalida', detalle: 'falta `client_id`' }, { status: 400 })
  const db = getSupabaseAdmin() as unknown as Db

  if (b.accion === 'preparar') {
    const r = await prepararProduccionConIa(db, clientId, { reescribir: b.reescribir === true })
    return NextResponse.json(r, { status: r.ok ? 200 : r.status })
  }
  if (b.accion === 'escribir') {
    if (typeof b.dry_run !== 'boolean') return NextResponse.json({ error: 'dry_run_obligatorio', detalle: '`dry_run` es obligatorio y debe ser true o false' }, { status: 400 })
    const r = await escribirProduccionConIa(db, {
      client_id: clientId,
      texto: typeof b.texto === 'string' ? b.texto : '',
      version_base: typeof b.version_base === 'number' ? b.version_base : -1,
      dry_run: b.dry_run,
      ...(typeof b.workflow_id === 'string' ? { workflow_id: b.workflow_id } : {}),
      ...(typeof b.workflow_execution_id === 'string' ? { workflow_execution_id: b.workflow_execution_id } : {}),
    })
    return NextResponse.json(r, { status: r.ok ? 200 : r.status })
  }
  return NextResponse.json({ error: 'entrada_invalida', detalle: '`accion` debe ser preparar o escribir' }, { status: 400 })
}
