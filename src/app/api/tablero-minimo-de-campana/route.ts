/**
 * GET /api/tablero-minimo-de-campana?client_id=<uuid>[&fecha_inicio=AAAA-MM-DD&fecha_fin=AAAA-MM-DD] · «Crear Campaña» (entrega 2 · contrato con CC2 de las 21:04Z).
 * Solo lectura, con la llave interna (`x-api-key`). Lo menos que puede ser el tope de la campaña nueva: su planificación + una pieza en su peor caso + la jefatura de sus documentos.
 *   200 `{ ok: true, minimo_usd, detalle: { planificacion_usd, pieza_peor_usd, jefatura_usd }, fechas: { inicio, fin } }`
 *   409 `{ ok: false, error: 'sin_plan_aprobado' }` · 400 `entrada_invalida` · 401 sin llave · 503 `minimo_ilegible` (el formulario no deja crear).
 * Carpeta propia al lado de `tablero/[accion]`: una carpeta fija `tablero/crear-campana/` se llevaría también el POST de crear.
 */
import { NextResponse } from 'next/server'
import { checkInternalKey } from '@/lib/internal-auth'
import { almacenDeSupabase } from '@/lib/cadena/almacen-supabase'
import { minimoParaElFormulario } from '@/lib/cadena/crear-campana'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(request: Request) {
  const auth = checkInternalKey(request)
  if (!auth.ok) return NextResponse.json({ ok: false, error: 'unauthorized', detail: auth.reason }, { status: 401 })
  const q = new URL(request.url).searchParams
  try {
    const r = await minimoParaElFormulario(almacenDeSupabase(), { client_id: q.get('client_id'), fecha_inicio: q.get('fecha_inicio'), fecha_fin: q.get('fecha_fin') }, new Date().toISOString())
    return NextResponse.json(r.cuerpo, { status: r.status })
  } catch (e) {
    return NextResponse.json({ ok: false, error: 'minimo_ilegible', detalle: `tope: no se pudo calcular el mínimo (${e instanceof Error ? e.message : String(e)}); todavía no se puede crear` }, { status: 503 })
  }
}
