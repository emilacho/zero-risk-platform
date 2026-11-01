/**
 * POST /api/incidentes/ciclo-de-vida · lo llama un reloj de n8n · llave interna. Cuerpo `{ "ejecutar": true }` para cerrar; sin él solo informa qué cerraría.
 * Nunca borra: cierra por regla y deja el motivo. No llama a ningún agente ni gasta.
 */
import { NextResponse } from 'next/server'
import { correrCicloDeIncidentes } from '@/lib/incidentes/ciclo-de-vida'
import { checkInternalKey } from '@/lib/internal-auth'
import { getSupabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(request: Request) {
  const auth = checkInternalKey(request)
  if (!auth.ok) return NextResponse.json({ error: 'unauthorized', detail: auth.reason }, { status: 401 })
  let cuerpo: unknown = {}
  try { cuerpo = await request.json() } catch { cuerpo = {} }
  const ejecutar = typeof cuerpo === 'object' && cuerpo !== null && (cuerpo as { ejecutar?: unknown }).ejecutar === true
  try {
    return NextResponse.json(await correrCicloDeIncidentes({ db: getSupabaseAdmin(), ahora: () => new Date() }, { ejecutar }))
  } catch {
    return NextResponse.json({ ok: false, error: 'incidentes_error', detalle: 'no se pudo correr el ciclo' }, { status: 500 })
  }
}
