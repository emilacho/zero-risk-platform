/**
 * POST /api/cliente/datos-del-negocio · UNA SOLA FUENTE (01-nov · ADENDA 3 de Emilio): sedes, eslogan, hechos del dueño y activos de solo lectura, ya armados, para cualquier flujo. Solo lectura, US$ 0.
 * Cuerpo: { client_id }. Llave interna. Lo que no se pudo leer viene en `fallos` con 502: una lectura caída nunca parece «no hay datos». Quien llama decide parar.
 */
import { NextResponse } from 'next/server'
import { checkInternalKey } from '@/lib/internal-auth'
import { getSupabaseAdmin } from '@/lib/supabase'
import { datosDelNegocio } from '@/lib/portero-alimenta/contexto-del-cliente'

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
    const d = await datosDelNegocio(getSupabaseAdmin() as never, c.client_id)
    return NextResponse.json({ ok: d.fallos.length === 0, client_id: c.client_id, ...d }, { status: d.fallos.length ? 502 : 200 })
  } catch (e) {
    return NextResponse.json({ ok: false, error: 'datos_del_negocio_error', detail: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
