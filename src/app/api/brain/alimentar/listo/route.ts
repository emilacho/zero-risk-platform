/**
 * GET/POST /api/brain/alimentar/listo?client_id=… · la señal «cerebro listo» de UN cliente: `{ listo, motivo, desde, origen, ultima_corrida, puente_quedan }`.
 * Solo LEE (US$ 0: ni Apify ni modelo). Listo = última corrida del portero (despertar o diaria) `hecha`, reciente (≤ 36 h), sin problema del vigilante y puente al índice con `quedan = 0`.
 * Llave interna. Una falla de lectura es 502, nunca un «no listo» mudo.
 */
import { NextResponse } from 'next/server'
import { checkInternalKey } from '@/lib/internal-auth'
import { getSupabaseAdmin } from '@/lib/supabase'
import type { Db } from '@/lib/portero-alimenta/alimentar'
import { interruptoresDelEntorno } from '@/lib/portero-alimenta/datos'
import { rutaListo } from '@/lib/portero-alimenta/listo'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

async function responder(request: Request, cuerpo: unknown) {
  const auth = checkInternalKey(request)
  if (!auth.ok) return NextResponse.json({ error: 'unauthorized', code: 'E-AUTH-001', detail: auth.reason }, { status: 401 })
  try {
    const db = getSupabaseAdmin() as unknown as Db
    const r = await rutaListo({ db, interruptores: interruptoresDelEntorno() }, cuerpo)
    return NextResponse.json(r.body, { status: r.status })
  } catch (e) {
    return NextResponse.json({ error: 'listo_error', detalle: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
export async function GET(request: Request) { const q = new URL(request.url).searchParams
  return responder(request, { client_id: q.get('client_id') ?? '', ...(q.get('pedido_id') ? { pedido_id: q.get('pedido_id') } : {}) }) }
export async function POST(request: Request) {
  let cuerpo: unknown = {}
  try { cuerpo = await request.json() } catch { /* sin cuerpo */ }
  return responder(request, cuerpo)
}
