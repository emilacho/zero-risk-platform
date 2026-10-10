/**
 * POST /api/manual/recomprobar · S5/S7 · la puerta final sobre lo que devolvió el autor. Puro (US$ 0). Devuelve el registro interno de lo retirado; ese registro no va a ninguna bandeja. Llave interna.
 * La revisión del manual nace APAGADA: nadie la llama todavía (el flujo n8n es inactivo).
 */
import { NextResponse } from 'next/server'
import { checkInternalKey } from '@/lib/internal-auth'
import { getSupabaseAdmin } from '@/lib/supabase'
import { autorizar } from '@/lib/manual/rutas'
import { rutaRecomprobar } from '@/lib/manual/rutas'
import type { Db } from '@/lib/manual/revision'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(request: Request) {
  // la llave interna se comprueba AQUÍ (el lint de canon la exige en el archivo de la ruta); `autorizar` añade la llave de despacho donde corresponde
  const llave = checkInternalKey(request)
  if (!llave.ok) return NextResponse.json({ error: 'unauthorized', code: 'E-AUTH-001', detail: llave.reason }, { status: 401 })
  const no = autorizar(request, false)
  if (no) return NextResponse.json(no.body, { status: no.status })
  let cuerpo: unknown
  try { cuerpo = await request.json() } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }) }
  try {
    const r = await rutaRecomprobar(getSupabaseAdmin() as unknown as Db, cuerpo)
    return NextResponse.json(r.body, { status: r.status })
  } catch (e) {
    return NextResponse.json({ error: 'manual_error', detalle: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
