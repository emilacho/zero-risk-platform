/**
 * GET /api/apify/credito · la pregunta de la puerta del flujo de Apify: «¿queda crédito este mes?» (10-nov). Llave interna. Solo lectura de la cuenta de Apify, US$ 0. Tope = límite de gasto del mes; si falta, crédito del plan.
 * Ver `lib/apify/credito.ts`. Una lectura caída responde `hay_credito: true, leido: false` (la puerta deja pasar, como hasta hoy).
 * 19-nov (#1085): y abre UNA alarma por incidente en #alertas; cuando la cuenta se vuelve a leer, la cierra (`lib/apify/credito-aviso.ts`). La respuesta no cambia.
 */
import { NextResponse } from 'next/server'
import { checkInternalKey } from '@/lib/internal-auth'
import { getSupabaseAdmin } from '@/lib/supabase'
import { creditoDeApify, creditoSinLeer, leerUsoDelMes } from '@/lib/apify/credito'
import { avisarLecturaDelCredito } from '@/lib/apify/credito-aviso'
import { dependenciasReales, type Db } from '@/lib/avisos/adaptadores'
import type { Dependencias } from '@/lib/avisos/nucleo'

function dependenciasDeAvisos(): Dependencias | null {
  try { return dependenciasReales(getSupabaseAdmin() as unknown as Db) } catch { return null }
}

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(request: Request) {
  const auth = checkInternalKey(request)
  if (!auth.ok) return NextResponse.json({ error: 'unauthorized', detail: auth.reason }, { status: 401 })
  const r = await leerUsoDelMes()
  await avisarLecturaDelCredito(r, dependenciasDeAvisos())
  return NextResponse.json(r.ok ? creditoDeApify(r.uso) : creditoSinLeer(r.detalle), { headers: { 'Cache-Control': 'no-store' } })
}
