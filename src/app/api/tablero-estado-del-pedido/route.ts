/**
 * GET /api/tablero-estado-del-pedido?client_id=<uuid>&llave_formulario=<uuid>[&seco=true] · «Crear Campaña» sin vuelta atrás (GO Lenovo 10:28Z del 21-nov · contrato con CC2).
 * Solo lectura, con la llave interna (`x-api-key`), como el mínimo. Mientras el sistema reintenta solo, el botón sigue en «Campaña en proceso».
 *   200 `{ ok: true, pedido_id, estado_del_pedido: 'en_proceso' }` · `{ …, estado_del_pedido: 'nacida', campana_id }` · `{ …, estado_del_pedido: 'fallida', codigo }` (E-PLAN · E-ADMITE · E-SALA · E-TIEMPO)
 *   404 `sin_pedido` (esa llave nunca llegó) · 400 `entrada_invalida` · 401 sin llave · 503 `estado_ilegible`.
 */
import { NextResponse } from 'next/server'
import { checkInternalKey } from '@/lib/internal-auth'
import { almacenDeSupabase } from '@/lib/cadena/almacen-supabase'
import { estadoParaElTablero } from '@/lib/cadena/crear-campana'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(request: Request) {
  const auth = checkInternalKey(request)
  if (!auth.ok) return NextResponse.json({ ok: false, error: 'unauthorized', detail: auth.reason }, { status: 401 })
  const q = new URL(request.url).searchParams
  try {
    const r = await estadoParaElTablero(almacenDeSupabase(), { client_id: q.get('client_id'), llave_formulario: q.get('llave_formulario'), seco: q.get('seco') })
    return NextResponse.json(r.cuerpo, { status: r.status, headers: { 'Cache-Control': 'no-store' } })
  } catch (e) {
    return NextResponse.json({ ok: false, error: 'estado_ilegible', detalle: `no se pudo leer el estado del pedido (${e instanceof Error ? e.message : String(e)})` }, { status: 503 })
  }
}
