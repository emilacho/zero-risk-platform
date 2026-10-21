/**
 * GET /api/notas-del-dueno/feed?client_id=<uuid>&desde=<iso>&limite=<n> · las notas del dueño en una forma fija, de la más vieja a la más nueva, para que el cerebro las ingiera por su puerta.
 * SOLO LECTURA (llave interna). `client_id` es opcional (sin él, las de todos los clientes); `desde` es exclusivo: se vuelve con `siguiente_desde` para traer lo nuevo.
 * Un error de lectura NUNCA se devuelve como «sin notas». Este endpoint no escribe nada ni toca las tablas del cerebro.
 */
import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { checkInternalKey } from '@/lib/internal-auth'
import { eventoParaElCerebro, fechaDe, limiteDe, VERSION_DEL_FEED } from '@/lib/notas-del-dueno/feed'
import type { Nota } from '@/lib/notas-del-dueno/tipos'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(request: Request) {
  const auth = checkInternalKey(request)
  if (!auth.ok) return NextResponse.json({ error: 'unauthorized', detail: auth.reason }, { status: 401 })
  const q = new URL(request.url).searchParams
  const clientId = q.get('client_id')
  if (clientId !== null && !UUID.test(clientId)) return NextResponse.json({ error: 'client_id_invalido', detail: 'client_id debe ser un uuid' }, { status: 400 })
  const desdeCrudo = q.get('desde')
  const desde = fechaDe(desdeCrudo)
  if (desdeCrudo && !desde) return NextResponse.json({ error: 'desde_invalido', detail: 'desde debe ser una fecha ISO' }, { status: 400 })
  const limite = limiteDe(q.get('limite'))
  let consulta = getSupabaseAdmin().from('notas_del_dueno').select('*')
  if (clientId) consulta = consulta.eq('client_id', clientId)
  if (desde) consulta = consulta.gt('creada_en', desde)
  const r = await consulta.order('creada_en', { ascending: true }).limit(limite + 1)
  if (r.error) return NextResponse.json({ error: 'lectura_fallida', detail: r.error.message }, { status: 500 })
  const filas = (r.data ?? []) as Nota[]
  const hayMas = filas.length > limite
  const pagina = filas.slice(0, limite)
  return NextResponse.json({ esquema: VERSION_DEL_FEED, eventos: pagina.map(eventoParaElCerebro), siguiente_desde: pagina.length ? pagina[pagina.length - 1].creada_en : desde, hay_mas: hayMas })
}
