/**
 * COLATERALES 2d · la PUERTA de `/api/colaterales` (la ruta es delgada: llave interna + esto).
 * Toda acción exige la FIRMA del flujo (`workflow_id` + `workflow_execution_id`): sin ella, 403 (nadie llama directo).
 * Acciones: `recibir` (crea la edición con su llave; contesta al instante) · `turno` (`seco` OBLIGATORIO true/false: la ausencia nunca es «real»)
 * · `entregar` (la salida de la secretaria + el sello del turno) · `barrer` (cierra lo colgado). Nada se aplica aquí.
 */
import { createHash } from 'node:crypto'
import { esDocumento } from '../cadena/dependencias-de-documentos'
import { barrer, entregar, turno, type PuertosDelTurno } from './turno'

export interface Respuesta { status: number; cuerpo: Record<string, unknown> }
const mal = (status: number, error: string, detalle: string): Respuesta => ({ status, cuerpo: { error, detalle } })
const texto = (v: unknown, min: number, max: number): string | null => (typeof v === 'string' && v.trim().length >= min && v.length <= max ? v : null)
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** la llave de una edición: cliente + documento + referencia + versión base + versión nueva (la misma edición dos veces = una) */
export function llaveDeEdicion(x: { client_id: string; documento: string; documento_ref: string; version_base: string; version_nueva: string }): string {
  return 'ed-' + createHash('sha256').update(JSON.stringify([x.client_id, x.documento, x.documento_ref, x.version_base, x.version_nueva])).digest('hex').slice(0, 40)
}

export const ACCIONES = ['recibir', 'turno', 'entregar', 'barrer'] as const

export async function atenderColaterales(P: PuertosDelTurno, c: Record<string, unknown>, ahora: Date): Promise<Respuesta> {
  const accion = typeof c.accion === 'string' ? c.accion : ''
  if (!(ACCIONES as readonly string[]).includes(accion)) return mal(400, 'accion_desconocida', `accion debe ser una de: ${ACCIONES.join(' | ')}`)
  const wf = texto(c.workflow_id, 1, 200), ex = texto(c.workflow_execution_id, 1, 200)
  if (!wf || !ex) return mal(403, 'sin_firma_del_flujo', 'colaterales solo se llama desde su flujo: faltan workflow_id y workflow_execution_id')

  if (accion === 'barrer') return { status: 200, cuerpo: { accion: 'barrido', ...(await barrer(P, ahora)) } }

  if (accion === 'recibir') {
    const client_id = typeof c.client_id === 'string' && UUID.test(c.client_id) ? c.client_id : null
    const documento = esDocumento(c.documento) ? c.documento : null
    const documento_ref = texto(c.documento_ref, 1, 200), version_base = texto(c.version_base, 1, 100), version_nueva = texto(c.version_nueva, 1, 100)
    const seccion = typeof c.seccion === 'string' ? c.seccion : null
    const antes = texto(c.antes, 1, 4000), despues = texto(c.despues, 1, 4000)
    if (!client_id || !documento || !documento_ref || !version_base || !version_nueva || seccion === null || !antes || !despues) return mal(400, 'entrada_invalida', 'faltan o sobran datos: client_id (uuid), documento, documento_ref, version_base, version_nueva, seccion, antes, despues')
    if (antes === despues) return mal(400, 'entrada_invalida', 'el antes y el después son iguales')
    const r = await P.almacen.crearEdicion({ client_id, documento, documento_ref, version_base, seccion, antes, despues, llave: llaveDeEdicion({ client_id, documento, documento_ref, version_base, version_nueva }), workflow_execution_id: ex })
    return { status: 200, cuerpo: { accion: r.nueva ? 'recibida' : 'ya_existia', edicion_id: r.edicion.id, estado: r.edicion.estado } }
  }

  const edicion_id = typeof c.edicion_id === 'string' && UUID.test(c.edicion_id) ? c.edicion_id : null
  if (!edicion_id) return mal(400, 'entrada_invalida', '`edicion_id` debe ser un uuid')
  if (accion === 'turno') {
    if (typeof c.seco !== 'boolean') return mal(400, 'seco_obligatorio', '`seco` debe ser true o false (su ausencia nunca se toma como corrida real)')
    return { status: 200, cuerpo: { ...(await turno(P, { edicion_id, seco: c.seco, workflow_execution_id: ex })), seco: c.seco } }
  }
  const sello = texto(c.sello, 1, 100)
  if (!sello) return mal(400, 'entrada_invalida', '`sello` es el que devolvió el turno')
  return { status: 200, cuerpo: { ...(await entregar(P, { edicion_id, sello, salida: c.salida })) } }
}
