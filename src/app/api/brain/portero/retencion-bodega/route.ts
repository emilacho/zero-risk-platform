/**
 * /api/brain/portero/retencion-bodega · la retención de 90 días de los VIDEOS de la bodega del mundo (01-nov).
 * GET (cron de Vercel con CRON_SECRET, o llave interna) actúa de verdad; POST {dry_run} (por omisión true: solo cuenta). Solo borra el ARCHIVO; capturas, etiquetas, transcripción y datos se quedan. Nunca toca archivos de un cliente.
 */
import crypto from 'node:crypto'
import { NextResponse } from 'next/server'
import { checkInternalKey } from '@/lib/internal-auth'
import { retenerLaBodega } from '@/lib/portero-alimenta/retencion-de-la-bodega'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 120

function autorizado(request: Request): boolean {
  const esperado = process.env.CRON_SECRET
  const dado = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? ''
  if (esperado && dado) {
    const a = Buffer.from(dado), b = Buffer.from(esperado)
    if (a.length === b.length && crypto.timingSafeEqual(a, b)) return true
  }
  return checkInternalKey(request).ok
}

async function correr(dry_run: boolean) {
  const r = await retenerLaBodega({ urlDeLaBase: process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? '', llave: process.env.SUPABASE_SERVICE_ROLE_KEY ?? '', ahora: new Date(), dry_run })
  return NextResponse.json({ ok: r.fallidos.length === 0, ...r }, { status: 200 })
}

export async function GET(request: Request) {
  if (!autorizado(request)) return NextResponse.json({ error: 'unauthorized', code: 'E-AUTH-001' }, { status: 401 })
  try { return await correr(false) } catch (e) { return NextResponse.json({ error: 'retencion_error', detalle: e instanceof Error ? e.message : String(e) }, { status: 500 }) }
}

export async function POST(request: Request) {
  if (!autorizado(request)) return NextResponse.json({ error: 'unauthorized', code: 'E-AUTH-001' }, { status: 401 })
  let b: Record<string, unknown> = {}
  try { b = (await request.json()) as Record<string, unknown> } catch { /* sin cuerpo = en seco */ }
  try { return await correr(b.dry_run !== false) } catch (e) { return NextResponse.json({ error: 'retencion_error', detalle: e instanceof Error ? e.message : String(e) }, { status: 500 }) }
}
