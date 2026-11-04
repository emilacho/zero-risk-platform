/**
 * POST /api/finanzas/responder · Emilio contesta en Tu oficina una pregunta de un plan en pausa (04-nov · «no usar Slack»). Cuerpo: `{ client_id, tema, respuesta, quien }`. Llave: `x-api-key` = `INTERNAL_API_KEY`.
 * Contesta 200 siempre que pudo leer: `en_pausa` y `es_de_la_pausa` dicen si la tomó. Si no la tomó, quien llama la guarda por su camino de siempre.
 */
import { randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { almacenDeFinanzas, type Db } from '@/lib/finanzas/almacen-supabase'
import { responderEnLaOficina } from '@/lib/finanzas/conversa/pausa'
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
  const db = getSupabaseAdmin() as unknown as Db
  try {
    const cfg = await almacenDeFinanzas(db).leerConfig()
    // la puerta del cerebro pide de dónde viene: aquí no hay flujo, viene del tablero
    const r = await responderEnLaOficina(puertosDePausa(db, cfg.preguntas_slack, 'tablero-tu-oficina', `tablero:${randomUUID()}`), cuerpo as Record<string, unknown>)
    return NextResponse.json(r.cuerpo, { status: r.status })
  } catch (e) {
    return NextResponse.json({ error: 'responder_error', detalle: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
