/**
 * /api/brain/alimentar/redes · los pasos diarios de redes, cada uno una llamada propia (01-nov · encargo «fallas pendientes y retención»).
 *  · POST {client_id, paso: cuentas_y_comentarios|tendencias|bodega|transcripcion, dry_run, workflow_id, workflow_execution_id} · corre ESE paso de ESE cliente (llave interna);
 *  · GET  · el cron de Vercel (CRON_SECRET) o la llave interna: corre el siguiente paso pendiente de hoy. «hecha» solo cuando el paso terminó de verdad; uno cortado se retoma y a los 3 intentos se abandona.
 * APAGADO por `PORTERO_TENDENCIAS`. Los modelos y el gasto de voz se registran en la libreta con el flujo del portero.
 */
import crypto from 'node:crypto'
import { NextResponse } from 'next/server'
import { checkInternalKey } from '@/lib/internal-auth'
import { getSupabaseAdmin } from '@/lib/supabase'
import { modeloRegistrado } from '@/lib/portero-alimenta/entorno'
import { FLUJO_DEL_PORTERO } from '@/lib/portero-alimenta/gasto'
import { avisarPorIncidente } from '@/lib/portero-alimenta/alertas'
import { esPaso, textoDelAvisoDePasoAbandonado } from '@/lib/portero-alimenta/pasos-diarios'
import { correrElSiguientePaso, correrUnPaso, type DepsDePaso } from '@/lib/portero-alimenta/redes-ruta'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 300

function esDelCron(request: Request): boolean {
  const esperado = process.env.CRON_SECRET
  const dado = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? ''
  if (!esperado || !dado) return false
  const a = Buffer.from(dado), b = Buffer.from(esperado)
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

function dependencias(request: Request): DepsDePaso {
  const origen = new URL(request.url).origin
  const llave = process.env.INTERNAL_API_KEY ?? ''
  return {
    db: getSupabaseAdmin() as never, ahora: new Date(),
    // un paso abandonado = UN incidente en #alertas (la huella de avisos evita repetirlo); si todo va bien, silencio
    alAbandonar: (p) => avisarPorIncidente({ db: getSupabaseAdmin() as never })(textoDelAvisoDePasoAbandonado(p), `paso-abandonado:${p.clientId}:${p.dia}:${p.paso}`),
    llamarModelo: (clientId, workflowId, ejecucionId) => modeloRegistrado({ origen, llaveInterna: llave, workflowId, ejecucionId, clientId, comando: 'portero.juzgar' }),
    registro: (workflowId, ejecucionId) => ({ origen, llaveInterna: llave, workflowId, ejecucionId }),
  }
}

export async function GET(request: Request) {
  if (!esDelCron(request) && !checkInternalKey(request).ok) return NextResponse.json({ error: 'unauthorized', code: 'E-AUTH-001' }, { status: 401 })
  try {
    const t = new Date().toISOString()
    const r = await correrElSiguientePaso(dependencias(request), { workflowId: process.env.PORTERO_WORKFLOW_ID || FLUJO_DEL_PORTERO, ejecucionId: `vercel-cron:redes:${t.slice(0, 16)}` })
    return NextResponse.json(r, { status: r.ok || r.estado !== 'error' ? 200 : 502 })
  } catch (e) {
    return NextResponse.json({ error: 'redes_error', detalle: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const auth = checkInternalKey(request)
  if (!auth.ok) return NextResponse.json({ error: 'unauthorized', code: 'E-AUTH-001', detail: auth.reason }, { status: 401 })
  let b: Record<string, unknown>
  try { b = (await request.json()) as Record<string, unknown> } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }) }
  if (typeof b.dry_run !== 'boolean') return NextResponse.json({ error: 'entrada_invalida', detalle: '`dry_run` es obligatorio (true o false)' }, { status: 400 })
  if (typeof b.client_id !== 'string' || !b.client_id || !esPaso(b.paso)) return NextResponse.json({ error: 'entrada_invalida', detalle: '`client_id` y `paso` (cuentas_y_comentarios, tendencias, bodega o transcripcion) son obligatorios' }, { status: 400 })
  if (!b.dry_run && (typeof b.workflow_id !== 'string' || typeof b.workflow_execution_id !== 'string')) return NextResponse.json({ error: 'workflow_id_required', code: 'E-WF-ID-REQUIRED', detalle: 'sin dry_run exige workflow_id y workflow_execution_id' }, { status: 403 })
  try {
    const r = await correrUnPaso(dependencias(request), { clientId: b.client_id, paso: b.paso, workflowId: String(b.workflow_id ?? ''), ejecucionId: String(b.workflow_execution_id ?? ''), dry_run: b.dry_run, reintentar: b.reintentar === true })
    return NextResponse.json(r, { status: r.ok || r.estado !== 'error' ? 200 : 502 })
  } catch (e) {
    return NextResponse.json({ error: 'redes_error', detalle: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
