/**
 * POST /api/alta/ficha-por-nombre
 *
 * La puerta de trato cerrado la llama cuando el trato trae un NOMBRE y no un `client_id`: crea la ficha del cliente (o devuelve la que ya existe con ese nombre) y devuelve su `client_id`,
 * que lo asigna la base. Máximo 3 fichas NUEVAS por día (UTC) por esta puerta; cada una nace con su propio freno de gasto. No crea viajes, no llama a ningún agente, cuesta US$ 0.
 *
 * Auth · `x-api-key: INTERNAL_API_KEY`.   Body · { client_name, industry?, country?, website_url? (https) }
 * 201 · ficha creada   200 · ya existía (no cuenta contra el tope)   400 · pedido_invalido   429 · tope_de_fichas_nuevas   503 · base no disponible
 */
import { NextResponse } from 'next/server'
import { checkInternalKey } from '@/lib/internal-auth'
import { getSupabaseAdmin } from '@/lib/supabase'
import { fichaPorNombre } from '@/lib/alta/ficha-por-nombre'
import { puertosDeFicha } from '@/lib/alta/almacen-supabase'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(request: Request) {
  const auth = checkInternalKey(request)
  if (!auth.ok) return NextResponse.json({ ok: false, error: 'unauthorized', detail: auth.reason }, { status: 401 })
  const cuerpo = await request.json().catch(() => null)
  try {
    const r = await fichaPorNombre(puertosDeFicha(getSupabaseAdmin()), cuerpo)
    return NextResponse.json(r, { status: r.status })
  } catch (e) {
    return NextResponse.json({ ok: false, error: 'base_no_disponible', detail: e instanceof Error ? e.message : String(e) }, { status: 503 })
  }
}
