/**
 * POST /api/sala/recados · los recados de la sala de despacho (abrir · cerrar · leer). PASO 1 del diseño `raw/tasks/2026-10-08-DISENO-CC3-recados-de-la-sala.md`.
 * Llave: `x-sala-dispatch-key` = `SALA_DISPATCH_KEY` (la misma de los flujos que despacha la sala). Sin la variable la puerta queda CERRADA (503); la llave interna NO la abre.
 * Nadie la llama todavía y la migración de sus dos tablas NO está aplicada (pide firma de Emilio). No emite sobres a la sala: el reparto y la retoma son los pasos 3 y 4.
 */
import crypto from 'node:crypto'
import { NextResponse } from 'next/server'
import { procesarRecado } from '@/lib/sala-recados/puerta'
import { almacenDeSupabase } from '@/lib/sala-recados/almacen-supabase'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function igual(a: string, b: string): boolean {
  const x = Buffer.from(a), y = Buffer.from(b)
  return x.length === y.length && crypto.timingSafeEqual(x, y)
}

export async function POST(request: Request) {
  const esperada = (process.env.SALA_DISPATCH_KEY ?? '').trim()
  if (!esperada) return NextResponse.json({ error: 'sala_dispatch_key_not_configured', detalle: 'la puerta de recados queda cerrada sin SALA_DISPATCH_KEY' }, { status: 503 })
  if (!igual((request.headers.get('x-sala-dispatch-key') ?? '').trim(), esperada)) return NextResponse.json({ error: 'unauthorized', detalle: 'falta o no coincide x-sala-dispatch-key' }, { status: 401 })

  let cuerpo: unknown
  try { cuerpo = await request.json() } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }) }
  const r = await procesarRecado(almacenDeSupabase(), cuerpo, new Date())
  return NextResponse.json(r.cuerpo, { status: r.status })
}
