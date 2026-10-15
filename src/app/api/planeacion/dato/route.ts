/**
 * POST /api/planeacion/dato · arma el `dato.v1` del cliente para el plan v3 (CONEXIÓN · CC#1 · 15-oct). El flujo de planeación la llama DETRÁS de `plan_v3:true`; sin él nadie la llama.
 * Cuerpo: `{ client_id, dry_run?, relleno_permitido?, huecos_tipos? }` (dry_run AUSENTE = real). Llave: `x-api-key` = `INTERNAL_API_KEY` (nunca `SALA_DISPATCH_KEY`).
 * SOLO LEE: US$ 0, sin modelo, sin Apify, sin escribir. Contesta `{ ok, datos, criticos, catalogo_version, catalogo_huella, semilla, lexico, relleno_plan, resumen, recolectado_en }`.
 * Estados: 400 entrada · 409 catálogo incompleto · 502 lectura fallida · 503 catálogo sin aplicar · 200 el resto.
 */
import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { checkInternalKey } from '@/lib/finanzas/ruta'
import { armarDatoV1 } from '@/lib/planeacion/dato-v1/armar'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

const STATUS: Record<string, number> = { entrada_invalida: 400, dry_run_no_booleano: 400, catalogo_no_aplicado: 503, catalogo_incompleto: 409, lectura_fallida: 502 }

export async function POST(request: Request) {
  const auth = checkInternalKey(request)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
  let c: Record<string, unknown>
  try { const j: unknown = await request.json(); if (typeof j !== 'object' || j === null || Array.isArray(j)) throw new Error('no objeto'); c = j as Record<string, unknown> } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }) }
  try {
    const r = await armarDatoV1(getSupabaseAdmin() as never, { client_id: c.client_id, dry_run: c.dry_run, relleno_permitido: c.relleno_permitido, huecos_tipos: c.huecos_tipos })
    return NextResponse.json(r, { status: r.ok ? 200 : STATUS[r.error] ?? 500 })
  } catch (e) {
    return NextResponse.json({ ok: false, error: 'dato_error', detalle: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
