/**
 * GET|POST /api/planeacion/catalogo · el SNAPSHOT del catálogo del plan v3 (V3 · CC#1 · 15-oct). «Armar el paquete» lo pide UNA vez por corrida y lo mete con
 * `version` y `huella`; los chequeos y el redactor leen del paquete, nunca de la base. Solo LEE. NADIE la llama todavía; las tablas nacen SIN aplicar.
 * Llave: `x-api-key` = `INTERNAL_API_KEY` (nunca `SALA_DISPATCH_KEY`). FALLA CERRADO: `503 catalogo_no_aplicado` · `502 lectura_fallida` · `409 catalogo_incompleto`.
 */
import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { checkInternalKey } from '@/lib/finanzas/ruta'
import { leerCatalogo, type Db } from '@/lib/planeacion/catalogo/leer'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const STATUS = { catalogo_no_aplicado: 503, lectura_fallida: 502, catalogo_incompleto: 409 } as const

async function manejar(request: Request): Promise<Response> {
  const auth = checkInternalKey(request)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const r = await leerCatalogo(getSupabaseAdmin() as unknown as Db)
  if (!r.ok) return NextResponse.json({ ok: false, error: r.causa, detalle: r.detalle }, { status: STATUS[r.causa] })
  const { snapshot } = r
  return NextResponse.json({ ok: true, catalogo_version: snapshot.version, catalogo_huella: snapshot.huella, filas: snapshot.filas })
}
export const GET = manejar
export const POST = manejar
