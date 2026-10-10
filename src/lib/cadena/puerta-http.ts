/**
 * La puerta HTTP común de `/api/cadena/*`: llave interna (`x-api-key` = `INTERNAL_API_KEY`) + cuerpo JSON + `accion` + el manejador.
 * Las rutas son delgadas: toda la lógica está en los manejadores, que hablan con la interfaz `Almacen`.
 */
import { NextResponse } from 'next/server'
import { checkInternalKey } from '@/lib/internal-auth'
import type { Almacen } from './almacen'
import type { Respuesta } from './autorizar'

export type Manejador = (al: Almacen, cuerpo: Record<string, unknown>, ahora: string) => Promise<Respuesta>

export async function atender(request: Request, acciones: Record<string, Manejador>, almacen: () => Almacen, reloj: () => string = () => new Date().toISOString(), autenticar: typeof checkInternalKey = checkInternalKey): Promise<Response> {
  const auth = autenticar(request)
  if (!auth.ok) return NextResponse.json({ error: 'unauthorized', code: 'E-AUTH-001', detail: auth.reason }, { status: 401 })
  let cuerpo: unknown
  try { cuerpo = await request.json() } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }) }
  if (!cuerpo || typeof cuerpo !== 'object' || Array.isArray(cuerpo)) return NextResponse.json({ error: 'invalid_body', detail: 'el cuerpo debe ser un objeto JSON' }, { status: 400 })
  const c = cuerpo as Record<string, unknown>
  const accion = typeof c.accion === 'string' ? c.accion : ''
  const m = acciones[accion]
  if (!m) return NextResponse.json({ error: 'accion_desconocida', code: 'E-ACCION', detail: `accion debe ser una de: ${Object.keys(acciones).join(' | ')}` }, { status: 400 })
  try {
    const r = await m(almacen(), c, reloj())
    return NextResponse.json(r.cuerpo, { status: r.status })
  } catch (e) {
    return NextResponse.json({ error: 'cadena_fallo', code: 'E-CADENA-FALLO', detail: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
