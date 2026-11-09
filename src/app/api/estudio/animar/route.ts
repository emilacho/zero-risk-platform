/**
 * EL ESTUDIO · `POST /api/estudio/animar` · anima un modelo 3D del Estudio (esqueleto + movimientos de la biblioteca de Meshy, vía fal.ai).
 * El resultado es una pieza nueva (3D, `meshy-animar`) ligada al modelo de origen; la pantalla pregunta con `GET /api/estudio/pieza`.
 * Esto GASTA: lo pide el dueño con un clic tras ver el costo. Sin tope ni freno (firma de Emilio 05-nov). `dry_run: true` → solo valida y cotiza.
 * No es un agente: no pasa por `run-sdk` ni por el freno §150; su gasto va al libro `costs` (`service = estudio:fal`).
 */
import { NextResponse } from 'next/server'
import { checkInternalKey } from '@/lib/internal-auth'
import { armarAnimacion } from '@/lib/estudio/catalogo'
import { depsReales } from '@/lib/estudio/deps'
import { cotizarLaAnimacion, crearAnimacion, movimientoExiste } from '@/lib/estudio/servicio'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 800

export async function POST(request: Request) {
  const auth = checkInternalKey(request)
  if (!auth.ok) return NextResponse.json({ error: 'unauthorized', detail: auth.reason }, { status: 401 })
  let body: Record<string, unknown>
  try { body = (await request.json()) as Record<string, unknown> } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }) }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  const a = armarAnimacion(body, movimientoExiste)
  if (!a.ok) return NextResponse.json({ error: 'pedido_invalido', errores: a.errores }, { status: 400 })
  const d = depsReales()
  try {
    if (body.dry_run === true) {
      const c = await cotizarLaAnimacion(d, a.pedido)
      if (!c.ok) return NextResponse.json({ error: c.error, detalle: c.detalle }, { status: c.status })
      return NextResponse.json({ ok: true, dry_run: true, ...c.valor })
    }
    const r = await crearAnimacion(d, a.pedido)
    if (!r.ok) return NextResponse.json({ error: r.error, detalle: r.detalle }, { status: r.status })
    return NextResponse.json({ ok: true, ya_existia: r.valor.ya_existia, pieza: r.valor.pieza }, { status: r.valor.ya_existia ? 200 : 201 })
  } catch (e) {
    return NextResponse.json({ error: 'animacion_fallida', detalle: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
