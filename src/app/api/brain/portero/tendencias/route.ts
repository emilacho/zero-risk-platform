/**
 * GET /api/brain/portero/tendencias?client_id=&nivel=global|pais|competencia|directa&red=&limite=&historial=1 · las tendencias del RUBRO de un cliente, en embudo (global → país → competencia → directa) y de lo más gustado a lo menos.
 * GET /api/brain/portero/tendencias?bodega=1&red=&limite=&historial=1 · la BODEGA VIRAL del mundo (aparte, no es de ningún cliente; la leen todas las oficinas).
 * US$ 0, sin modelo. Llave interna (`x-api-key`).
 */
import { NextResponse } from 'next/server'
import { checkInternalKey } from '@/lib/internal-auth'
import { consultaDelEntorno } from '@/lib/cerebro/portero/entorno'
import { listarTendencias } from '@/lib/cerebro/portero/tendencias-lectura'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'
export const runtime = 'nodejs'
export const maxDuration = 30

export async function GET(request: Request) {
  const auth = checkInternalKey(request)
  if (!auth.ok) return NextResponse.json({ error: 'unauthorized', code: 'E-AUTH-001', detail: auth.reason }, { status: 401 })
  const u = new URL(request.url).searchParams
  const r = await listarTendencias(consultaDelEntorno(), {
    cliente: u.get('client_id'),
    bodega: ['1', 'true'].includes(u.get('bodega') ?? ''),
    nivel: u.get('nivel') || null,
    red: u.get('red') || null,
    limite: u.get('limite') ? Number(u.get('limite')) : undefined,
    historial: ['1', 'true'].includes(u.get('historial') ?? ''),
  })
  return NextResponse.json(r, { status: r.ok ? 200 : r.error === 'entrada_invalida' ? 400 : 502 })
}
