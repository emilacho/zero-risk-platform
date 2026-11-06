/**
 * POST /api/planeacion/compuerta · la compuerta del plan antes del redactor (tramo 1 · CC1 · 06-nov). NADIE la llama todavía: el tramo 2 la cablea en el flujo.
 * Cuerpo: `{ client_id, workflow_id, workflow_execution_ids: [...] }`. Llave: `x-api-key` = `INTERNAL_API_KEY`. Solo lee. Sin modelo, sin gasto.
 * Contesta `{ decision: 'sigue' | 'espera', abiertas, cerradas, supuestos_del_dueno }`. 400 entrada · 502 lectura fallida (con `decision: 'espera'`).
 */
import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { checkInternalKey } from '@/lib/finanzas/ruta'
import { compuerta } from '@/lib/planeacion/compuerta'
import { compuertaDeSupabase } from '@/lib/planeacion/compuerta-supabase'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(request: Request) {
  const auth = checkInternalKey(request)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
  let c: Record<string, unknown>
  try { const j: unknown = await request.json(); if (typeof j !== 'object' || j === null || Array.isArray(j)) throw new Error('no objeto'); c = j as Record<string, unknown> } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }) }
  const r = await compuerta(c, compuertaDeSupabase(getSupabaseAdmin()))
  return NextResponse.json(r.cuerpo, { status: r.status })
}
