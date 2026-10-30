/**
 * PATCH /api/manual/{client_id}/campos · «Editar el manual» desde el dashboard (30-oct · US$ 0 · sin modelo).
 * Llave interna (`x-api-key`). Cuerpo: { campos:{ proposito|eslogan|voz|posicionamiento|publico|valores|nunca : texto }, comentario?, reviewer, origen:'dashboard' }.
 * Versión `max+1` vigente con `_field_meta.<campo>{fuente:'dueno',por,en,valor_anterior,cita}`; la anterior queda; después cada campo va a la puerta del dueño del cerebro (con reintento).
 * Deja su fila en `eventos_de_emilio` (accion `tablero`, decision `manual-campos`), salga bien o mal.
 */
import { NextResponse } from 'next/server'
import { checkInternalKey } from '@/lib/internal-auth'
import { getSupabaseAdmin } from '@/lib/supabase'
import { empujarManualAlCerebro } from '@/lib/brain/push-al-terminar'
import { rutaEditarManual } from '@/lib/manual/edicion-rutas'
import { cuerpoSeguro, rastroDelTablero } from '@/lib/oficina/tablero/comun'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

export async function PATCH(request: Request, ctx: { params: { client_id: string } }) {
  const auth = checkInternalKey(request)
  if (!auth.ok) return NextResponse.json({ error: 'unauthorized', detail: auth.reason }, { status: 401 })
  let cuerpo: unknown
  try { cuerpo = await request.json() } catch { return NextResponse.json({ ok: false, error: 'invalid_json', detalle: 'el cuerpo no es JSON' }, { status: 400 }) }
  const db = getSupabaseAdmin() as unknown as { from(t: string): any }
  const reviewer = typeof (cuerpo as Record<string, unknown> | null)?.reviewer === 'string' ? String((cuerpo as Record<string, unknown>).reviewer).trim() || 'emilio' : 'emilio'
  try {
    const s = await rutaEditarManual({
      db,
      cerebro: { env: { baseUrl: new URL(request.url).origin, internalKey: process.env.INTERNAL_API_KEY ?? '' } },
      empujarManual: (x) => empujarManualAlCerebro(x),
    }, ctx.params.client_id, cuerpo)
    await rastroDelTablero(db, { accion: 'manual-campos', autor: reviewer, toca: s.toca, resultado: { status: s.status, ...s.body }, crudo: cuerpoSeguro((cuerpo && typeof cuerpo === 'object' ? cuerpo : {}) as Record<string, unknown>), ahora: new Date() })
    return NextResponse.json(s.body, { status: s.status })
  } catch (e) {
    return NextResponse.json({ ok: false, error: 'manual_error', detalle: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
