/**
 * GET /api/apify/credito · la pregunta de la puerta del flujo de Apify: «¿queda crédito este mes?» (10-nov). Llave interna. Solo lectura de la cuenta de Apify, US$ 0. Tope = límite de gasto del mes; si falta, crédito del plan.
 * Ver `lib/apify/credito.ts`. Una lectura caída responde `hay_credito: true, leido: false` (la puerta deja pasar, como hasta hoy).
 */
import { NextResponse } from 'next/server'
import { checkInternalKey } from '@/lib/internal-auth'
import { creditoDeApify, creditoSinLeer, leerUsoDelMes } from '@/lib/apify/credito'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(request: Request) {
  const auth = checkInternalKey(request)
  if (!auth.ok) return NextResponse.json({ error: 'unauthorized', detail: auth.reason }, { status: 401 })
  const r = await leerUsoDelMes()
  return NextResponse.json(r.ok ? creditoDeApify(r.uso) : creditoSinLeer(r.detalle), { headers: { 'Cache-Control': 'no-store' } })
}
