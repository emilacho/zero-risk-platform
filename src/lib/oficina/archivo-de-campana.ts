/**
 * ARCHIVO DE UNA CAMPAÑA ANTERIOR (03-nov · pedido por Emilio). No se borra ni se rechaza nada: queda de una campaña reemplazada.
 * La campaña pasa a `reemplazada`, que el reloj no lee. Filas, encargos y piezas se marcan con `archivada_en` sin tocar su estado: volver atrás es quitar la marca.
 * Las esperas vivas se cancelan porque `esperasVivas` no mira la campaña: al encenderse la cadena, sus vencimientos cambiarían filas. Se reabren solo las que cerró el archivo.
 * Una pieza que Emilio aprobó no se archiva: se declara.
 */
import { tablasDelArchivo } from '../cadena/almacen-supabase'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const MOTIVO_DE_ARCHIVO = 'archivada · campaña anterior'
const ESTADOS_ARCHIVABLES = ['pausada', 'necesita_humano', 'cerrada', 'reemplazada']
const VIVAS_AL_RESTAURAR = ['abierta', 'estrategia', 'calendario', 'activa', 'pausada', 'necesita_humano']
const TIPO_DE_PIEZA = 'content_piece_review'

type Fila = Record<string, unknown>
interface Lectura { data: unknown; error: { message: string } | null }
interface Consulta extends PromiseLike<Lectura> {
  select(c?: string): Consulta
  eq(c: string, v: unknown): Consulta
  neq(c: string, v: unknown): Consulta
  in(c: string, v: unknown[]): Consulta
  is(c: string, v: unknown): Consulta
  gte(c: string, v: unknown): Consulta
  gt(c: string, v: unknown): Consulta
  lt(c: string, v: unknown): Consulta
  update(p: Fila): Consulta
  maybeSingle(): Consulta
}
export type Db = { from(tabla: string): Consulta }
export interface Respuesta { status: number; body: Record<string, unknown> }

const mal = (status: number, error: string, detalle: string): Respuesta => ({ status, body: { error, detalle } })
const falla = (m: string): Respuesta => mal(500, 'archivo_error', m)
const esObjeto = (v: unknown): v is Fila => !!v && typeof v === 'object' && !Array.isArray(v)
const filasDe = (r: Lectura): Fila[] => (r.data as Fila[] | null) ?? []

async function leerCampana(db: Db, cuerpo: unknown): Promise<{ c: Fila; cuerpo: Fila } | Respuesta> {
  if (!esObjeto(cuerpo) || typeof cuerpo.campana_id !== 'string' || !UUID.test(cuerpo.campana_id)) return mal(400, 'entrada_invalida', '`campana_id` debe ser un uuid')
  const r = await tablasDelArchivo(db).campanas().select('*').eq('id', cuerpo.campana_id).maybeSingle()
  if (r.error) return falla(r.error.message)
  if (!r.data) return mal(404, 'sin_campana', 'no existe esa campaña')
  return { c: r.data as Fila, cuerpo }
}
const esRespuesta = (x: unknown): x is Respuesta => esObjeto(x) && typeof x.status === 'number'

/** POST /api/cadena/archivo/archivar: sin `dry_run:false` no escribe y solo dice qué haría. Repetirlo no cambia nada */
export async function archivarCampana(db: Db, cuerpo: unknown, ahora: Date = new Date()): Promise<Respuesta> {
  const l = await leerCampana(db, cuerpo)
  if (esRespuesta(l)) return l
  const { c } = l
  if (!ESTADOS_ARCHIVABLES.includes(String(c.estado))) return mal(409, 'campana_viva', `la campaña está «${c.estado}»: primero se pausa`)
  const seco = l.cuerpo.dry_run !== false
  const motivo = typeof l.cuerpo.motivo === 'string' && l.cuerpo.motivo.trim() ? l.cuerpo.motivo.trim() : MOTIVO_DE_ARCHIVO
  const campana_id = c.id

  const filas = await tablasDelArchivo(db).filas().select('id, estado').eq('campana_id', campana_id).is('archivada_en', null)
  if (filas.error) return falla(filas.error.message)
  const esperas = await tablasDelArchivo(db).esperas().select('id').eq('campana_id', campana_id).eq('estado', 'viva')
  if (esperas.error) return falla(esperas.error.message)
  // las piezas se atan por fechas: desde que nació la campaña hasta que se archivó o nació la siguiente. Sin este límite, repetir arrastraría las piezas de la campaña nueva
  const siguientes = await tablasDelArchivo(db).campanas().select('id, creada_en').eq('client_id', c.client_id).eq('seco', c.seco).neq('id', c.id).gt('creada_en', c.creada_en)
  if (siguientes.error) return falla(siguientes.error.message)
  const nacioOtra = filasDe(siguientes).map((x) => String(x.creada_en)).sort()[0]
  const limite = typeof c.archivada_en === 'string' ? c.archivada_en : nacioOtra
  const consultaDePiezas = db.from('hitl_queue').select('id, status, metadata').eq('client_id', c.client_id).eq('type', TIPO_DE_PIEZA).gte('created_at', c.creada_en).is('archivada_en', null)
  const hq = await (limite ? consultaDePiezas.lt('created_at', limite) : consultaDePiezas)
  if (hq.error) return falla(hq.error.message)
  const aprobadas = filasDe(hq).filter((p) => p.status === 'approved')
  // lo que Emilio sacó del archivo no vuelve a entrar si esto se repite
  const piezas = filasDe(hq).filter((p) => p.status !== 'approved' && !(esObjeto(p.metadata) && p.metadata.recuperada_del_archivo))
  const encargos = [...new Set(piezas.map((p) => (esObjeto(p.metadata) ? p.metadata.oficina_encargo_id : null)).filter((x): x is string => typeof x === 'string'))]
  const resumen = { filas: filasDe(filas).length, esperas: filasDe(esperas).length, piezas: piezas.length, encargos: encargos.length, aprobadas_sin_archivar: aprobadas.map((p) => p.id) }
  if (seco) return { status: 200, body: { ok: true, dry_run: true, estado_actual: c.estado, ...resumen } }

  // la campaña va primero: deja de contar como viva, y si algo falla después, repetir usa esta misma fecha, que es con la que se reabren las esperas
  const hora = typeof c.archivada_en === 'string' ? c.archivada_en : ahora.toISOString()
  const antes = c.archivada_en ? {} : { estado_antes_de_archivar: c.estado, motivo_antes_de_archivar: c.estado_motivo ?? null }
  const uc = await tablasDelArchivo(db).campanas().update({ ...antes, estado: 'reemplazada', estado_motivo: motivo, archivada_en: hora, archivo_motivo: motivo, actualizada_en: ahora.toISOString() }).eq('id', campana_id)
  if (uc.error) return falla(uc.error.message)
  const ues = await tablasDelArchivo(db).esperas().update({ estado: 'cancelada', archivada_en: hora }).eq('campana_id', campana_id).eq('estado', 'viva')
  if (ues.error) return falla(ues.error.message)
  const uf = await tablasDelArchivo(db).filas().update({ archivada_en: hora, archivo_motivo: motivo }).eq('campana_id', campana_id).is('archivada_en', null)
  if (uf.error) return falla(uf.error.message)
  if (piezas.length) {
    const up = await db.from('hitl_queue').update({ archivada_en: hora, archivo_motivo: motivo }).in('id', piezas.map((p) => p.id))
    if (up.error) return falla(up.error.message)
  }
  if (encargos.length) {
    const ue = await db.from('oficina_encargos').update({ archivada_en: hora, archivo_motivo: motivo }).in('id', encargos)
    if (ue.error) return falla(ue.error.message)
  }
  return { status: 200, body: { ok: true, dry_run: false, ...resumen } }
}

/** POST /api/cadena/archivo/desarchivar: lo deja como estaba. Si el cliente ya tiene otra campaña viva, no: serían dos */
export async function desarchivarCampana(db: Db, cuerpo: unknown, ahora: Date = new Date()): Promise<Respuesta> {
  const l = await leerCampana(db, cuerpo)
  if (esRespuesta(l)) return l
  const { c } = l
  if (!c.archivada_en) return mal(409, 'sin_archivar', 'esa campaña no está archivada')
  const otras = await tablasDelArchivo(db).campanas().select('id, estado').eq('client_id', c.client_id).eq('seco', c.seco).neq('id', c.id).in('estado', VIVAS_AL_RESTAURAR)
  if (otras.error) return falla(otras.error.message)
  if (filasDe(otras).length) return mal(409, 'hay_otra_campana', 'el cliente ya tiene una campaña viva')
  const hora = ahora.toISOString()
  const limpio = { archivada_en: null, archivo_motivo: null }
  const uf = await tablasDelArchivo(db).filas().update(limpio).eq('campana_id', c.id)
  if (uf.error) return falla(uf.error.message)
  const ue = await tablasDelArchivo(db).esperas().update({ estado: 'viva', archivada_en: null }).eq('campana_id', c.id).eq('estado', 'cancelada').eq('archivada_en', c.archivada_en)
  if (ue.error) return falla(ue.error.message)
  const hq = await db.from('hitl_queue').select('id, metadata').eq('client_id', c.client_id).eq('type', TIPO_DE_PIEZA).gte('created_at', c.creada_en).eq('archivada_en', c.archivada_en)
  if (hq.error) return falla(hq.error.message)
  const piezas = filasDe(hq)
  const encargos = piezas.map((p) => (esObjeto(p.metadata) ? p.metadata.oficina_encargo_id : null)).filter((x): x is string => typeof x === 'string')
  if (piezas.length) {
    const up = await db.from('hitl_queue').update(limpio).in('id', piezas.map((p) => p.id))
    if (up.error) return falla(up.error.message)
  }
  if (encargos.length) {
    const uo = await db.from('oficina_encargos').update(limpio).in('id', encargos)
    if (uo.error) return falla(uo.error.message)
  }
  const uc = await tablasDelArchivo(db).campanas().update({ estado: c.estado_antes_de_archivar ?? 'pausada', estado_motivo: c.motivo_antes_de_archivar ?? null, archivada_en: null, archivo_motivo: null, estado_antes_de_archivar: null, motivo_antes_de_archivar: null, actualizada_en: hora }).eq('id', c.id)
  if (uc.error) return falla(uc.error.message)
  return { status: 200, body: { ok: true, campana_id: c.id, estado: c.estado_antes_de_archivar ?? 'pausada', piezas: piezas.length } }
}

/** POST /api/cadena/archivo/recuperar-pieza: Emilio quiere reusarla, y vuelve a su bandeja. La decisión anterior queda guardada */
export async function recuperarPieza(db: Db, cuerpo: unknown, ahora: Date = new Date()): Promise<Respuesta> {
  if (!esObjeto(cuerpo) || typeof cuerpo.hitl_id !== 'string' || !UUID.test(cuerpo.hitl_id)) return mal(400, 'entrada_invalida', '`hitl_id` debe ser un uuid')
  const r = await db.from('hitl_queue').select('id, status, decision, metadata, archivada_en').eq('id', cuerpo.hitl_id).maybeSingle()
  if (r.error) return falla(r.error.message)
  const f = r.data as Fila | null
  if (!f) return mal(404, 'sin_pieza', 'no existe esa pieza')
  if (!f.archivada_en) return mal(409, 'sin_archivar', 'esa pieza no está en el archivo')
  const metadata = esObjeto(f.metadata) ? f.metadata : {}
  const hora = ahora.toISOString()
  // `recuperada_del_archivo` evita que el barrido de lo reemplazado la vuelva a cerrar por ser del plan anterior
  const u = await db.from('hitl_queue').update({
    status: 'pending', archivada_en: null, archivo_motivo: null, decision: null, reviewer: null, resolved_by: null, resolved_at: null, decided_at: null, resolution_notes: null, expires_at: null,
    metadata: { ...metadata, recuperada_del_archivo: { en: hora, estado_anterior: f.status, decision_anterior: f.decision ?? null } },
  }).eq('id', f.id)
  if (u.error) return falla(u.error.message)
  if (typeof metadata.oficina_encargo_id === 'string') {
    const ue = await db.from('oficina_encargos').update({ archivada_en: null, archivo_motivo: null }).eq('id', metadata.oficina_encargo_id)
    if (ue.error) return falla(ue.error.message)
  }
  return { status: 200, body: { ok: true, hitl_id: f.id, status: 'pending' } }
}

// ── 11-nov · ARCHIVAR UNA PIEZA SUELTA (GO Lenovo 04:03Z · opción 2 de CC1 · líneas de CC6) ────────────────────────────────────────────────
// Para una decisión del dueño sobre UNA pieza (p. ej. «fuera de uso»), sin archivar su campaña. Va por id explícito y con razón obligatoria.
// Marca la bandeja y su encargo con `archivada_en` y la razón, sin tocar su estado (tampoco una aprobada: es una decisión por id, no una regla).
// Sin `dry_run:false` solo dice qué haría. Repetir no cambia nada. Desarchivar quita SOLO lo que puso este archivo (misma hora): el estado sigue igual.

/** los encargos de la oficina de una pieza: los que la apuntan como su bandeja y el de su metadata */
async function encargosDeLaPieza(db: Db, f: Fila): Promise<{ ids: string[] } | Respuesta> {
  const r = await db.from('oficina_encargos').select('id, archivada_en').eq('hitl_queue_id', f.id)
  if (r.error) return falla(r.error.message)
  const ids = new Set(filasDe(r).map((e) => String(e.id)))
  const m = esObjeto(f.metadata) ? f.metadata.oficina_encargo_id : null
  if (typeof m === 'string' && m !== '') ids.add(m)
  return { ids: [...ids] }
}

async function leerPieza(db: Db, cuerpo: unknown): Promise<{ f: Fila; cuerpo: Fila } | Respuesta> {
  if (!esObjeto(cuerpo) || typeof cuerpo.hitl_id !== 'string' || !UUID.test(cuerpo.hitl_id)) return mal(400, 'entrada_invalida', '`hitl_id` debe ser un uuid')
  const r = await db.from('hitl_queue').select('id, client_id, type, status, archivada_en, archivo_motivo, metadata').eq('id', cuerpo.hitl_id).maybeSingle()
  if (r.error) return falla(r.error.message)
  const f = r.data as Fila | null
  if (!f) return mal(404, 'sin_pieza', 'no existe esa pieza')
  if (f.type !== TIPO_DE_PIEZA) return mal(409, 'no_es_pieza', `esa fila de la bandeja es «${String(f.type)}», no una pieza`)
  return { f, cuerpo }
}

/** POST /api/cadena/archivo/archivar-pieza: `{ hitl_id, motivo, dry_run }` */
export async function archivarPieza(db: Db, cuerpo: unknown, ahora: Date = new Date()): Promise<Respuesta> {
  const l = await leerPieza(db, cuerpo)
  if (esRespuesta(l)) return l
  const { f } = l
  const motivo = typeof l.cuerpo.motivo === 'string' ? l.cuerpo.motivo.trim() : ''
  if (!motivo) return mal(400, 'entrada_invalida', '`motivo` es obligatorio: queda escrita la razón del archivo')
  if (f.archivada_en) return { status: 200, body: { ok: true, ya_archivada: true, hitl_id: f.id, archivada_en: f.archivada_en, archivo_motivo: f.archivo_motivo ?? null } }
  const enc = await encargosDeLaPieza(db, f)
  if (esRespuesta(enc)) return enc
  const resumen = { hitl_id: f.id, client_id: f.client_id, estado: f.status, encargos: enc.ids }
  if (l.cuerpo.dry_run !== false) return { status: 200, body: { ok: true, dry_run: true, ...resumen } }
  const hora = ahora.toISOString()
  const up = await db.from('hitl_queue').update({ archivada_en: hora, archivo_motivo: motivo }).eq('id', f.id).is('archivada_en', null)
  if (up.error) return falla(up.error.message)
  if (enc.ids.length) {
    const ue = await db.from('oficina_encargos').update({ archivada_en: hora, archivo_motivo: motivo }).in('id', enc.ids).is('archivada_en', null)
    if (ue.error) return falla(ue.error.message)
  }
  return { status: 200, body: { ok: true, dry_run: false, archivada_en: hora, archivo_motivo: motivo, ...resumen } }
}

/** POST /api/cadena/archivo/desarchivar-pieza: `{ hitl_id }` · deja la pieza y su encargo como estaban (solo lo que marcó ese archivo) */
export async function desarchivarPieza(db: Db, cuerpo: unknown): Promise<Respuesta> {
  const l = await leerPieza(db, cuerpo)
  if (esRespuesta(l)) return l
  const { f } = l
  if (!f.archivada_en) return mal(409, 'sin_archivar', 'esa pieza no está archivada')
  const enc = await encargosDeLaPieza(db, f)
  if (esRespuesta(enc)) return enc
  const up = await db.from('hitl_queue').update({ archivada_en: null, archivo_motivo: null }).eq('id', f.id).eq('archivada_en', f.archivada_en)
  if (up.error) return falla(up.error.message)
  if (enc.ids.length) {
    const ue = await db.from('oficina_encargos').update({ archivada_en: null, archivo_motivo: null }).in('id', enc.ids).eq('archivada_en', f.archivada_en)
    if (ue.error) return falla(ue.error.message)
  }
  return { status: 200, body: { ok: true, hitl_id: f.id, estado: f.status } }
}
