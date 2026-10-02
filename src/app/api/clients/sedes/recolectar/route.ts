/**
 * POST /api/clients/sedes/recolectar · CC#1 · 2026-10-02 · «las sedes de un cliente» (encargo Lenovo «sedes, mapas, cerebro y voz»).
 *
 * Cuerpo: { client_id }. Lee lo que el sistema ya guardó del cliente (su sitio · el raspado de su Instagram · las fichas de Mapas) y devuelve la ficha de sedes resuelta
 * (dirección · horario · canal de pedido, cada dato con su fuente y su fecha) + los textos de sus posts propios (referencia de voz) + lo que se descartó y por qué.
 * US$ 0: no llama a Apify ni a nada de pago. Escribe sólo en `client_sedes` y `client_sede_datos`. Idempotente.
 *
 * Lo llama el flujo de la pieza antes de pedirle al productor. Auth: x-api-key interna (como el resto de las rutas de n8n).
 * Si falla, contesta 200 con { ok:false, error } y el flujo lo DECLARA en el pedido (el productor no afirma ningún horario): una lectura caída no detiene la pieza ni se rellena.
 */
import { NextResponse } from 'next/server'
import { checkInternalKey } from '@/lib/internal-auth'
import { getSupabaseAdmin } from '@/lib/supabase'
import { recolectarSedes } from '@/lib/sedes/recolectar'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(request: Request) {
  const auth = checkInternalKey(request)
  if (!auth.ok) return NextResponse.json({ error: 'unauthorized', detail: auth.reason }, { status: 401 })
  let body: { client_id?: unknown } = {}
  try { body = (await request.json()) as typeof body } catch { /* cuerpo vacío o ilegible: se rechaza abajo */ }
  const clientId = typeof body.client_id === 'string' ? body.client_id.trim() : ''
  if (!UUID.test(clientId)) return NextResponse.json({ ok: false, error: 'client_id debe ser un uuid' }, { status: 400 })
  const r = await recolectarSedes(getSupabaseAdmin(), clientId)
  return NextResponse.json(r, { status: 200 })
}
