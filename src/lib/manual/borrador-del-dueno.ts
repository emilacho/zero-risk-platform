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
/** 4-nov · vacío de verdad: «Descartar todo» manda las claves del panel sin nada adentro. Mirar solo si hay claves dejaba una fila vacía que frenaba aprobar y daba un falso «cambió en otro equipo» */
export function sinNada(v: unknown): boolean {
  if (v === null || v === undefined) return true
  if (typeof v === 'string') return !v.trim()
  if (Array.isArray(v)) return v.every(sinNada)
  if (esObjeto(v)) return Object.values(v).every(sinNada)
  return false
}

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

  const previa = await leerFila(db, k)
  if (previa.error) return mal(502, 'no_se_pudo_leer', previa.error)
  const choque = (borrador: Fila | null): Salida => ({ status: 409, cuerpo: { ok: false, error: 'borrador_cambio', detalle: 'Este borrador cambió en otro equipo.', borrador } })
  const revisionPrevia = previa.fila ? Number(previa.fila.revision) : 0
  // una fila sin nada no tiene qué proteger: no hay choque que avisar
  const hayQueProteger = !!previa.fila && !sinNada(previa.fila.acciones)
  if (hayQueProteger && b.revision_base !== undefined && Number(b.revision_base) !== revisionPrevia) return choque(previa.fila)
  // va después de la revisión: una pantalla vieja que guarda «vacío» no borra lo que otro equipo acaba de marcar
  if (sinNada(b.acciones)) return borrarBorrador(db, k.client_id, k.documento)

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

export interface LoEnviado { campos: Record<string, string | null>; notas: Record<string, string>; libre: string }
export type CierreDelBorrador = { estado: 'sin_borrador' | 'borrado' } | { estado: 'queda'; queda: string[] } | { estado: 'error'; detalle: string }

/**
 * 4-nov · Emilio: tras «Pedir los cambios» quedaba un borrador «de la versión anterior» con lo que ya había mandado. Un pedido se lleva del borrador lo que envió, con el texto exacto: si no queda nada, se borra;
 * si queda algo (lo marcó en otro equipo mientras tanto), sigue sobre la versión vigente y se dice qué es. Lo que no coincide no se toca. Nunca lanza: el pedido ya salió.
 */
export async function quitarDelBorrador(db: BaseDelBorrador, client_id: string, enviado: LoEnviado, ahora: Date = new Date()): Promise<CierreDelBorrador> {
  try {
    const k = { client_id, documento: 'manual' }
    const { fila, error } = await leerFila(db, k)
    if (error) return { estado: 'error', detalle: error.slice(0, 200) }
    if (!fila) return { estado: 'sin_borrador' }
    const a = esObjeto(fila.acciones) ? fila.acciones : {}
    const texto = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
    const campos: Fila = { ...(esObjeto(a.campos) ? a.campos : {}) }, notas: Fila = { ...(esObjeto(a.notas) ? a.notas : {}) }
    const como: Fila = { ...(esObjeto(a.como) ? a.como : {}) }, detalle: Fila = { ...(esObjeto(a.detalle) ? a.detalle : {}) }
    for (const c of Object.keys(campos)) {
      if (!(c in enviado.campos) || texto(enviado.campos[c]) !== texto(campos[c])) continue
      delete campos[c]; delete como[c]; delete detalle[c]
    }
    for (const c of Object.keys(notas)) if (c in enviado.notas && texto(enviado.notas[c]) === texto(notas[c])) delete notas[c]
    const libre = texto(a.libre) && texto(a.libre) === texto(enviado.libre) ? '' : a.libre
    const resto = { ...a, campos, como, notas, detalle, libre }
    if (sinNada({ campos, notas, libre })) {
      const b = await borrarBorrador(db, client_id, 'manual')
      return b.status === 200 ? { estado: 'borrado' } : { estado: 'error', detalle: String(b.cuerpo.detalle ?? 'no se pudo borrar') }
    }
    const v = await db.from('client_brand_books').select('id').eq('client_id', client_id).order('version', { ascending: false }).limit(1)
    const vigente = v.error ? null : ((v.data as Fila[] | null) ?? [])[0]
    const hora = ahora.toISOString()
    const u = await db.from('borradores_del_dueno').update({ acciones: resto, revision: Number(fila.revision) + 1, actualizado_en: hora, ...(vigente ? { documento_id: String(vigente.id) } : {}) }).eq('client_id', client_id).eq('documento', 'manual').eq('revision', Number(fila.revision))
    if (u.error) return { estado: 'error', detalle: String(u.error.message ?? u.error).slice(0, 200) }
    return { estado: 'queda', queda: [...Object.keys(campos), ...Object.keys(notas), ...(texto(libre) ? ['texto libre'] : [])] }
  } catch (e) {
    return { estado: 'error', detalle: e instanceof Error ? e.message.slice(0, 200) : 'error' }
  }
}

/** ¿hay cambios sin pedir? Aprobar el manual lo consulta: lo retirado o elegido debe contar antes de seguir con el plan */
export async function hayBorrador(db: BaseDelBorrador, client_id: string, documento: string): Promise<{ hay: boolean; error?: string }> {
  const { fila, error } = await leerFila(db, { client_id, documento })
  return error ? { hay: false, error } : { hay: !!fila && !sinNada(fila.acciones) }
}
