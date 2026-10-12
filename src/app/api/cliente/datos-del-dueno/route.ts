/**
 * POST /api/cliente/datos-del-dueno · lo que el DUEÑO corrigió o declaró de su negocio (datos de sede con fuente «dueno»), por la función compartida `datosDelDueno`. Solo lectura, US$ 0.
 * Cuerpo: { client_id }. Llave interna. Devuelve `lineas` (con el rótulo de que las dijo el dueño: para agentes internos) y `hechos` (los mismos datos SIN decir quién: para lo que lee el cliente).
 * Un fallo de lectura se devuelve como error (nunca como «el dueño no dijo nada»): quien llama decide parar.
 */
import { NextResponse } from 'next/server'
import { checkInternalKey } from '@/lib/internal-auth'
import { getSupabaseAdmin } from '@/lib/supabase'
import { datosDelDueno } from '@/lib/manual/propuesta-rutas'
import type { Db } from '@/lib/manual/revision'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 30

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(request: Request) {
  const auth = checkInternalKey(request)
  if (!auth.ok) return NextResponse.json({ error: 'unauthorized', code: 'E-AUTH-001', detail: auth.reason }, { status: 401 })
  const cuerpo: unknown = await request.json().catch(() => null)
  const c = cuerpo && typeof cuerpo === 'object' && !Array.isArray(cuerpo) ? (cuerpo as Record<string, unknown>) : null
  if (!c || typeof c.client_id !== 'string' || !UUID.test(c.client_id)) return NextResponse.json({ error: 'invalid_client_id', detail: 'client_id debe ser un uuid' }, { status: 400 })
  try {
    const r = await datosDelDueno(getSupabaseAdmin() as unknown as Db, c.client_id)
    if (!r.ok) return NextResponse.json({ ok: false, error: 'lectura_fallida', detail: r.error }, { status: 502 })
    return NextResponse.json({ ok: true, client_id: c.client_id, lineas: r.lineas, hechos: r.hechos }, { status: 200 })
  } catch (e) {
    return NextResponse.json({ ok: false, error: 'datos_del_dueno_error', detail: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
