/**
 * POST /api/jefatura/turnos · el motor de la jefatura, un paso por llamada. J3 · NADIE la llama todavía.
 *  { accion: 'siguiente', revision_id }  → ejecuta en línea lo que no es de un agente (GPT ciego, cierre) y devuelve el PEDIDO del siguiente empleado (o el cierre);
 *  { accion: 'resultado', revision_id, n, texto | error, costo_usd?, workflow_execution_id?, tokens_in?, tokens_out? } → aplica el contrato de formato, registra y sigue.
 * Llave: `x-sala-dispatch-key` (sin `SALA_DISPATCH_KEY`, 503). El `dry_run` lo trae la revisión desde que se abrió (no se puede cambiar aquí).
 * 🔴 APAGADA = 409: «apagar» frena también las revisiones a medio camino (no gastan); se reanudan al encender.
 */
import { NextResponse } from 'next/server'
import { avanzar, recibirResultado } from '@/lib/jefatura/revision/orquestador'
import { checkLlaveDeLaSala, esObjeto, numero, puertosReales, UUID } from '@/lib/jefatura/revision/ruta'

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
  if (cuerpo.accion !== 'siguiente' && cuerpo.accion !== 'resultado') errores.push('`accion` debe ser siguiente o resultado')
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
