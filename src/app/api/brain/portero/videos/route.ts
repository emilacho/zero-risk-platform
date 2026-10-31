/**
 * GET /api/brain/portero/videos?client_id=&origen=propia|competencia|referencia&tipo=reel|video_feed|historia|anuncio|video_web&limite= · lectura INSTANTÁNEA de los videos de un cliente (US$ 0, sin modelo):
 * cada video con sus subcategorías (tipo, origen, cuenta, fecha, duración, pie, métricas), su transcripción, sus capturas de momentos clave etiquetadas y una dirección FIRMADA (1 hora) del archivo.
 * Es la puerta hermana de `GET /api/brain/portero/fotos`. Llave interna (`x-api-key`).
 */
import { NextResponse } from 'next/server'
import { checkInternalKey } from '@/lib/internal-auth'
import { consultaDelEntorno } from '@/lib/cerebro/portero/entorno'
import { listarVideos } from '@/lib/cerebro/portero/videos-lectura'
import { firmarVideoDelEntorno } from '@/lib/portero-alimenta/videos-del-cerebro'
import type { OrigenDeFoto } from '@/lib/cerebro/portero/fotos-pendientes'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 30

export async function GET(request: Request) {
  const auth = checkInternalKey(request)
  if (!auth.ok) return NextResponse.json({ error: 'unauthorized', code: 'E-AUTH-001', detail: auth.reason }, { status: 401 })
  const u = new URL(request.url).searchParams
  const r = await listarVideos(consultaDelEntorno(), {
    cliente: u.get('client_id') ?? '',
    origen: (u.get('origen') as OrigenDeFoto | null) || null,
    tipo: u.get('tipo') || null,
    limite: u.get('limite') ? Number(u.get('limite')) : undefined,
  }, firmarVideoDelEntorno())
  return NextResponse.json(r, { status: r.ok ? 200 : r.error === 'entrada_invalida' ? 400 : 502 })
}
