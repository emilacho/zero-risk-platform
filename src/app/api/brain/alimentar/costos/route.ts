/**
 * GET /api/brain/alimentar/costos · cuánto costó cada cliente del portero hoy (Apify y modelo), el umbral global en proporción a los clientes activos (`base + por_cliente × activos`) y quién pasó sus umbrales.
 * Llave interna (`INTERNAL_API_KEY`). Solo lee. US$ 0, sin modelo. Los umbrales por cliente firmados (aviso > 3 · apaga > 10) no cambian.
 */
import { NextResponse } from 'next/server'
import { checkInternalKey } from '@/lib/internal-auth'
import { getSupabaseAdmin } from '@/lib/supabase'
import type { Db } from '@/lib/portero-alimenta/alimentar'
import { rutaCostos } from '@/lib/portero-alimenta/costos'
import { leerUsoDelPlan } from '@/lib/portero-alimenta/plan-apify'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 120

export async function GET(request: Request) {
  const auth = checkInternalKey(request)
  if (!auth.ok) return NextResponse.json({ error: 'unauthorized', code: 'E-AUTH-001', detail: auth.reason }, { status: 401 })
  try {
    const r = await rutaCostos({ db: getSupabaseAdmin() as unknown as Db, usoDelPlan: () => leerUsoDelPlan() })
    return NextResponse.json(r.body, { status: r.status })
  } catch (e) {
    return NextResponse.json({ error: 'costos_error', detalle: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
