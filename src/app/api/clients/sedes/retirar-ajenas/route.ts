/**
 * POST /api/clients/sedes/retirar-ajenas · 02-nov · RELLENO de «datos de sede que no son del cliente».
 * Cuerpo: { dry_run?: boolean (por omisión true: solo cuenta), client_id?: uuid (sin él, todos los clientes), quien?: string }.
 * Retira (con fecha y motivo; nunca borra) las filas de `client_sede_datos` rotuladas «sitio» cuya página la regla única (`propio/regla-propio.ts`) marca como ajena (tiendas de apps de reparto, otros dominios).
 * US$ 0: no llama a ningún modelo ni a Apify. Llave interna (`x-api-key`).
 */
import { NextResponse } from 'next/server'
import { checkInternalKey } from '@/lib/internal-auth'
import { getSupabaseAdmin } from '@/lib/supabase'
import { retirarSedeDatosAjenos } from '@/lib/sedes/ajenas'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 800

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(request: Request) {
  const auth = checkInternalKey(request)
  if (!auth.ok) return NextResponse.json({ error: 'unauthorized', detail: auth.reason }, { status: 401 })
  let b: { dry_run?: unknown; client_id?: unknown; quien?: unknown } = {}
  try { b = (await request.json()) as typeof b } catch { /* cuerpo vacío: queda en seco */ }
  const clientId = typeof b.client_id === 'string' && b.client_id.trim() ? b.client_id.trim() : null
  if (clientId && !UUID.test(clientId)) return NextResponse.json({ ok: false, error: 'client_id debe ser un uuid' }, { status: 400 })
  const quien = typeof b.quien === 'string' && b.quien.trim() ? b.quien.trim().slice(0, 80) : 'el cerebro (relleno)'
  try {
    const r = await retirarSedeDatosAjenos(getSupabaseAdmin(), { clientId, dry_run: b.dry_run !== false, quien })
    return NextResponse.json(r, { status: r.ok ? 200 : 500 })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
