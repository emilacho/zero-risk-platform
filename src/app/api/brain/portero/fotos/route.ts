/**
 * GET /api/brain/portero/fotos?client_id=&origen=propia|competencia|referencia&etiquetadas=1&limite= · lectura INSTANTÁNEA de las fotos de un cliente (US$ 0, sin modelo):
 * cada foto con su ORIGEN y su etiqueta (qué muestra, producto visto, texto visible, confianza, toma). Devuelve también cuántas hay por origen y cuántas faltan por etiquetar.
 * Es la puerta hermana de `GET /api/brain/consultar` (que devuelve fichas, no fotos). Llave interna (`x-api-key`).
 */
import { NextResponse } from 'next/server'
import { checkInternalKey } from '@/lib/internal-auth'
import { consultaDelEntorno } from '@/lib/cerebro/portero/entorno'
import { listarFotos, type OrigenDeFoto } from '@/lib/cerebro/portero/fotos-pendientes'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 30

export async function GET(request: Request) {
  const auth = checkInternalKey(request)
  if (!auth.ok) return NextResponse.json({ error: 'unauthorized', code: 'E-AUTH-001', detail: auth.reason }, { status: 401 })
  const u = new URL(request.url).searchParams
  const r = await listarFotos(consultaDelEntorno(), {
    cliente: u.get('client_id') ?? '',
    origen: (u.get('origen') as OrigenDeFoto | null) || null,
    soloEtiquetadas: ['1', 'true'].includes(u.get('etiquetadas') ?? ''),
    limite: u.get('limite') ? Number(u.get('limite')) : undefined,
  })
  return NextResponse.json(r, { status: r.ok ? 200 : r.error === 'entrada_invalida' ? 400 : 502 })
}
