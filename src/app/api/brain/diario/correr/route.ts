/**
 * POST /api/brain/diario/correr · RETIRADA (14-oct, firma «el portero alimenta el cerebro y las oficinas buscan»): el diario viejo (comparar · limpiar · preparar) escribía
 * `cerebro_vigilancia` y `cerebro_oportunidades`, que NADIE lee (y un canal de «oportunidades» para empujar a las oficinas contradice «cada oficina va al cerebro»).
 * Lo reemplaza el portero que alimenta: `/api/brain/alimentar/{descubrir,procesar,puente}`. NO se enciende nunca. Las tablas quedan (sin borrar) como historia vacía.
 * La ruta responde 410 (con la llave interna, como todas) para que nadie la use por error; la lógica queda en `src/lib/cerebro/diario/` solo como referencia probada.
 */
import { NextResponse } from 'next/server'
import { checkInternalKey } from '@/lib/internal-auth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(request: Request) {
  const auth = checkInternalKey(request)
  if (!auth.ok) return NextResponse.json({ error: 'unauthorized', code: 'E-AUTH-001', detail: auth.reason }, { status: 401 })
  return NextResponse.json({ error: 'retirada', code: 'E-RETIRADA', detalle: 'el diario viejo está RETIRADO: usa /api/brain/alimentar/{descubrir,procesar,puente}', modelos_llamados: 0 }, { status: 410 })
}
