/**
 * POST /api/brain/portero/razonar · la ÚNICA llamada al modelo del portero (Sonnet 5.5, razonamiento al mínimo, 1.500 de salida, 25 s,
 * una llamada, sin reintentos). Exige `workflow_id` y `workflow_execution_id` y registra cada llamada por `log-invocation`.
 * Ruta NUEVA del portero del cerebro (tramo 2). Auth igual a las rutas internas: `x-api-key: INTERNAL_API_KEY`.
 */
import { NextResponse } from 'next/server'
import { checkInternalKey } from '@/lib/internal-auth'
import { llamarAlModelo } from '@/lib/cerebro/portero/modelo'
import { razonar } from '@/lib/cerebro/portero/razonar'
import { consultaDelEntorno } from '@/lib/cerebro/portero/entorno'
import { crearRegistrador } from '@/lib/cerebro/portero/registro'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(request: Request) {
  const auth = checkInternalKey(request)
  if (!auth.ok) return NextResponse.json({ error: 'unauthorized', code: 'E-AUTH-001', detail: auth.reason }, { status: 401 })
  let cuerpo: unknown
  try { cuerpo = await request.json() } catch { return NextResponse.json({ error: 'invalid_json', code: 'E-INPUT-PARSE' }, { status: 400 }) }
  const r = await razonar(
    {
      consulta: consultaDelEntorno(),
      llamarModelo: llamarAlModelo,
      registrar: crearRegistrador({ origen: new URL(request.url).origin, llaveInterna: process.env.INTERNAL_API_KEY ?? '' }),
    },
    cuerpo,
  )
  return NextResponse.json(r.cuerpo, { status: r.status })
}
