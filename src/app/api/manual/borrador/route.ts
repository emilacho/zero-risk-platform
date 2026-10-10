/**
 * POST /api/manual/borrador · S8 · el borrador (`client_historical_outputs`) y la tarjeta de la bandeja (`hitl_queue`). `dry_run: true` no escribe. Lo retirado sin fuente queda solo en el registro interno del borrador. Llaves: interna + de despacho.
 * La revisión del manual nace APAGADA: nadie la llama todavía (el flujo n8n es inactivo).
 */
import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { autorizar } from '@/lib/manual/rutas'
import { rutaBorrador } from '@/lib/manual/rutas'
import type { Db } from '@/lib/manual/revision'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(request: Request) {
  const no = autorizar(request, true)
  if (no) return NextResponse.json(no.body, { status: no.status })
  let cuerpo: unknown
  try { cuerpo = await request.json() } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }) }
  try {
    const r = await rutaBorrador(getSupabaseAdmin() as unknown as Db, cuerpo)
    return NextResponse.json(r.body, { status: r.status })
  } catch (e) {
    return NextResponse.json({ error: 'manual_error', detalle: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
