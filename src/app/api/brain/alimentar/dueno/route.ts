/**
 * POST /api/brain/alimentar/dueno · una oficina registra lo que respondió el dueño (`evento: 'respuesta'`, por omisión) o una pregunta que le hizo (`evento: 'pregunta'`).
 *   Respuesta → ficha «confirmada por el dueño» (origen dueno, cita literal, canal, fecha); una respuesta nueva al mismo tema REEMPLAZA a la anterior (la vieja queda archivada).
 *   Pregunta  → antes de registrarla dice si ya se respondió o si otra oficina ya la hizo y espera.
 * GET  /api/brain/alimentar/dueno?client_id=&tema=&sede_clave= · ¿ya se respondió? cuándo, por qué canal, y qué preguntas siguen pendientes. El agente decide si la respuesta sigue vigente.
 * Llave interna (`INTERNAL_API_KEY`), nunca `SALA_DISPATCH_KEY`. `dry_run` obligatorio; con false exige workflow_id + workflow_execution_id. Detrás de `PORTERO_DUENO` (apagado por omisión). US$ 0, sin modelo.
 */
import { NextResponse } from 'next/server'
import { checkInternalKey } from '@/lib/internal-auth'
import { getSupabaseAdmin } from '@/lib/supabase'
import type { Db } from '@/lib/portero-alimenta/alimentar'
import { interruptoresDelEntorno } from '@/lib/portero-alimenta/datos'
import { puenteAlIndice } from '@/lib/portero-alimenta/entorno'
import { rutaLeerDueno, rutaDueno } from '@/lib/portero-alimenta/dueno'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

const activo = () => String(process.env.PORTERO_DUENO ?? '').trim().toLowerCase() === 'on'

export async function POST(request: Request) {
  const auth = checkInternalKey(request)
  if (!auth.ok) return NextResponse.json({ error: 'unauthorized', code: 'E-AUTH-001', detail: auth.reason }, { status: 401 })
  let cuerpo: unknown
  try { cuerpo = await request.json() } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }) }
  try {
    const db = getSupabaseAdmin() as unknown as Db
    const real = !!cuerpo && typeof cuerpo === 'object' && (cuerpo as Record<string, unknown>).dry_run === false
    const r = await rutaDueno({
      db, interruptores: interruptoresDelEntorno(), activo: activo(),
      puente: real ? puenteAlIndice({ origen: new URL(request.url).origin, llaveInterna: process.env.INTERNAL_API_KEY ?? '', db }) : undefined,
    }, cuerpo)
    return NextResponse.json(r.body, { status: r.status })
  } catch (e) {
    return NextResponse.json({ error: 'dueno_error', detalle: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}

export async function GET(request: Request) {
  const auth = checkInternalKey(request)
  if (!auth.ok) return NextResponse.json({ error: 'unauthorized', code: 'E-AUTH-001', detail: auth.reason }, { status: 401 })
  try {
    if (!activo()) return NextResponse.json({ apagado: true, detalle: 'PORTERO_DUENO está apagado: no se leyó nada', modelos_llamados: 0 })
    const u = new URL(request.url).searchParams
    const r = await rutaLeerDueno({ db: getSupabaseAdmin() as unknown as Db }, { client_id: u.get('client_id') ?? '', tema: u.get('tema'), sede_clave: u.get('sede_clave') })
    return NextResponse.json(r.body, { status: r.status })
  } catch (e) {
    return NextResponse.json({ error: 'dueno_error', detalle: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
