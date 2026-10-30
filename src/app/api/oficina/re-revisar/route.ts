/**
 * POST /api/oficina/re-revisar · la jefatura vuelve a revisar una pieza YA cerrada (30-oct), sin tocar la mesa.
 * Llave: `x-api-key` (INTERNAL_API_KEY), como `/api/oficina/cambios`. Cuerpo: { hitl_id (uuid), reviewer?, solo_estimar?: boolean, despertar?: boolean }.
 * Efecto: abre un encargo NUEVO (versión siguiente) que arranca en los chequeos con los materiales de la última versión cerrada y pasa por la jefatura; NO abre versión de la mesa,
 * NO cuenta rondas de «Pedir cambios», NO escribe notas del dueño ni `eventos_de_emilio`. La versión original queda intacta. Techo del encargo nuevo: US$ 3.
 * `solo_estimar: true` no crea nada y contesta si se puede y cuánto como máximo.
 * 409: no es una pieza de la oficina · ya decidida · es un ensayo · el encargo no está cerrado · no es la última versión (o ya hay una re-revisión viva).
 */
import { NextResponse } from 'next/server'
import { checkInternalKey } from '@/lib/internal-auth'
import { despertarAlFlujoDeLaOficina } from '@/lib/oficina/despertar'
import { reRevisar } from '@/lib/oficina/re-revision'
import { esObjeto, puertosReales } from '@/lib/oficina/ruta'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 300

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(request: Request) {
  const auth = checkInternalKey(request)
  if (!auth.ok) return NextResponse.json({ error: 'unauthorized', detail: auth.reason }, { status: 401 })
  let cuerpo: unknown
  try { cuerpo = await request.json() } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }) }
  if (!esObjeto(cuerpo)) return NextResponse.json({ error: 'entrada_invalida', errores: ['el cuerpo debe ser un objeto'] }, { status: 400 })
  const errores: string[] = []
  if (typeof cuerpo.hitl_id !== 'string' || !UUID.test(cuerpo.hitl_id)) errores.push('`hitl_id` debe ser un uuid')
  const reviewer = cuerpo.reviewer === undefined ? 'emilio' : cuerpo.reviewer
  if (typeof reviewer !== 'string' || !reviewer.trim() || reviewer.length > 80) errores.push('`reviewer` debe ser un texto corto')
  if (cuerpo.solo_estimar !== undefined && typeof cuerpo.solo_estimar !== 'boolean') errores.push('`solo_estimar` debe ser verdadero o falso')
  if (errores.length) return NextResponse.json({ error: 'entrada_invalida', errores }, { status: 400 })
  try {
    const { P, db } = puertosReales(request)
    const r = await reRevisar(db, P, { hitl_id: cuerpo.hitl_id as string, reviewer: (reviewer as string).trim(), solo_estimar: cuerpo.solo_estimar === true })
    if (cuerpo.despertar !== false && r.status === 200 && r.cuerpo.accion === 'esperar' && esObjeto(r.cuerpo.turno)) {
      const d = await despertarAlFlujoDeLaOficina(fetch, { dispatchKey: process.env.SALA_DISPATCH_KEY, n8nWebhookBase: process.env.N8N_WEBHOOK_BASE }, String(r.cuerpo.encargo_id), r.cuerpo.turno)
      return NextResponse.json({ ...r.cuerpo, despertado: d.despertado, ...(d.despertado ? {} : { motivo_sin_despertar: d.motivo }) }, { status: r.status })
    }
    return NextResponse.json(r.cuerpo, { status: r.status })
  } catch (e) {
    return NextResponse.json({ error: 'oficina_error', detalle: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
