/**
 * POST /api/oficina/turnos · el motor de la oficina, un paso por llamada. SALA 1 · PR 4 · NADIE la llama todavía.
 *  { accion: 'siguiente', encargo_id }  → ejecuta los pasos de código/revisor en línea y devuelve el PEDIDO del siguiente empleado (o el cierre);
 *  { accion: 'resultado', encargo_id, n, texto | error, costo_usd?, workflow_execution_id?, tokens_in?, tokens_out? } → aplica el contrato de formato y los validadores, registra y sigue.
 * Llave: `x-sala-dispatch-key` (sin `SALA_DISPATCH_KEY`, 503). El `dry_run` lo trae el encargo desde que se abrió (no se puede cambiar aquí).
 */
import { NextResponse } from 'next/server'
import { avanzar, recibirResultado } from '@/lib/oficina/orquestador'
import { checkLlaveDeLaSala, esObjeto, puertosReales } from '@/lib/oficina/ruta'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 300

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
  if (cuerpo.accion !== 'siguiente' && cuerpo.accion !== 'resultado') errores.push('`accion` debe ser siguiente o resultado')
  if (cuerpo.accion === 'resultado') {
    if (!Number.isInteger(cuerpo.n) || (cuerpo.n as number) < 1) errores.push('`n` debe ser el número del paso (entero ≥ 1)')
    if (cuerpo.texto !== undefined && typeof cuerpo.texto !== 'string') errores.push('`texto` debe ser texto')
    if (cuerpo.error !== undefined && typeof cuerpo.error !== 'string') errores.push('`error` debe ser texto')
    if (cuerpo.texto === undefined && cuerpo.error === undefined) errores.push('hace falta `texto` o `error`')
  }
  if (errores.length) return NextResponse.json({ error: 'entrada_invalida', errores }, { status: 400 })
  try {
    const { P } = puertosReales(request)
    const id = cuerpo.encargo_id as string
    const r = cuerpo.accion === 'siguiente'
      ? await avanzar(P, id)
      : await recibirResultado(P, id, cuerpo.n as number, {
          ...(typeof cuerpo.texto === 'string' ? { texto: cuerpo.texto } : {}), ...(typeof cuerpo.error === 'string' ? { error: cuerpo.error } : {}),
          costo_usd: numero(cuerpo.costo_usd), workflow_execution_id: typeof cuerpo.workflow_execution_id === 'string' ? cuerpo.workflow_execution_id : null,
          tokens_in: numero(cuerpo.tokens_in) ?? null, tokens_out: numero(cuerpo.tokens_out) ?? null,
        })
    return NextResponse.json(r.cuerpo, { status: r.status })
  } catch (e) {
    return NextResponse.json({ error: 'oficina_error', detalle: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
