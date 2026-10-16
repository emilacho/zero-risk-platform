/**
 * POST /api/brain/alimentar/credenciales · guarda (o cambia) las llaves de UN cliente para un proveedor (loyverse · meta), CIFRADAS. Cuerpo: { client_id, proveedor, campos: { token, … }, dry_run, workflow_id, workflow_execution_id }.
 * GET  /api/brain/alimentar/credenciales?client_id= · qué llaves tiene el cliente (campo, huella, desde cuándo): JAMÁS el valor.
 * Llave interna (`INTERNAL_API_KEY`). La respuesta nunca devuelve un valor. Sin `PORTERO_CLAVE_DE_CREDENCIALES` en el servidor no se guarda nada. US$ 0.
 */
import { NextResponse } from 'next/server'
import { checkInternalKey } from '@/lib/internal-auth'
import { getSupabaseAdmin } from '@/lib/supabase'
import type { Db } from '@/lib/portero-alimenta/alimentar'
import { rutaGuardarCredencial, rutaLeerCredenciales } from '@/lib/portero-alimenta/credenciales'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 30

export async function POST(request: Request) {
  const auth = checkInternalKey(request)
  if (!auth.ok) return NextResponse.json({ error: 'unauthorized', code: 'E-AUTH-001', detail: auth.reason }, { status: 401 })
  let cuerpo: unknown
  try { cuerpo = await request.json() } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }) }
  try {
    const r = await rutaGuardarCredencial({ db: getSupabaseAdmin() as unknown as Db }, cuerpo)
    return NextResponse.json(r.body, { status: r.status })
  } catch (e) {
    return NextResponse.json({ error: 'credenciales_error' }, { status: 500 }) // sin detalle: un error podría arrastrar un valor
  }
}

export async function GET(request: Request) {
  const auth = checkInternalKey(request)
  if (!auth.ok) return NextResponse.json({ error: 'unauthorized', code: 'E-AUTH-001', detail: auth.reason }, { status: 401 })
  try {
    const r = await rutaLeerCredenciales({ db: getSupabaseAdmin() as unknown as Db }, new URL(request.url).searchParams.get('client_id') ?? '')
    return NextResponse.json(r.body, { status: r.status })
  } catch {
    return NextResponse.json({ error: 'credenciales_error' }, { status: 500 })
  }
}
