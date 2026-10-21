/**
 * GET /api/notas-del-dueno/registro?client_id=<uuid> · el registro visible del segundo cerebro: qué notas tiene el cliente, cuántas veces la auto-revisión corrigió algo y si los rechazos del dueño bajan.
 * Solo lectura. Llave interna (`x-api-key`). Las notas generales de otros clientes NO se cuentan aquí (solo las del cliente pedido).
 */
import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { checkInternalKey } from '@/lib/internal-auth'
import { registroDelCliente, type Autorevision } from '@/lib/notas-del-dueno/registro'
import type { Nota } from '@/lib/notas-del-dueno/tipos'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(request: Request) {
  const auth = checkInternalKey(request)
  if (!auth.ok) return NextResponse.json({ error: 'unauthorized', detail: auth.reason }, { status: 401 })
  const clientId = new URL(request.url).searchParams.get('client_id') ?? ''
  if (!UUID.test(clientId)) return NextResponse.json({ error: 'client_id_invalido', detail: 'client_id debe ser un uuid' }, { status: 400 })
  const db = getSupabaseAdmin()
  // un error de lectura NUNCA se devuelve como «sin notas»
  const n = await db.from('notas_del_dueno').select('*').eq('client_id', clientId).order('creada_en', { ascending: true }).limit(5000)
  if (n.error) return NextResponse.json({ error: 'lectura_fallida', detail: n.error.message }, { status: 500 })
  const a = await db.from('autorevisiones_del_productor').select('choco,costo_usd,paso,creada_en').eq('client_id', clientId).limit(5000)
  if (a.error) return NextResponse.json({ error: 'lectura_fallida', detail: a.error.message }, { status: 500 })
  const autorevs: Autorevision[] = ((a.data ?? []) as Array<Record<string, unknown>>).map((f) => ({ choco: f.choco === true, costo_usd: Number(f.costo_usd ?? 0), paso: String(f.paso ?? ''), creada_en: String(f.creada_en ?? '') }))
  return NextResponse.json({ registro: registroDelCliente(clientId, (n.data ?? []) as Nota[], autorevs) })
}
