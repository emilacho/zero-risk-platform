/**
 * POST /api/oficina/encargos · abre (o lee) un encargo de la oficina de creativos. SALA 1 · PR 4 · NADIE la llama todavía y la oficina nace APAGADA: con la config apagada devuelve 409
 * («el sobre sigue por la pieza simple»). Llave: `x-sala-dispatch-key` (sin `SALA_DISPATCH_KEY`, 503).
 * Cuerpo `abrir`: el sobre de `brief/parte-listo · producir` { parte_id, brief_id, dry_run (OBLIGATORIO y booleano), tope_usd?, familia? } + lo que PONE LA SALA en la raíz:
 * `client_id`, `target_step_id`, `_journey_id`, `_sala_correlation_id`. Un `client_id` dentro de otro objeto no se lee.
 * `despertar: true` (opcional): para quien abre o reabre sin la puerta de n8n, la ruta despierta al flujo `oficina · turno` con el primer turno (sin esto el turno 2 quedaba sin lanzar hasta que el vigía lo hallaba).
 * Cuerpo `leer`: { accion: 'leer', encargo_id }.
 */
import { NextResponse } from 'next/server'
import { despertarAlFlujoDeLaOficina } from '@/lib/oficina/despertar'
import { abrirEncargo, avanzar } from '@/lib/oficina/orquestador'
import { abrirMesaDelCalendario, validarSobreDelCalendario } from '@/lib/oficina/mesa/calendario'
import { checkLlaveDeLaSala, esObjeto, puertosReales } from '@/lib/oficina/ruta'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 120

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
    // 31-oct · la mesa de creativos del calendario: el sobre lo arma la CADENA (`accion: abrir_mesa` de su paso calendario), no la sala; sin brief ni parte de la sala
    if (cuerpo.origen === 'calendario') {
      const v = validarSobreDelCalendario(cuerpo)
      if (!v.ok) return NextResponse.json({ error: 'entrada_invalida', errores: v.errores }, { status: 400 })
      const rc = await abrirMesaDelCalendario(P, v.sobre, avanzar)
      if (cuerpo.despertar === true && rc.status === 200 && rc.cuerpo.accion === 'esperar' && esObjeto(rc.cuerpo.turno)) {
        const d = await despertarAlFlujoDeLaOficina(fetch, { dispatchKey: process.env.SALA_DISPATCH_KEY, n8nWebhookBase: process.env.N8N_WEBHOOK_BASE }, String(rc.cuerpo.encargo_id), rc.cuerpo.turno)
        return NextResponse.json({ ...rc.cuerpo, despertado: d.despertado, ...(d.despertado ? {} : { motivo_sin_despertar: d.motivo }) }, { status: rc.status })
      }
      return NextResponse.json(rc.cuerpo, { status: rc.status })
    }
    const clientId = typeof cuerpo.client_id === 'string' ? cuerpo.client_id : ''
    const target = typeof cuerpo.target_step_id === 'string' ? cuerpo.target_step_id : ''
    if (!clientId || !target) return NextResponse.json({ error: 'entrada_invalida', errores: ['faltan `client_id` y `target_step_id` (los pone la sala en la raíz)'] }, { status: 400 })
    const sala_ref = { _journey_id: cuerpo._journey_id ?? null, _sala_correlation_id: cuerpo._sala_correlation_id ?? null }
    const r = await abrirEncargo(P, { cuerpo, client_id: clientId, target_step_id: target, sala_ref })
    // 28-oct · TRASPASO: quien abre o REABRE a mano (sin la puerta de n8n) pide `despertar: true` y la ruta misma despierta al flujo `oficina · turno`; el acuse del turno impide que un segundo despertar pague otra vez
    if (cuerpo.despertar === true && r.status === 200 && r.cuerpo.accion === 'esperar' && esObjeto(r.cuerpo.turno)) {
      const d = await despertarAlFlujoDeLaOficina(fetch, { dispatchKey: process.env.SALA_DISPATCH_KEY, n8nWebhookBase: process.env.N8N_WEBHOOK_BASE }, String(r.cuerpo.encargo_id), r.cuerpo.turno)
      return NextResponse.json({ ...r.cuerpo, despertado: d.despertado, ...(d.despertado ? {} : { motivo_sin_despertar: d.motivo }) }, { status: r.status })
    }
    return NextResponse.json(r.cuerpo, { status: r.status })
  } catch (e) {
    return NextResponse.json({ error: 'oficina_error', detalle: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
