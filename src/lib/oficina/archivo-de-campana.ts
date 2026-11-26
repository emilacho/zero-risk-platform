/**
 * ARCHIVO DE UNA CAMPAÑA ANTERIOR (03-nov · pedido por Emilio). No se borra ni se rechaza nada: queda de una campaña reemplazada.
 * La campaña pasa a `reemplazada`, que el reloj no lee. Filas, encargos y piezas se marcan con `archivada_en` sin tocar su estado: volver atrás es quitar la marca.
 * Las esperas vivas se cancelan porque `esperasVivas` no mira la campaña: al encenderse la cadena, sus vencimientos cambiarían filas. Se reabren solo las que cerró el archivo.
 * Una pieza que Emilio aprobó no se archiva: se declara.
 */
import { tablasDelArchivo } from '../cadena/almacen-supabase'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const MOTIVO_DE_ARCHIVO = 'archivada · campaña anterior'
/** 26-nov · Emilio (GO Lenovo 11:57Z): «Archivar» en un clic desde el tablero sirve en CUALQUIER estado, también la activa («cerrar aunque funcione bien») */
export const MOTIVO_DEL_TABLERO = 'archivada desde el tablero'
const ESTADOS_ARCHIVABLES = ['abierta', 'estrategia', 'calendario', 'activa', 'pausada', 'necesita_humano', 'cerrada', 'reemplazada']
/** los encargos de la oficina que todavía pueden pedir otro turno: al archivar se cierran para que no gasten más (el turno que ya salió termina; no se lanza el siguiente) */
export const ENCARGOS_EN_CURSO = ['abierto', 'en_paso']
// los estados que el índice de «una viva por cliente» deja fuera
const FUERA_DEL_INDICE = ['cerrada', 'reemplazada']
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

export const RASTROS_DISTINTOS = 'rastros_distintos'
export const OTRA_VIVA = 'otra_campana_viva'
const SIN_DUENO = 'sin_dueno'
const texto = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v : null)
const tiempo = (v: unknown): number => (typeof v === 'string' ? Date.parse(v) : NaN)

/**
 * De qué campaña es cada pieza (20-nov · entrega 4 · D3: con varias campañas vivas, las fechas mezclaban piezas).
 * 1. Por su rastro: el `campana_id` del encargo y el `provenance_tag.campana_id` de su parte (el de la pieza o el del encargo). Si dicen dos campañas distintas, no es de ninguna: se declara.
 * 2. Sin rastro (las piezas de antes de #1245): por la hora, solo si a esa hora la única campaña viva del cliente era esta. Si había otra, se declara.
 * Una campaña sin llave vive hasta que se archiva o nace la siguiente sin llave (la base no deja dos vivas sin llave). Una con llave, hasta que se archiva: si no, se toma por viva.
 */
async function duenoDeLasPiezas(db: Db, c: Fila, piezas: Fila[]): Promise<Map<string, string> | Respuesta> {
  const meta = (p: Fila): Fila => (esObjeto(p.metadata) ? p.metadata : {})
  const idsEnc = [...new Set(piezas.map((p) => texto(meta(p).oficina_encargo_id)).filter((x): x is string => !!x))]
  const enc = new Map<string, Fila>()
  if (idsEnc.length) {
    const r = await db.from('oficina_encargos').select('id, campana_id, parte_id').in('id', idsEnc)
    if (r.error) return falla(r.error.message)
    for (const f of filasDe(r)) enc.set(String(f.id), f)
  }
  const parteDe = (p: Fila): string[] => [texto(meta(p).parte_id), texto(enc.get(String(meta(p).oficina_encargo_id))?.parte_id)].filter((x): x is string => !!x)
  const idsPartes = [...new Set(piezas.flatMap(parteDe))]
  const campanaDelParte = new Map<string, string>()
  if (idsPartes.length) {
    const r = await db.from('client_historical_outputs').select('id, provenance_tag').in('id', idsPartes)
    if (r.error) return falla(r.error.message)
    for (const f of filasDe(r)) { const k = esObjeto(f.provenance_tag) ? texto(f.provenance_tag.campana_id) : null; if (k) campanaDelParte.set(String(f.id), k) }
  }
  const todas = await tablasDelArchivo(db).campanas().select('id, creada_en, archivada_en, llave_de_campana').eq('client_id', c.client_id).eq('seco', c.seco)
  if (todas.error) return falla(todas.error.message)
  const campanas = filasDe(todas)
  if (!campanas.some((x) => x.id === c.id)) campanas.push(c)
  const sinLlave = campanas.filter((x) => !texto(x.llave_de_campana)).map((x) => tiempo(x.creada_en)).sort((a, b) => a - b)
  const fin = (x: Fila): number => {
    if (texto(x.archivada_en)) return tiempo(x.archivada_en)
    if (texto(x.llave_de_campana)) return Infinity
    return sinLlave.find((t) => t > tiempo(x.creada_en)) ?? Infinity
  }
  const vivaA = (x: Fila, t: number): boolean => tiempo(x.creada_en) <= t && t < fin(x)
  const r = new Map<string, string>()
  for (const p of piezas) {
    const m = meta(p)
    const e = enc.get(String(m.oficina_encargo_id))
    const rastro = new Set([texto(e?.campana_id), ...parteDe(p).map((k) => campanaDelParte.get(k) ?? null)].filter((x): x is string => !!x))
    if (rastro.size > 1) { r.set(String(p.id), RASTROS_DISTINTOS); continue }
    if (rastro.size === 1) { r.set(String(p.id), [...rastro][0]); continue }
    const t = tiempo(p.created_at)
    const vivas = campanas.filter((x) => vivaA(x, t))
    r.set(String(p.id), vivas.length === 1 ? String(vivas[0].id) : vivas.some((x) => x.id === c.id) ? OTRA_VIVA : SIN_DUENO)
  }
  return r
}

/** POST /api/cadena/archivo/archivar: sin `dry_run:false` no escribe y solo dice qué haría. Repetirlo no cambia nada */
export async function archivarCampana(db: Db, cuerpo: unknown, ahora: Date = new Date()): Promise<Respuesta> {
  const l = await leerCampana(db, cuerpo)
  if (esRespuesta(l)) return l
  const { c } = l
  if (!ESTADOS_ARCHIVABLES.includes(String(c.estado))) return mal(409, 'estado_desconocido', `la campaña está «${c.estado}»: no es un estado de campaña`)
  const seco = l.cuerpo.dry_run !== false
  const motivo = typeof l.cuerpo.motivo === 'string' && l.cuerpo.motivo.trim() ? l.cuerpo.motivo.trim() : MOTIVO_DE_ARCHIVO
  const campana_id = c.id

  const filas = await tablasDelArchivo(db).filas().select('id, estado').eq('campana_id', campana_id).is('archivada_en', null)
  if (filas.error) return falla(filas.error.message)
  const esperas = await tablasDelArchivo(db).esperas().select('id').eq('campana_id', campana_id).eq('estado', 'viva')
  if (esperas.error) return falla(esperas.error.message)
  // 20-nov · entrega 4 (D3) · con varias campañas vivas, las piezas se atan por su rastro y no por fechas
  const hq = await db.from('hitl_queue').select('id, status, created_at, metadata').eq('client_id', c.client_id).eq('type', TIPO_DE_PIEZA).gte('created_at', c.creada_en).is('archivada_en', null)
  if (hq.error) return falla(hq.error.message)
  const dueno = await duenoDeLasPiezas(db, c, filasDe(hq))
  if (esRespuesta(dueno)) return dueno
  const deEsta = filasDe(hq).filter((p) => dueno.get(String(p.id)) === c.id)
  const sin_campana_clara = filasDe(hq).filter((p) => { const x = dueno.get(String(p.id)); return x === RASTROS_DISTINTOS || x === OTRA_VIVA }).map((p) => ({ id: p.id, motivo: dueno.get(String(p.id)) }))
  const aprobadas = deEsta.filter((p) => p.status === 'approved')
  // lo que Emilio sacó del archivo no vuelve a entrar si esto se repite
  const piezas = deEsta.filter((p) => p.status !== 'approved' && !(esObjeto(p.metadata) && p.metadata.recuperada_del_archivo))
  const encargos = [...new Set(piezas.map((p) => (esObjeto(p.metadata) ? p.metadata.oficina_encargo_id : null)).filter((x): x is string => typeof x === 'string'))]
  // 26-nov · lo que la campaña tiene EN CURSO en la oficina (una activa puede tenerlo): se detiene sin gastar más
  const enCurso = await db.from('oficina_encargos').select('id').eq('campana_id', campana_id).in('estado', ENCARGOS_EN_CURSO)
  if (enCurso.error) return falla(enCurso.error.message)
  const detenidos = filasDe(enCurso).map((e) => String(e.id))
  const resumen = { filas: filasDe(filas).length, esperas: filasDe(esperas).length, piezas: piezas.length, encargos: encargos.length, encargos_detenidos: detenidos, aprobadas_sin_archivar: aprobadas.map((p) => p.id), sin_campana_clara }
  if (seco) return { status: 200, body: { ok: true, dry_run: true, estado_actual: c.estado, ...resumen } }

  // la campaña va primero: deja de contar como viva, y si algo falla después, repetir usa esta misma fecha, que es con la que se reabren las esperas
  const hora = typeof c.archivada_en === 'string' ? c.archivada_en : ahora.toISOString()
  const antes = c.archivada_en ? {} : { estado_antes_de_archivar: c.estado, motivo_antes_de_archivar: c.estado_motivo ?? null }
  const uc = await tablasDelArchivo(db).campanas().update({ ...antes, estado: 'reemplazada', estado_motivo: motivo, archivada_en: hora, archivo_motivo: motivo, actualizada_en: ahora.toISOString() }).eq('id', campana_id)
  if (uc.error) return falla(uc.error.message)
  const ues = await tablasDelArchivo(db).esperas().update({ estado: 'cancelada', archivada_en: hora }).eq('campana_id', campana_id).eq('estado', 'viva')
  if (ues.error) return falla(ues.error.message)
  // los encargos en curso se CIERRAN (estado terminal: `avanzar` ya no abre turnos y `recibirResultado` solo anota el costo del que vuelva). Quedan marcados con la hora del archivo
  if (detenidos.length) {
    const ud = await db.from('oficina_encargos').update({ estado: 'cerrado', con_desacuerdo: true, archivada_en: hora, archivo_motivo: `${motivo} · detenido en curso` }).in('id', detenidos).in('estado', ENCARGOS_EN_CURSO)
    if (ud.error) return falla(ud.error.message)
  }
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
  // 20-nov · entrega 4 (D4) · frena solo donde frenaría la base: el índice `cadena_campanas_una_viva_por_cliente` (202611192130) cuenta las campañas sin llave y no cerradas ni reemplazadas
  const vuelveA = String(c.estado_antes_de_archivar ?? 'pausada')
  if (!texto(c.llave_de_campana) && !FUERA_DEL_INDICE.includes(vuelveA)) {
    const otras = await tablasDelArchivo(db).campanas().select('id, estado').eq('client_id', c.client_id).eq('seco', c.seco).neq('id', c.id).is('llave_de_campana', null)
    if (otras.error) return falla(otras.error.message)
    if (filasDe(otras).some((x) => !FUERA_DEL_INDICE.includes(String(x.estado)))) return mal(409, 'hay_otra_campana', 'el cliente ya tiene una campaña viva sin llave')
  }
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

// ── 26-nov · ELIMINAR UNA CAMPAÑA (GO Lenovo 11:57Z · diseño de Emilio: dos clics en el tablero, sin ventana) ─────────────────────────────────
// Borra la campaña y lo que cuelga de ella con UNA llamada a la base (`cadena_eliminar_campana`, migración 202611261300): todo o nada.
// Sin `dry_run:false` solo cuenta lo que borraría. No toca el plan, las partes del cliente, el cerebro, las llamadas a los agentes ni el almacenamiento.

/** las tablas de la cadena con llave a la campaña (las mismas que borra la función de la base, en el mismo orden) */
export const TABLAS_DE_LA_CAMPANA = [
  'cadena_validaciones', 'cadena_correcciones', 'cadena_calendario_filas', 'cadena_esperas', 'cadena_corridas', 'cadena_conceptos',
  'cadena_brief_creativo', 'cadena_estrategia_rondas', 'cadena_estrategias', 'cadena_fichas_de_oferta', 'cadena_pedidos_de_campana',
] as const
export type DbConFuncion = Db & { rpc(fn: string, args: Record<string, unknown>): PromiseLike<Lectura> }

/** POST /api/cadena/archivo/eliminar: `{ campana_id, dry_run }` */
export async function eliminarCampana(db: DbConFuncion, cuerpo: unknown): Promise<Respuesta> {
  const l = await leerCampana(db, cuerpo)
  if (esRespuesta(l)) return l
  const { c } = l
  if (l.cuerpo.dry_run !== false) {
    const cuenta: Record<string, number> = {}
    for (const t of TABLAS_DE_LA_CAMPANA) {
      const r = await db.from(t).select('campana_id').eq('campana_id', c.id)
      if (r.error) return falla(r.error.message)
      cuenta[t] = filasDe(r).length
    }
    const enc = await db.from('oficina_encargos').select('id').eq('campana_id', c.id)
    if (enc.error) return falla(enc.error.message)
    cuenta.oficina_encargos = filasDe(enc).length
    return { status: 200, body: { ok: true, dry_run: true, campana_id: c.id, estado_actual: c.estado, borraria: cuenta } }
  }
  const r = await db.rpc('cadena_eliminar_campana', { p_campana: c.id })
  if (r.error) return falla(r.error.message)
  const out = esObjeto(r.data) ? r.data : {}
  if (out.ok !== true) return mal(404, 'sin_campana', 'no existe esa campaña')
  return { status: 200, body: { ok: true, dry_run: false, campana_id: c.id, borradas: out.borradas ?? {} } }
}
