/**
 * EL BORRADOR DEL DUEÑO (Emilio, 3-nov 18:13Z: «Tus cambios» se perdían al cerrar el manual). Lo que marcó y aún no pidió queda en la plataforma, por cliente y documento, y se retoma en cualquier equipo.
 * No gasta ni deja fila en `eventos_de_emilio`: se guarda con cada toque, y no es una decisión hasta que él pide los cambios. Sirve para el manual y para el plan.
 * `revision` evita que un equipo pise a otro: quien guarda sobre una revisión vieja recibe 409 con la vigente.
 */
import { TOPE_REAL_DEL_PEDIDO } from '../limites-de-tamano'

type Fila = Record<string, unknown>
export interface BaseDelBorrador { from(tabla: string): any }
export const DOCUMENTOS_CON_BORRADOR = ['manual', 'plan'] as const
export type Salida = { status: number; cuerpo: Fila }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const COLUMNAS = 'client_id, documento, documento_id, acciones, revision, actualizado_por, actualizado_en'
const mal = (status: number, error: string, detalle: string): Salida => ({ status, cuerpo: { ok: false, error, detalle: detalle.slice(0, 300) } })
const esObjeto = (x: unknown): x is Fila => typeof x === 'object' && x !== null && !Array.isArray(x)

function llave(client_id: unknown, documento: unknown): { client_id: string; documento: string } | Salida {
  if (typeof client_id !== 'string' || !UUID.test(client_id)) return mal(400, 'entrada_invalida', '`client_id` debe ser un uuid')
  if (typeof documento !== 'string' || !(DOCUMENTOS_CON_BORRADOR as readonly string[]).includes(documento)) return mal(400, 'entrada_invalida', '`documento` debe ser manual o plan')
  return { client_id, documento }
}

async function leerFila(db: BaseDelBorrador, k: { client_id: string; documento: string }): Promise<{ fila: Fila | null; error?: string }> {
  const r = await db.from('borradores_del_dueno').select(COLUMNAS).eq('client_id', k.client_id).eq('documento', k.documento).limit(1)
  if (r.error) return { fila: null, error: String(r.error.message ?? r.error) }
  return { fila: ((r.data as Fila[] | null) ?? [])[0] ?? null }
}

export async function leerBorrador(db: BaseDelBorrador, client_id: unknown, documento: unknown): Promise<Salida> {
  const k = llave(client_id, documento)
  if ('status' in k) return k
  const { fila, error } = await leerFila(db, k)
  if (error) return mal(502, 'no_se_pudo_leer', error)
  return { status: 200, cuerpo: { ok: true, borrador: fila } }
}

export async function borrarBorrador(db: BaseDelBorrador, client_id: unknown, documento: unknown): Promise<Salida> {
  const k = llave(client_id, documento)
  if ('status' in k) return k
  const r = await db.from('borradores_del_dueno').delete().eq('client_id', k.client_id).eq('documento', k.documento)
  if (r.error) return mal(502, 'no_se_pudo_borrar', String(r.error.message ?? r.error))
  return { status: 200, cuerpo: { ok: true, borrador: null } }
}

/** cuerpo: { client_id, documento, documento_id, acciones, revision_base?, reviewer? }. Sin `revision_base` guarda sobre lo que haya; `acciones` vacío borra: un borrador sin nada no frena aprobar */
export async function guardarBorrador(db: BaseDelBorrador, cuerpo: unknown, ahora: Date = new Date()): Promise<Salida> {
  const b = esObjeto(cuerpo) ? cuerpo : {}
  const k = llave(b.client_id, b.documento)
  if ('status' in k) return k
  if (!esObjeto(b.acciones)) return mal(400, 'entrada_invalida', '`acciones` debe ser un objeto')
  if (typeof b.documento_id !== 'string' || !b.documento_id.trim()) return mal(400, 'entrada_invalida', 'falta `documento_id`: la versión sobre la que se hizo el borrador')
  if (b.revision_base !== undefined && (!Number.isInteger(b.revision_base) || Number(b.revision_base) < 0)) return mal(400, 'entrada_invalida', '`revision_base` debe ser un entero')
  if (JSON.stringify(b.acciones).length > TOPE_REAL_DEL_PEDIDO) return mal(400, 'entrada_invalida', `el borrador pasa de ${TOPE_REAL_DEL_PEDIDO} caracteres`)
  if (!Object.keys(b.acciones).length) return borrarBorrador(db, k.client_id, k.documento)

  const previa = await leerFila(db, k)
  if (previa.error) return mal(502, 'no_se_pudo_leer', previa.error)
  const choque = (borrador: Fila | null): Salida => ({ status: 409, cuerpo: { ok: false, error: 'borrador_cambio', detalle: 'Este borrador cambió en otro equipo.', borrador } })
  const revisionPrevia = previa.fila ? Number(previa.fila.revision) : 0
  if (b.revision_base !== undefined && Number(b.revision_base) !== revisionPrevia) return choque(previa.fila)

  const datos = { documento_id: b.documento_id.trim(), acciones: b.acciones, actualizado_por: typeof b.reviewer === 'string' && b.reviewer.trim() ? b.reviewer.trim().slice(0, 80) : 'emilio', actualizado_en: ahora.toISOString() }
  if (!previa.fila) {
    const ins = await db.from('borradores_del_dueno').insert({ ...k, ...datos, revision: 1 }).select(COLUMNAS)
    if (ins.error?.code === '23505') return choque((await leerFila(db, k)).fila)
    if (ins.error) return mal(502, 'no_se_pudo_guardar', String(ins.error.message ?? ins.error))
    return { status: 200, cuerpo: { ok: true, borrador: ((ins.data as Fila[] | null) ?? [])[0] ?? null } }
  }
  const upd = await db.from('borradores_del_dueno').update({ ...datos, revision: revisionPrevia + 1 }).eq('client_id', k.client_id).eq('documento', k.documento).eq('revision', revisionPrevia).select(COLUMNAS)
  if (upd.error) return mal(502, 'no_se_pudo_guardar', String(upd.error.message ?? upd.error))
  const guardada = ((upd.data as Fila[] | null) ?? [])[0]
  if (!guardada) return choque((await leerFila(db, k)).fila)
  return { status: 200, cuerpo: { ok: true, borrador: guardada } }
}

/** ¿hay cambios sin pedir? Aprobar el manual lo consulta: lo retirado o elegido debe contar antes de seguir con el plan */
export async function hayBorrador(db: BaseDelBorrador, client_id: string, documento: string): Promise<{ hay: boolean; error?: string }> {
  const { fila, error } = await leerFila(db, { client_id, documento })
  return error ? { hay: false, error } : { hay: !!fila }
}
