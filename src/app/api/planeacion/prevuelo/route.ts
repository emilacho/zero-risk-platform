/**
 * POST /api/planeacion/prevuelo · el pre-vuelo del plan v3 (V8 · CC#1 · 15-oct). NADIE la llama todavía (V9 la cablea); las tablas V1/V13 nacen SIN aplicar ⇒ falla cerrado.
 * Cuerpo: `{ client_id, corrida, dry_run? }` (dry_run AUSENTE = real). Llave: `x-api-key` = `INTERNAL_API_KEY` (nunca `SALA_DISPATCH_KEY`).
 * Contesta la decisión (`correr` · `esperar` · `correr_con_lo_del_alta` · `ya_en_marcha` · `terminada` · `no_corre`); este pre-vuelo NO llama a Apify, ni a un modelo.
 * Estados HTTP: 400 entrada · 409 corrida activa/ya avanzó otro · 503 catálogo sin aplicar · 502 lectura fallida · 200 el resto (incluidos los `no_corre` con su motivo).
 */
import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { checkInternalKey } from '@/lib/finanzas/ruta'
import { prevuelo } from '@/lib/planeacion/prevuelo'
import { puertosDeSupabase } from '@/lib/planeacion/prevuelo-supabase'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

const STATUS: Record<string, number> = {
  entrada_invalida: 400, dry_run_no_booleano: 400,
  corrida_activa: 409, dry_run_distinto: 409, otro_re_disparo_gano: 409, corrida_no_viva: 409,
  catalogo_no_aplicado: 503, catalogo_incompleto: 409, lectura_fallida: 502,
}

export async function POST(request: Request) {
  const auth = checkInternalKey(request)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
  let c: Record<string, unknown>
  try { const j: unknown = await request.json(); if (typeof j !== 'object' || j === null || Array.isArray(j)) throw new Error('no objeto'); c = j as Record<string, unknown> } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }) }
  try {
    const d = await prevuelo({ client_id: c.client_id, corrida: c.corrida, dry_run: c.dry_run }, puertosDeSupabase(getSupabaseAdmin()))
    return NextResponse.json(d, { status: d.decision === 'no_corre' ? STATUS[d.motivo] ?? 200 : 200 })
  } catch (e) {
    return NextResponse.json({ error: 'prevuelo_error', detalle: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
