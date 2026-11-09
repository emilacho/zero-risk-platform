/**
 * /api/dueno/preguntas · las preguntas al dueño en la plataforma (CC1 · 06-nov · firma de Emilio vía Lenovo · diseño de Cerebro). La lógica: `src/lib/dueno-preguntas/preguntas.ts`.
 *  · POST `{ accion: 'preguntar' | 'responder' | 'asumir' | 'descartar', client_id, workflow_id, workflow_execution_id, ... }`
 *  · GET `?client_id=…&tema=…` · las pendientes de las últimas 72 h.
 * Llave: `x-api-key` = `INTERNAL_API_KEY`. US$ 0: no llama a ningún modelo. Al cerebro solo van la respuesta y el supuesto asumido, por su puerta.
 */
import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { checkInternalKey } from '@/lib/finanzas/ruta'
import { baseDeRunSdk } from '@/lib/finanzas/conversa/modelo-run-sdk'
import { rutaPendientes, rutaPreguntas } from '@/lib/dueno-preguntas/preguntas'
import { cerebroPorHttp } from '@/lib/dueno-preguntas/cerebro-http'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(request: Request) {
  const auth = checkInternalKey(request)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
  let c: unknown
  try { c = await request.json() } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }) }
  const r = await rutaPreguntas({ db: getSupabaseAdmin(), cerebro: cerebroPorHttp({ base: baseDeRunSdk(process.env), llave: process.env.INTERNAL_API_KEY ?? '' }) }, c)
  return NextResponse.json(r.body, { status: r.status })
}

export async function GET(request: Request) {
  const auth = checkInternalKey(request)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const u = new URL(request.url)
  const r = await rutaPendientes({ db: getSupabaseAdmin() }, { client_id: u.searchParams.get('client_id') ?? '', tema: u.searchParams.get('tema') })
  return NextResponse.json(r.body, { status: r.status })
}
