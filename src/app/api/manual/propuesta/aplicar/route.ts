/**
 * POST /api/manual/propuesta/aplicar · lee lo que contestó cada agente, fusiona SOLO los campos vacíos en una copia del borrador (cada uno rotulado «propuesta del agente») y devuelve el cuerpo listo
 * para guardar como versión nueva + las diferencias por campo. NO guarda ni llama a un modelo: guardar lo hace el flujo por POST /api/brand-book/{id}. `dry_run` obligatorio.
 * Cuerpo: { client_id, dry_run, respuestas: [{ agente, response }], version_base?, huella_base?, campos? }. Llave interna.
 */
import { NextResponse } from 'next/server'
import { checkInternalKey } from '@/lib/internal-auth'
import { getSupabaseAdmin } from '@/lib/supabase'
import { rutaAplicarPropuesta } from '@/lib/manual/propuesta-rutas'
import type { Db } from '@/lib/manual/revision'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(request: Request) {
  const auth = checkInternalKey(request)
  if (!auth.ok) return NextResponse.json({ error: 'unauthorized', code: 'E-AUTH-001', detail: auth.reason }, { status: 401 })
  let cuerpo: unknown
  try { cuerpo = await request.json() } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }) }
  try {
    const r = await rutaAplicarPropuesta(getSupabaseAdmin() as unknown as Db, cuerpo)
    return NextResponse.json(r.body, { status: r.status })
  } catch (e) {
    return NextResponse.json({ error: 'propuesta_error', detalle: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
