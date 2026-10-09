/**
 * POST /api/oficina/encargos · abre (o lee) un encargo de la oficina de creativos. SALA 1 · PR 4 · NADIE la llama todavía y la oficina nace APAGADA: con la config apagada devuelve 409
 * («el sobre sigue por la pieza simple»). Llave: `x-sala-dispatch-key` (sin `SALA_DISPATCH_KEY`, 503).
 * Cuerpo `abrir`: el sobre de `brief/parte-listo · producir` { parte_id, brief_id, dry_run (OBLIGATORIO y booleano), tope_usd?, familia? } + lo que PONE LA SALA en la raíz:
 * `client_id`, `target_step_id`, `_journey_id`, `_sala_correlation_id`. Un `client_id` dentro de otro objeto no se lee.
 * Cuerpo `leer`: { accion: 'leer', encargo_id }.
 */
import { NextResponse } from 'next/server'
import { abrirEncargo } from '@/lib/oficina/orquestador'
import { checkLlaveDeLaSala, esObjeto, puertosReales } from '@/lib/oficina/ruta'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(request: Request) {
  const auth = checkLlaveDeLaSala(request)
  if (!auth.ok) return NextResponse.json({ error: auth.error, detalle: auth.detalle }, { status: auth.status })
  let cuerpo: unknown
  try { cuerpo = await request.json() } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }) }
  if (!esObjeto(cuerpo)) return NextResponse.json({ error: 'entrada_invalida', errores: ['el cuerpo debe ser un objeto'] }, { status: 400 })
  try {
    const { P } = puertosReales(request)
    if (cuerpo.accion === 'leer') {
      if (typeof cuerpo.encargo_id !== 'string' || !UUID.test(cuerpo.encargo_id)) return NextResponse.json({ error: 'entrada_invalida', errores: ['`encargo_id` debe ser un uuid'] }, { status: 400 })
      const e = await P.almacen.leerEncargo(cuerpo.encargo_id)
      if (!e) return NextResponse.json({ error: 'encargo_inexistente' }, { status: 404 })
      return NextResponse.json({ encargo_id: e.id, estado: e.estado, con_desacuerdo: e.con_desacuerdo, gasto_usd: e.gasto_usd, tope_usd: e.tope_usd, dry_run: e.dry_run, fichas: e.estado_del_motor.fichas }, { status: 200 })
    }
    const clientId = typeof cuerpo.client_id === 'string' ? cuerpo.client_id : ''
    const target = typeof cuerpo.target_step_id === 'string' ? cuerpo.target_step_id : ''
    if (!clientId || !target) return NextResponse.json({ error: 'entrada_invalida', errores: ['faltan `client_id` y `target_step_id` (los pone la sala en la raíz)'] }, { status: 400 })
    const sala_ref = { _journey_id: cuerpo._journey_id ?? null, _sala_correlation_id: cuerpo._sala_correlation_id ?? null }
    const r = await abrirEncargo(P, { cuerpo, client_id: clientId, target_step_id: target, sala_ref })
    return NextResponse.json(r.cuerpo, { status: r.status })
  } catch (e) {
    return NextResponse.json({ error: 'oficina_error', detalle: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
