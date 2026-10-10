/**
 * POST /api/manual/revisar · LA PUERTA · S0/S1/S3 + la evidencia FILTRADA para el juez de fidelidad. `dry_run` obligatorio; con false exige workflow_id + workflow_execution_id. No llama a ningún modelo ni escribe. Llaves: interna + de despacho.
 * La revisión del manual nace APAGADA: nadie la llama todavía (el flujo n8n es inactivo).
 */
import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { autorizar } from '@/lib/manual/rutas'
import { rutaRevisar } from '@/lib/manual/rutas'
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
    const r = await rutaRevisar(getSupabaseAdmin() as unknown as Db, cuerpo)
    return NextResponse.json(r.body, { status: r.status })
  } catch (e) {
    return NextResponse.json({ error: 'manual_error', detalle: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
