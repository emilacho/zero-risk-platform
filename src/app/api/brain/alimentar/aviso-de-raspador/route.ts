/**
 * POST /api/brain/alimentar/aviso-de-raspador · una línea a #alertas cuando cambió un raspador de Apify y un campo usado ya no existe (o el relector del lunes ve cambios sin resolver).
 * `dry_run` obligatorio. Llave interna (`x-api-key`). US$ 0: no llama a Apify ni a un modelo; solo anota el incidente en `cerebro_alertas` (un mensaje por incidente, repeticiones en su hilo). La sordina («una vez por cambio») la lleva el flujo de n8n.
 */
import { NextResponse } from 'next/server'
import { checkInternalKey } from '@/lib/internal-auth'
import { getSupabaseAdmin } from '@/lib/supabase'
import type { Db } from '@/lib/portero-alimenta/alimentar'
import { avisarAAlertas } from '@/lib/portero-alimenta/avisos'
import { rutaAvisoDeRaspador } from '@/lib/portero-alimenta/aviso-de-raspador'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 30

export async function POST(request: Request) {
  const auth = checkInternalKey(request)
  if (!auth.ok) return NextResponse.json({ error: 'unauthorized', code: 'E-AUTH-001', detail: auth.reason }, { status: 401 })
  let cuerpo: unknown
  try { cuerpo = await request.json() } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }) }
  try {
    const r = await rutaAvisoDeRaspador({ avisar: avisarAAlertas({ db: getSupabaseAdmin() as unknown as Db }) }, cuerpo)
    return NextResponse.json(r.body, { status: r.status })
  } catch (e) {
    return NextResponse.json({ error: 'aviso_de_raspador_error', detalle: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
