/** EL ESTUDIO · `GET /api/estudio/piezas?client_id=…&tipo=…` · la galería de un cliente, lo más nuevo primero. Solo lectura. */
import { NextResponse } from 'next/server'
import { checkInternalKey } from '@/lib/internal-auth'
import { TIPOS, type TipoDePieza } from '@/lib/estudio/catalogo'
import { depsReales } from '@/lib/estudio/deps'
import { listar } from '@/lib/estudio/servicio'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(request: Request) {
  const auth = checkInternalKey(request)
  if (!auth.ok) return NextResponse.json({ error: 'unauthorized', detail: auth.reason }, { status: 401 })
  const u = new URL(request.url)
  const tipo = u.searchParams.get('tipo')
  if (tipo && !TIPOS.includes(tipo as TipoDePieza)) return NextResponse.json({ error: 'tipo_invalido' }, { status: 400 })
  try {
    const r = await listar(depsReales(), u.searchParams.get('client_id') ?? '', tipo, Number(u.searchParams.get('limite') ?? 60) || 60)
    if (!r.ok) return NextResponse.json({ error: r.error, detalle: r.detalle }, { status: r.status })
    return NextResponse.json({ ok: true, piezas: r.valor })
  } catch (e) {
    return NextResponse.json({ error: 'lectura_fallida', detalle: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
