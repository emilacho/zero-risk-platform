/**
 * POST /api/avisos · la ÚNICA puerta para avisar (avisos sin Slack · CC1 · GO Lenovo 16:14Z). Llave interna (n8n y la plataforma).
 * Cuerpo `{ accion: 'avisar', clave, tipo, origen, origen_tipo, titulo, detalle, client_id?, workflow_id?, workflow_execution_id? }`
 *   o `{ accion: 'cerrar', clave, nota, tipo? }`.
 * Guarda PRIMERO: si guardar falla responde 500 (la corrida de n8n queda en rojo). Slack va después y su fallo queda anotado en la fila (200).
 * No llama a ningún agente ni gasta.
 */
import { NextResponse } from 'next/server'
import { checkInternalKey } from '@/lib/internal-auth'
import { getSupabaseAdmin } from '@/lib/supabase'
import { avisar, cerrar, EntradaInvalida, ErrorAlGuardar } from '@/lib/avisos/nucleo'
import { dependenciasReales, type Db } from '@/lib/avisos/adaptadores'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(request: Request) {
  const auth = checkInternalKey(request)
  if (!auth.ok) return NextResponse.json({ ok: false, error: 'unauthorized', detalle: auth.reason }, { status: 401 })
  let cuerpo: Record<string, unknown> = {}
  try { cuerpo = (await request.json()) as Record<string, unknown> } catch { return NextResponse.json({ ok: false, error: 'E-JSON', detalle: 'el cuerpo no es JSON' }, { status: 400 }) }
  const d = dependenciasReales(getSupabaseAdmin() as unknown as Db)
  try {
    if (cuerpo.accion === 'cerrar') return NextResponse.json({ ok: true, ...(await cerrar(d, String(cuerpo.clave ?? ''), String(cuerpo.nota ?? ''), cuerpo.tipo === 'pieza' || cuerpo.tipo === 'pregunta' ? cuerpo.tipo : 'alarma')) })
    if (cuerpo.accion !== 'avisar') return NextResponse.json({ ok: false, error: 'E-ACCION', detalle: 'accion debe ser avisar o cerrar' }, { status: 400 })
    return NextResponse.json({ ok: true, ...(await avisar(d, cuerpo)) })
  } catch (e) {
    if (e instanceof EntradaInvalida) return NextResponse.json({ ok: false, error: 'E-ENTRADA', detalle: e.message }, { status: 400 })
    if (e instanceof ErrorAlGuardar) return NextResponse.json({ ok: false, error: 'E-GUARDAR', detalle: 'no se pudo guardar el aviso' }, { status: 500 })
    return NextResponse.json({ ok: false, error: 'E-AVISOS', detalle: 'error inesperado' }, { status: 500 })
  }
}
