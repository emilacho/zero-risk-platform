/**
 * POST /api/brain/alimentar/puente · la RECONCILIACIÓN del puente a la biblioteca, por pasadas (≤ 40 trozos por llamada): fichas buscables sin trozo ⇒ se envían; trozos de fichas
 * retiradas, descartadas, repetidas o inexistentes ⇒ salen. Idempotente; el flujo la repite hasta que `quedan` es 0. No lee Apify ni llama a ningún modelo (US$ 0).
 * `dry_run` obligatorio (con true solo cuenta); con false exige workflow_id + workflow_execution_id. Apagada por `PORTERO_ALIMENTAR` y `PORTERO_PUENTE_AL_INDICE`. Llave interna.
 */
import { NextResponse } from 'next/server'
import { checkInternalKey } from '@/lib/internal-auth'
import { getSupabaseAdmin } from '@/lib/supabase'
import type { Db } from '@/lib/portero-alimenta/alimentar'
import { interruptoresDelEntorno } from '@/lib/portero-alimenta/datos'
import { puenteAlIndice } from '@/lib/portero-alimenta/entorno'
import { rutaPuente } from '@/lib/portero-alimenta/rutas'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 120

export async function POST(request: Request) {
  const auth = checkInternalKey(request)
  if (!auth.ok) return NextResponse.json({ error: 'unauthorized', code: 'E-AUTH-001', detail: auth.reason }, { status: 401 })
  let cuerpo: unknown
  try { cuerpo = await request.json() } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }) }
  try {
    const b = (cuerpo && typeof cuerpo === 'object' ? cuerpo : {}) as Record<string, unknown>
    const db = getSupabaseAdmin() as unknown as Db
    const real = b.dry_run === false && typeof b.workflow_id === 'string' && typeof b.workflow_execution_id === 'string'
    const r = await rutaPuente({ db, interruptores: interruptoresDelEntorno(), puente: real ? puenteAlIndice({ origen: new URL(request.url).origin, llaveInterna: process.env.INTERNAL_API_KEY ?? '', db }) : undefined }, cuerpo)
    return NextResponse.json(r.body, { status: r.status })
  } catch (e) {
    return NextResponse.json({ error: 'portero_error', detalle: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
