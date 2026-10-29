/**
 * POST /api/brain/alimentar/dueno · una oficina registra lo que respondió el dueño (`evento: 'respuesta'`, por omisión) o una pregunta que le hizo (`evento: 'pregunta'`).
 *   Respuesta → ficha «confirmada por el dueño» (origen dueno, cita literal, canal, fecha); una respuesta nueva al mismo tema REEMPLAZA a la anterior (la vieja queda archivada).
 *   Pregunta  → antes de registrarla dice si ya se respondió o si otra oficina ya la hizo y espera.
 * GET  /api/brain/alimentar/dueno?client_id=&tema=&sede_clave=&canal=&limite= (canal exacto; limite 1-100, por omisión 20 o 5 con tema; `total` y `recortado` en la respuesta) · ¿ya se respondió? cuándo, por qué canal, y qué preguntas siguen pendientes. El agente decide si la respuesta sigue vigente.
 * Llave interna (`INTERNAL_API_KEY`), nunca `SALA_DISPATCH_KEY`. `dry_run` obligatorio; con false exige workflow_id + workflow_execution_id. Detrás de `PORTERO_DUENO` (apagado por omisión). US$ 0, sin modelo.
 */
import { NextResponse } from 'next/server'
import { waitUntil } from '@vercel/functions'
import { checkInternalKey } from '@/lib/internal-auth'
import { getSupabaseAdmin } from '@/lib/supabase'
import type { Db } from '@/lib/portero-alimenta/alimentar'
import { interruptoresDelEntorno } from '@/lib/portero-alimenta/datos'
import { puenteAlIndice } from '@/lib/portero-alimenta/entorno'
import { rutaLeerDueno, rutaDueno } from '@/lib/portero-alimenta/dueno'
import { FLUJO_DEL_PORTERO } from '@/lib/portero-alimenta/gasto'
import { procesarAprendizajeDelEntorno } from '@/lib/portero-alimenta/aprendizaje/entorno'

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
    // 29-oct: una nota cruda nueva (acumula) se desmenuza al entrar, en segundo plano; si falla, la pasada del cron la recoge
    const b = (cuerpo && typeof cuerpo === 'object' ? cuerpo : {}) as Record<string, unknown>
    if (real && r.status === 200 && r.body.guardada === true && b.acumula === true && typeof b.client_id === 'string') {
      const origen = new URL(request.url).origin
      waitUntil(procesarAprendizajeDelEntorno({ origen, llaveInterna: process.env.INTERNAL_API_KEY ?? '', workflowId: process.env.PORTERO_WORKFLOW_ID || FLUJO_DEL_PORTERO, ejecucionId: `dueno:aprendizaje:${Date.now()}` }, { dry_run: false, client_id: b.client_id, solo: 'desmenuzar' }).catch(() => undefined))
    }
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
    const r = await rutaLeerDueno({ db: getSupabaseAdmin() as unknown as Db }, { client_id: u.get('client_id') ?? '', tema: u.get('tema'), sede_clave: u.get('sede_clave'), canal: u.get('canal'), limite: u.get('limite') })
    return NextResponse.json(r.body, { status: r.status })
  } catch (e) {
    return NextResponse.json({ error: 'dueno_error', detalle: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
