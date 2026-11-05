/**
 * EL ESTUDIO · `POST /api/estudio/crear` · crea una imagen (en el momento), o encarga un video o un 3D (la pantalla pregunta con `GET /api/estudio/pieza`).
 * Esto GASTA: lo pide el dueño con un clic tras ver la cotización. Sin tope ni freno (firma de Emilio 05-nov). `dry_run: true` → solo valida y cotiza, nada sale a gastar.
 * No es un agente: no pasa por `run-sdk` ni por el freno §150; su gasto va al libro `costs` (`service = estudio:<proveedor>`).
 */
import { NextResponse } from 'next/server'
import { checkInternalKey } from '@/lib/internal-auth'
import { armarPedido } from '@/lib/estudio/catalogo'
import { depsReales } from '@/lib/estudio/deps'
import { cotizar, crear } from '@/lib/estudio/servicio'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 800

export async function POST(request: Request) {
  const auth = checkInternalKey(request)
  if (!auth.ok) return NextResponse.json({ error: 'unauthorized', detail: auth.reason }, { status: 401 })
  let body: Record<string, unknown>
  try { body = (await request.json()) as Record<string, unknown> } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }) }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  const d = depsReales()
  const a = armarPedido(body, d.modeloDeImagen)
  if (!a.ok) return NextResponse.json({ error: 'pedido_invalido', errores: a.errores }, { status: 400 })
  try {
    if (body.dry_run === true) {
      const c = await cotizar(d, a.pedido)
      if (!c.ok) return NextResponse.json({ error: c.error, detalle: c.detalle }, { status: c.status })
      return NextResponse.json({ ok: true, dry_run: true, tipo: a.pedido.tipo, modelo: a.pedido.modelo, ...c.valor })
    }
    const r = await crear(d, a.pedido)
    if (!r.ok) return NextResponse.json({ error: r.error, detalle: r.detalle }, { status: r.status })
    return NextResponse.json({ ok: true, ya_existia: r.valor.ya_existia, pieza: r.valor.pieza }, { status: r.valor.ya_existia ? 200 : 201 })
  } catch (e) {
    return NextResponse.json({ error: 'creacion_fallida', detalle: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
