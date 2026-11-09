/**
 * GET /api/brain/alimentar/modo · el modo del portero (28-oct): `construccion` (3 corridas completas al día: 12:30, 18:30 y 00:30 UTC) o `campana` (1: 12:30 UTC). Desde el 2-nov la frecuencia es dato aparte: `PORTERO_CORRIDAS_POR_DIA` (1..3) recorta las horas del modo.
 * El flujo del portero dispara a las TRES horas y su primer paso pregunta aquí si TOCA correr ahora: así cambiar de modo es cambiar un dato (`PORTERO_MODO` en Vercel), sin tocar el flujo.
 * También dice el tope diario por cliente del modo y cuánto lleva usado el plan de Apify (solo lectura, US$ 0). Llave interna (`x-api-key`).
 */
import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import type { Db } from '@/lib/portero-alimenta/alimentar'
import { resolverIncidente } from '@/lib/portero-alimenta/alertas'
import { avisarAAlertas } from '@/lib/portero-alimenta/avisos'
import { checkInternalKey } from '@/lib/internal-auth'
import { corridaDeLaHora } from '@/lib/portero-alimenta/modo-ruta'
import { leerUsoDelPlan } from '@/lib/portero-alimenta/plan-apify'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 30

export async function GET(request: Request) {
  const auth = checkInternalKey(request)
  if (!auth.ok) return NextResponse.json({ error: 'unauthorized', code: 'E-AUTH-001', detail: auth.reason }, { status: 401 })
  try {
    const db = getSupabaseAdmin() as unknown as Db
    // la pausa del raspado (09-nov): cada disparo del horario sostiene su línea en `cerebro_alertas` (o la cierra al vencer)
    return NextResponse.json(await corridaDeLaHora({ uso: () => leerUsoDelPlan(), avisar: avisarAAlertas({ db }), resolver: async (clave, nota) => { const r = await resolverIncidente({ db })(clave, nota); return { ok: r.ok, detalle: r.detalle } } }), { status: 200 })
  } catch (e) {
    return NextResponse.json({ error: 'modo_error', detalle: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
