/**
 * EL ESTUDIO · `/api/estudio/papelera/vaciar` · borra lo que pasó 30 días en la papelera (fila y archivos propios). No gasta.
 * Después, en la misma pasada, vuelve a copiar a nuestro almacén lo que quedó solo en el proveedor (`rescatarArchivos` · GO-LENOVO 10-nov 14:55Z).
 * GET = el cron diario de Vercel (`Authorization: Bearer <CRON_SECRET>`), borra de verdad. POST con la llave interna: `dry_run` por omisión true (solo cuenta).
 */
import crypto from 'node:crypto'
import { NextResponse } from 'next/server'
import { checkInternalKey } from '@/lib/internal-auth'
import { depsReales } from '@/lib/estudio/deps'
import { rescatarArchivos, vaciarPapelera } from '@/lib/estudio/servicio'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 800

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
    const deps = depsReales()
    const r = await vaciarPapelera(deps, { dry_run })
    if (!r.ok) return NextResponse.json({ error: r.error, detalle: r.detalle }, { status: r.status })
    // el rescate no frena el vaciado: si falla, se informa y el vaciado queda hecho
    const rescate = await rescatarArchivos(deps, { dry_run }).catch((e) => ({ ok: false as const, status: 500, error: 'rescate_fallido', detalle: e instanceof Error ? e.message : String(e) }))
    return NextResponse.json({ ok: true, ...r.valor, rescate: rescate.ok ? rescate.valor : { error: rescate.error, detalle: rescate.detalle } })
  } catch (e) {
    return NextResponse.json({ error: 'vaciado_fallido', detalle: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}

export async function GET(request: Request) { return correr(request, false) }
export async function POST(request: Request) {
  let c: { dry_run?: unknown } = {}
  try { c = await request.json() } catch { /* sin cuerpo = ensayo */ }
  return correr(request, c.dry_run !== false)
}
