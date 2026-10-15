/**
 * GET/POST /api/brain/alimentar/no-corrio · la alarma de «no corrió»: lo llama un cron de Vercel (~14:00 UTC, después de la corrida diaria ≈12:30 UTC), INDEPENDIENTE del flujo.
 * Mira si existe la corrida de hoy y está `hecha`; si no, UNA línea a #alertas (el primer día sin corrida y un recordatorio al 4.º; si el vigilante ya apagó y avisó, silencio).
 * Todo bien = silencio. US$ 0 (solo lee; ni Apify ni modelo). Auth: `Authorization: Bearer <CRON_SECRET>` (Vercel Cron) o la llave interna.
 * GET (cron) actúa de verdad; POST acepta `dry_run` (por omisión true: solo evalúa).
 */
import crypto from 'node:crypto'
import { NextResponse } from 'next/server'
import { checkInternalKey } from '@/lib/internal-auth'
import { getSupabaseAdmin } from '@/lib/supabase'
import type { Db } from '@/lib/portero-alimenta/alimentar'
import { interruptoresDelEntorno } from '@/lib/portero-alimenta/datos'
import { avisarAAlertas, estadoDelFlujoDelPortero } from '@/lib/portero-alimenta/avisos'
import { FLUJO_DEL_PORTERO_POR_OMISION, rutaNoCorrio } from '@/lib/portero-alimenta/no-corrio'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

function autorizado(request: Request): boolean {
  const esperado = process.env.CRON_SECRET
  const dado = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? ''
  if (esperado && dado) {
    const a = Buffer.from(dado), b = Buffer.from(esperado)
    if (a.length === b.length && crypto.timingSafeEqual(a, b)) return true
  }
  return checkInternalKey(request).ok
}

async function correr(request: Request, dry_run: boolean) {
  if (!autorizado(request)) return NextResponse.json({ error: 'unauthorized', code: 'E-AUTH-001' }, { status: 401 })
  try {
    const db = getSupabaseAdmin() as unknown as Db
    const r = await rutaNoCorrio({ db, interruptores: interruptoresDelEntorno(), workflowId: process.env.PORTERO_WORKFLOW_ID || FLUJO_DEL_PORTERO_POR_OMISION, estadoDelFlujo: estadoDelFlujoDelPortero(), avisar: avisarAAlertas() }, { dry_run })
    return NextResponse.json(r.body, { status: r.status })
  } catch (e) {
    return NextResponse.json({ error: 'no_corrio_error', detalle: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}

export async function GET(request: Request) { return correr(request, false) }
export async function POST(request: Request) {
  let cuerpo: { dry_run?: unknown } = {}
  try { cuerpo = await request.json() } catch { /* sin cuerpo = ensayo */ }
  return correr(request, cuerpo.dry_run === false ? false : true)
}
