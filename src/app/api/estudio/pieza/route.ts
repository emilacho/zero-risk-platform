/**
 * EL ESTUDIO · `GET /api/estudio/pieza?id=…` · el estado de una pieza; si sigue creándose, pregunta al proveedor y, al terminar, la guarda y anota su costo.
 */
import { NextResponse } from 'next/server'
import { checkInternalKey } from '@/lib/internal-auth'
import { depsReales } from '@/lib/estudio/deps'
import { avanzar } from '@/lib/estudio/servicio'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 120

export async function GET(request: Request) {
  const auth = checkInternalKey(request)
  if (!auth.ok) return NextResponse.json({ error: 'unauthorized', detail: auth.reason }, { status: 401 })
  const id = new URL(request.url).searchParams.get('id') ?? ''
  try {
    const r = await avanzar(depsReales(), id)
    if (!r.ok) return NextResponse.json({ error: r.error, detalle: r.detalle }, { status: r.status })
    return NextResponse.json({ ok: true, pieza: r.valor })
  } catch (e) {
    return NextResponse.json({ error: 'lectura_fallida', detalle: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
