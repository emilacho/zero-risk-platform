/**
 * GET /api/brain/portero/comentarios-competencia?client_id=&red=tiktok|instagram|x|facebook&cuenta=&limite= · lo que la gente comenta en las publicaciones de los competidores del cliente, con la fecha real del comentario.
 * US$ 0, sin modelo. Llave interna (`x-api-key`). No son opiniones sobre el cliente: son de terceros sobre otro negocio.
 */
import { NextResponse } from 'next/server'
import { checkInternalKey } from '@/lib/internal-auth'
import { consultaDelEntorno } from '@/lib/cerebro/portero/entorno'
import { listarComentariosDeLaCompetencia } from '@/lib/cerebro/portero/comentarios-competencia-lectura'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'
export const runtime = 'nodejs'
export const maxDuration = 30

export async function GET(request: Request) {
  const auth = checkInternalKey(request)
  if (!auth.ok) return NextResponse.json({ error: 'unauthorized', code: 'E-AUTH-001', detail: auth.reason }, { status: 401 })
  const u = new URL(request.url).searchParams
  const r = await listarComentariosDeLaCompetencia(consultaDelEntorno(), { cliente: u.get('client_id') ?? '', red: u.get('red') || null, cuenta: u.get('cuenta') || null, limite: u.get('limite') ? Number(u.get('limite')) : undefined })
  return NextResponse.json(r, { status: r.ok ? 200 : r.error === 'entrada_invalida' ? 400 : 502 })
}
