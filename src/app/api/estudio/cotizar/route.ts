/**
 * EL ESTUDIO · `POST /api/estudio/cotizar` · el costo ANTES de crear (imagen y 3D con la lista publicada; video con la estimación gratis de Higgsfield).
 * No crea nada ni gasta. Solo con la llave interna (el dashboard la pone en el servidor tras comprobar la sesión del administrador).
 */
import { NextResponse } from 'next/server'
import { checkInternalKey } from '@/lib/internal-auth'
import { armarPedido } from '@/lib/estudio/catalogo'
import { depsReales } from '@/lib/estudio/deps'
import { cotizar } from '@/lib/estudio/servicio'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
const FOTO_CUALQUIERA = '00000000-0000-4000-8000-000000000000'

export async function POST(request: Request) {
  const auth = checkInternalKey(request)
  if (!auth.ok) return NextResponse.json({ error: 'unauthorized', detail: auth.reason }, { status: 401 })
  let body: Record<string, unknown>
  try { body = (await request.json()) as Record<string, unknown> } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }) }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  const d = depsReales()
  // para cotizar no hace falta la foto entera: basta saber si la hay (el precio no depende de cuál)
  const conFoto = body.con_foto === true || (typeof body.foto_b64 === 'string' && body.foto_b64.length > 0) || (typeof body.foto_pieza_id === 'string' && body.foto_pieza_id.length > 0) || (typeof body.rehacer_pieza_id === 'string' && body.rehacer_pieza_id.length > 0)
  // varias referencias (GO 09-nov): basta saber cuántas; el precio no depende de cuáles
  const nFotos = Array.isArray(body.fotos) ? body.fotos.length : Number(body.n_fotos) || 0
  const fotos = nFotos >= 2 ? Array.from({ length: Math.min(nFotos, 99) }, (_, i) => ({ numero: i + 1, pieza_id: FOTO_CUALQUIERA })) : undefined
  const a = armarPedido({ ...body, fotos, n_fotos: undefined, foto_b64: undefined, rehacer_pieza_id: undefined, foto_pieza_id: conFoto && !fotos ? FOTO_CUALQUIERA : undefined, clave: 'cotizacion-sin-gasto' }, d.modeloDeImagen)
  if (!a.ok) return NextResponse.json({ error: 'pedido_invalido', errores: a.errores }, { status: 400 })
  try {
    const r = await cotizar(d, a.pedido)
    if (!r.ok) return NextResponse.json({ error: r.error, detalle: r.detalle }, { status: r.status })
    return NextResponse.json({ ok: true, ...r.valor })
  } catch (e) {
    return NextResponse.json({ error: 'cotizacion_fallida', detalle: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
