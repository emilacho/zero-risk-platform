/**
 * POST /api/oficina/turnos · el motor de la oficina, un paso por llamada. SALA 1 · PR 4 · NADIE la llama todavía.
 *  { accion: 'acuse', encargo_id, n, workflow_execution_id } → el flujo TOMA el turno (una sola vez; `ya_tomado` = otro flujo ya lo tiene: este se detiene)
 *  { accion: 'siguiente', encargo_id }  → ejecuta los pasos de código/revisor en línea y devuelve el PEDIDO del siguiente empleado (o el cierre);
 *  { accion: 'reanudar', encargo_id } → 24-nov · retoma una mesa en pausa por causa externa, o reabre la de la gran idea que cerró por una caída externa (con sus guardas; 409 si no)
 *  { accion: 'redibujar', encargo_id, motivo } → 27-nov · vuelve a dibujar las propuestas de imagen guardadas, sin otra ronda de mesa (`retomar.ts`; 409 si no se puede)
 *  { accion: 'retomar', encargo_id, causa_corregida } → 27-nov · retoma una mesa que cerró por turnos cortados sin vuelta, con el MISMO libro (`retomar.ts`; 409 si no)
 *  reanudar · redibujar · retomar: si lo que sigue es el turno de un empleado, la ruta DESPIERTA al flujo de la oficina (sin esto la pieza quedaba `en_paso` sin que nadie la moviera).
 *  { accion: 'resultado', encargo_id, n, texto | error, costo_usd?, workflow_execution_id?, tokens_in?, tokens_out?, upstream_status?, pedido_no_llego? } → aplica el contrato de formato y los validadores, registra y sigue.
 * Llave: `x-sala-dispatch-key` (sin `SALA_DISPATCH_KEY`, 503). El `dry_run` lo trae el encargo desde que se abrió (no se puede cambiar aquí).
 */
import { NextResponse } from 'next/server'
import { acusarTurno, avanzar, recibirResultado } from '@/lib/oficina/orquestador'
import { reanudarMesa } from '@/lib/oficina/mesa/orquestador'
import { checkLlaveDeLaSala, esObjeto, puertosReales } from '@/lib/oficina/ruta'
import { ACCIONES_QUE_RETOMAN, redibujarPropuestas, retomarMesaCortada } from '@/lib/oficina/retomar'
import { despertarAlFlujoDeLaOficina } from '@/lib/oficina/despertar'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 800

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const numero = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)

export async function POST(request: Request) {
  const auth = checkLlaveDeLaSala(request)
  if (!auth.ok) return NextResponse.json({ error: auth.error, detalle: auth.detalle }, { status: auth.status })
  let cuerpo: unknown
  try { cuerpo = await request.json() } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }) }
  if (!esObjeto(cuerpo)) return NextResponse.json({ error: 'entrada_invalida', errores: ['el cuerpo debe ser un objeto'] }, { status: 400 })
  const errores: string[] = []
  if (typeof cuerpo.encargo_id !== 'string' || !UUID.test(cuerpo.encargo_id)) errores.push('`encargo_id` debe ser un uuid')
  const retoma = (ACCIONES_QUE_RETOMAN as readonly unknown[]).includes(cuerpo.accion)
  if (cuerpo.accion !== 'siguiente' && cuerpo.accion !== 'resultado' && cuerpo.accion !== 'acuse' && !retoma) errores.push('`accion` debe ser siguiente, resultado, acuse, reanudar, redibujar o retomar')
  if (cuerpo.accion === 'acuse') {
    if (!Number.isInteger(cuerpo.n) || (cuerpo.n as number) < 1) errores.push('`n` debe ser el número del paso (entero ≥ 1)')
    if (typeof cuerpo.workflow_execution_id !== 'string' || !cuerpo.workflow_execution_id) errores.push('`workflow_execution_id` es obligatorio en el acuse')
  }
  if (cuerpo.accion === 'resultado') {
    if (!Number.isInteger(cuerpo.n) || (cuerpo.n as number) < 1) errores.push('`n` debe ser el número del paso (entero ≥ 1)')
    if (cuerpo.texto !== undefined && typeof cuerpo.texto !== 'string') errores.push('`texto` debe ser texto')
    if (cuerpo.error !== undefined && typeof cuerpo.error !== 'string') errores.push('`error` debe ser texto')
    if (cuerpo.texto === undefined && cuerpo.error === undefined) errores.push('hace falta `texto` o `error`')
    // 11-nov · regla (b) · los campos del corte nuestro que pasa el flujo «Oficina · un turno» (nunca se deducen del texto)
    if (cuerpo.upstream_status !== undefined && cuerpo.upstream_status !== null && !Number.isInteger(cuerpo.upstream_status)) errores.push('`upstream_status` debe ser un entero')
    if (cuerpo.pedido_no_llego !== undefined && typeof cuerpo.pedido_no_llego !== 'boolean') errores.push('`pedido_no_llego` debe ser true o false')
  }
  if (errores.length) return NextResponse.json({ error: 'entrada_invalida', errores }, { status: 400 })
  try {
    const { P } = puertosReales(request)
    const id = cuerpo.encargo_id as string
    const r = cuerpo.accion === 'acuse'
      ? await acusarTurno(P, id, cuerpo.n as number, cuerpo.workflow_execution_id as string)
      : cuerpo.accion === 'siguiente'
      ? await avanzar(P, id)
      : cuerpo.accion === 'reanudar'
      ? await reanudarMesa(P, id)
      : cuerpo.accion === 'redibujar'
      ? await redibujarPropuestas(P, id, { motivo: cuerpo.motivo })
      : cuerpo.accion === 'retomar'
      ? await retomarMesaCortada(P, id, { causa_corregida: cuerpo.causa_corregida })
      : await recibirResultado(P, id, cuerpo.n as number, {
          ...(typeof cuerpo.texto === 'string' ? { texto: cuerpo.texto } : {}), ...(typeof cuerpo.error === 'string' ? { error: cuerpo.error } : {}),
          costo_usd: numero(cuerpo.costo_usd), workflow_execution_id: typeof cuerpo.workflow_execution_id === 'string' ? cuerpo.workflow_execution_id : null,
          tokens_in: numero(cuerpo.tokens_in) ?? null, tokens_out: numero(cuerpo.tokens_out) ?? null,
          ...(Number.isInteger(cuerpo.upstream_status) ? { upstream_status: cuerpo.upstream_status as number } : {}), ...(cuerpo.pedido_no_llego === true ? { pedido_no_llego: true } : {}),
        })
    if (retoma && r.status === 200 && r.cuerpo.accion === 'esperar' && esObjeto(r.cuerpo.turno)) {
      const d = await despertarAlFlujoDeLaOficina(fetch, { dispatchKey: process.env.SALA_DISPATCH_KEY, n8nWebhookBase: process.env.N8N_WEBHOOK_BASE }, id, r.cuerpo.turno)
      return NextResponse.json({ ...r.cuerpo, despertado: d.despertado, ...(d.despertado ? {} : { motivo_sin_despertar: d.motivo }) }, { status: r.status })
    }
    return NextResponse.json(r.cuerpo, { status: r.status })
  } catch (e) {
    return NextResponse.json({ error: 'oficina_error', detalle: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
