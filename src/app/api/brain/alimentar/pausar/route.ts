/**
 * POST /api/brain/alimentar/pausar · pausa a UN cliente «hasta que termine su alta»: solo frena la corrida diaria (el despertar/completar de la alta pasa) y se cierra SOLA cuando la alta
 * avisa que terminó (el «listo» del despertar o el ⑧ que completa). Si ya había una pausa abierta, la convierte. Exige `motivo` y `por`. Llave interna. `dry_run` obligatorio. US$ 0.
 */
import { NextResponse } from 'next/server'
import { checkInternalKey } from '@/lib/internal-auth'
import { getSupabaseAdmin } from '@/lib/supabase'
import type { Db } from '@/lib/portero-alimenta/alimentar'
import { rutaPausarHastaLaAlta } from '@/lib/portero-alimenta/pausas'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 30

export async function POST(request: Request) {
  const auth = checkInternalKey(request)
  if (!auth.ok) return NextResponse.json({ error: 'unauthorized', code: 'E-AUTH-001', detail: auth.reason }, { status: 401 })
  let cuerpo: unknown
  try { cuerpo = await request.json() } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }) }
  try {
    const r = await rutaPausarHastaLaAlta({ db: getSupabaseAdmin() as unknown as Db }, cuerpo)
    return NextResponse.json(r.body, { status: r.status })
  } catch (e) {
    return NextResponse.json({ error: 'pausar_error', detalle: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
