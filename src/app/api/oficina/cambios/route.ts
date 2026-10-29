/**
 * POST /api/oficina/cambios · el dueño devuelve una pieza cerrada con cambios (ventana de piezas, 29-oct).
 * Llave: `x-api-key` (INTERNAL_API_KEY), como `PATCH /api/hitl/[id]`. Cuerpo: { hitl_id (uuid), comentario (5–2000), laminas?: number[], reviewer?: string, despertar?: boolean }.
 * Efecto: la pieza pasa a «edited» (con la ronda y el comentario) y se abre la versión siguiente del mismo brief; NO cuenta para el tope de 3 versiones, su límite son 5 rondas.
 * 409: ya decidida (doble clic o Slack a la vez) · límite de rondas · el encargo no está cerrado · es un ensayo.
 */
import { NextResponse } from 'next/server'
import { checkInternalKey } from '@/lib/internal-auth'
import { pedirCambios } from '@/lib/oficina/cambios'
import { despertarAlFlujoDeLaOficina } from '@/lib/oficina/despertar'
import { esObjeto, puertosReales } from '@/lib/oficina/ruta'
import { espejoEncendido, registrarEventoDeEmilio } from '@/lib/oficina/eventos-de-emilio/registrar'
import { getSupabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 120

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(request: Request) {
  const auth = checkInternalKey(request)
  if (!auth.ok) return NextResponse.json({ error: 'unauthorized', detail: auth.reason }, { status: 401 })
  let cuerpo: unknown
  try { cuerpo = await request.json() } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }) }
  if (!esObjeto(cuerpo)) return NextResponse.json({ error: 'entrada_invalida', errores: ['el cuerpo debe ser un objeto'] }, { status: 400 })
  const errores: string[] = []
  if (typeof cuerpo.hitl_id !== 'string' || !UUID.test(cuerpo.hitl_id)) errores.push('`hitl_id` debe ser un uuid')
  const comentario = typeof cuerpo.comentario === 'string' ? cuerpo.comentario.trim() : ''
  if (comentario.length < 5 || comentario.length > 2000) errores.push('`comentario` debe tener de 5 a 2000 caracteres')
  const laminas = cuerpo.laminas === undefined ? [] : cuerpo.laminas
  if (!Array.isArray(laminas) || laminas.length > 20 || !laminas.every((n) => Number.isInteger(n) && n >= 1 && n <= 20)) errores.push('`laminas` debe ser una lista de números de lámina (1 a 20)')
  const reviewer = cuerpo.reviewer === undefined ? 'emilio' : cuerpo.reviewer
  if (typeof reviewer !== 'string' || !reviewer.trim() || reviewer.length > 80) errores.push('`reviewer` debe ser un texto corto')
  if (errores.length) return NextResponse.json({ error: 'entrada_invalida', errores }, { status: 400 })
  // 29-oct · APRENDER DE EMILIO, etapa 1: lo que Emilio pidió (comentario literal + láminas marcadas) queda como evento crudo, salga bien o mal el pedido. Nunca frena la ruta.
  const rastro = async (resultado: Record<string, unknown>) => {
    try {
      await registrarEventoDeEmilio(getSupabaseAdmin() as never, {
        canal: 'dashboard', accion: 'pedir_cambios', autor: (reviewer as string).trim(), hitl_id: cuerpo.hitl_id as string, comentario, laminas: laminas as number[],
        especialidades: Array.isArray(cuerpo.especialidades) ? (cuerpo.especialidades as unknown[]).map(String) : [], resultado,
        crudo: { hitl_id: cuerpo.hitl_id, comentario, laminas, reviewer, especialidades: cuerpo.especialidades ?? null, despertar: cuerpo.despertar ?? null },
      }, { espejo: espejoEncendido() })
    } catch { /* un rastro que falla no cambia la respuesta */ }
  }
  try {
    const { P, db } = puertosReales(request)
    const r = await pedirCambios(db, P, { hitl_id: cuerpo.hitl_id as string, comentario, laminas: [...new Set(laminas as number[])].sort((a, b) => a - b), reviewer: (reviewer as string).trim() })
    await rastro({ http: r.status, accion: r.cuerpo.accion ?? null, error: r.cuerpo.error ?? null, ronda: r.cuerpo.ronda ?? null })
    if (cuerpo.despertar !== false && r.status === 200 && r.cuerpo.accion === 'esperar' && esObjeto(r.cuerpo.turno)) {
      const d = await despertarAlFlujoDeLaOficina(fetch, { dispatchKey: process.env.SALA_DISPATCH_KEY, n8nWebhookBase: process.env.N8N_WEBHOOK_BASE }, String(r.cuerpo.encargo_id), r.cuerpo.turno)
      return NextResponse.json({ ...r.cuerpo, despertado: d.despertado, ...(d.despertado ? {} : { motivo_sin_despertar: d.motivo }) }, { status: r.status })
    }
    return NextResponse.json(r.cuerpo, { status: r.status })
  } catch (e) {
    await rastro({ http: 500, error: 'oficina_error' })
    return NextResponse.json({ error: 'oficina_error', detalle: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
