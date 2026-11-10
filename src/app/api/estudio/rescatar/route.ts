/**
 * EL ESTUDIO · `/api/estudio/rescatar` · vuelve a copiar a nuestro almacén lo que quedó solo en el proveedor (GO-LENOVO 10-nov 14:55Z). No gasta.
 * Lo mismo corre solo cada día con el cron de la papelera; esta ruta es para correrlo a mano. POST con la llave interna; `dry_run` por omisión true (solo cuenta).
 */
import { NextResponse } from 'next/server'
import { checkInternalKey } from '@/lib/internal-auth'
import { depsReales } from '@/lib/estudio/deps'
import { rescatarArchivos } from '@/lib/estudio/servicio'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 800

export async function POST(request: Request) {
  if (!checkInternalKey(request).ok) return NextResponse.json({ error: 'unauthorized', code: 'E-AUTH-001' }, { status: 401 })
  let c: { dry_run?: unknown } = {}
  try { c = await request.json() } catch { /* sin cuerpo = ensayo */ }
  try {
    const r = await rescatarArchivos(depsReales(), { dry_run: c.dry_run !== false })
    if (!r.ok) return NextResponse.json({ error: r.error, detalle: r.detalle }, { status: r.status })
    return NextResponse.json({ ok: true, ...r.valor })
  } catch (e) {
    return NextResponse.json({ error: 'rescate_fallido', detalle: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
