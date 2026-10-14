/**
 * POST /api/jefatura/turnos · el motor de la jefatura, un paso por llamada. J3 · NADIE la llama todavía.
 *  { accion: 'siguiente', revision_id }  → ejecuta en línea lo que no es de un agente (GPT ciego, cierre) y devuelve el PEDIDO del siguiente empleado (o el cierre);
 *  { accion: 'resultado', revision_id, n, texto | error, costo_usd?, workflow_execution_id?, tokens_in?, tokens_out? } → aplica el contrato de formato, registra y sigue.
 *  { accion: 'despertar', revision_id, turno } → la ruta llama al webhook `jefatura · turno` con la `SALA_DISPATCH_KEY` de SU entorno (quien llama no la conoce).
 * Llave: `x-api-key` (interna) o `x-sala-dispatch-key` (flujos de n8n); sin ninguna variable, 503. El `dry_run` lo trae la revisión desde que se abrió (no se puede cambiar aquí).
 * 🔴 APAGADA = 409: «apagar» frena también las revisiones a medio camino (no gastan); se reanudan al encender.
 */
import { NextResponse } from 'next/server'
import { avanzar, recibirResultado } from '@/lib/jefatura/revision/orquestador'
import { checkLlaveDeLaSala, esObjeto, numero, puertosReales, UUID, webhookDelTurno } from '@/lib/jefatura/revision/ruta'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 300

export async function POST(request: Request) {
  const auth = checkLlaveDeLaSala(request)
  if (!auth.ok) return NextResponse.json({ error: auth.error, detalle: auth.detalle }, { status: auth.status })
  let cuerpo: unknown
  try { cuerpo = await request.json() } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }) }
  if (!esObjeto(cuerpo)) return NextResponse.json({ error: 'entrada_invalida', errores: ['el cuerpo debe ser un objeto'] }, { status: 400 })
  const errores: string[] = []
  if (typeof cuerpo.revision_id !== 'string' || !UUID.test(cuerpo.revision_id)) errores.push('`revision_id` debe ser un uuid')
  if (cuerpo.accion !== 'siguiente' && cuerpo.accion !== 'resultado' && cuerpo.accion !== 'despertar') errores.push('`accion` debe ser siguiente, resultado o despertar')
  if (cuerpo.accion === 'despertar' && !esObjeto(cuerpo.turno)) errores.push('`turno` debe ser el objeto que devolvió la puerta al abrir')
  if (cuerpo.accion === 'resultado') {
    if (!Number.isInteger(cuerpo.n) || (cuerpo.n as number) < 1) errores.push('`n` debe ser el número del paso (entero ≥ 1)')
    if (cuerpo.texto !== undefined && typeof cuerpo.texto !== 'string') errores.push('`texto` debe ser texto')
    if (cuerpo.error !== undefined && typeof cuerpo.error !== 'string') errores.push('`error` debe ser texto')
    if (cuerpo.texto === undefined && cuerpo.error === undefined) errores.push('hace falta `texto` o `error`')
  }
  if (errores.length) return NextResponse.json({ error: 'entrada_invalida', errores }, { status: 400 })
  try {
    const { P } = puertosReales()
    const config = await P.almacen.leerConfig()
    if (config.estado === 'apagada') return NextResponse.json({ error: 'jefatura_no_abre', motivo: 'apagada', detalle: 'la jefatura está apagada: ningún turno corre ni gasta' }, { status: 409 })
    const id = cuerpo.revision_id as string
    if (cuerpo.accion === 'despertar') {
      // la ruta despierta a `jefatura · turno` con SU llave de despacho (la de su propio entorno): quien llama solo necesita la llave interna y nunca ve la de despacho
      const despacho = (process.env.SALA_DISPATCH_KEY ?? '').trim()
      if (!despacho) return NextResponse.json({ error: 'sala_dispatch_key_not_configured', detalle: 'sin SALA_DISPATCH_KEY en este entorno no se puede despertar el flujo' }, { status: 503 })
      const rev = await P.almacen.leerRevision(id)
      if (!rev) return NextResponse.json({ error: 'revision_inexistente' }, { status: 404 })
      // el turno que trae el llamador NO se reenvía a ciegas: el flujo toma `dry_run` del pedido, así que debe ser el de la revisión, y `n` el paso abierto de ESA revisión
      const t = cuerpo.turno as Record<string, unknown>, pedido = esObjeto(t.pedido) ? t.pedido : {}
      if (pedido.dry_run !== rev.dry_run) return NextResponse.json({ error: 'dry_run_no_coincide', detalle: 'el `dry_run` del turno no es el de la revisión: no se despierta al flujo' }, { status: 409 })
      const abierto = await P.almacen.pasoAbierto(id)
      if (!abierto || t.n !== abierto.n) return NextResponse.json({ error: 'turno_no_es_el_abierto', detalle: 'el `n` del turno no es el paso abierto de la revisión: no se despierta al flujo' }, { status: 409 })
      try {
        const w = await fetch(webhookDelTurno(), { method: 'POST', headers: { 'content-type': 'application/json', 'x-sala-dispatch-key': despacho }, body: JSON.stringify({ revision_id: id, turno: cuerpo.turno }), signal: AbortSignal.timeout(30000) })
        return NextResponse.json({ despertado: w.ok, webhook_status: w.status }, { status: w.ok ? 200 : 502 })
      } catch (e) {
        return NextResponse.json({ despertado: false, error: 'webhook_inalcanzable', detalle: e instanceof Error ? e.message : String(e) }, { status: 502 })
      }
    }
    const r = cuerpo.accion === 'siguiente'
      ? await avanzar(P, id)
      : await recibirResultado(P, id, cuerpo.n as number, {
          ...(typeof cuerpo.texto === 'string' ? { texto: cuerpo.texto } : {}), ...(typeof cuerpo.error === 'string' ? { error: cuerpo.error } : {}),
          costo_usd: numero(cuerpo.costo_usd), workflow_id: typeof cuerpo.workflow_id === 'string' ? cuerpo.workflow_id : null, workflow_execution_id: typeof cuerpo.workflow_execution_id === 'string' ? cuerpo.workflow_execution_id : null,
          tokens_in: numero(cuerpo.tokens_in) ?? null, tokens_out: numero(cuerpo.tokens_out) ?? null,
        })
    return NextResponse.json(r.cuerpo, { status: r.status })
  } catch (e) {
    return NextResponse.json({ error: 'jefatura_error', detalle: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
