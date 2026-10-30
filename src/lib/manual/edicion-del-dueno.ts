/**
 * EDITAR Y VALIDAR EL MANUAL DESDE EL DASHBOARD (30-oct · «paso 1 de 3» · firmado por Emilio · US$ 0). Los dos botones de la ficha del cliente: «Editar el manual» y «Validar el manual».
 * Base: RESPUESTA de Cerebro en CONSULTA-LENOVO-a-LENOVO-ANTERIOR-editar-manual-desde-dashboard (§1–§4).
 *
 *  · La fuente del manual es el MANUAL (`client_brand_books`), no el cerebro. Editar = una versión `max+1` vigente con los campos cambiados; cada uno lleva
 *    `_field_meta.<campo> = { fuente:'dueno', por, en, valor_anterior, cita }`. La anterior queda (nada se borra). «Declarado obliga»: las propuestas del agente y las corridas posteriores no lo pisan.
 *  · DESPUÉS, como consecuencia, cada campo cambiado se empuja a la puerta del dueño del cerebro (canal «dashboard · manual», sin `acumula`, con reintento). Si el cerebro falla, el manual ya quedó y
 *    el pendiente se dice (y queda en el rastro de `eventos_de_emilio`).
 *  · Editables = los de la definición única (`campos-del-manual.ts`, `editable`); los derivados no se escriben a mano.
 *  · Validar = la vigente pasa a validada POR EL DUEÑO (nueva versión `max+1`, igual que la promoción de la bandeja; los campos no tocados quedan «aceptados por el dueño»).
 *    Quien lo lee lo ve con `quienValido()` (dueño > jefatura > propuesta).
 * No llama a ningún modelo. La puerta del cerebro entra por parámetro (probable sin red).
 */
import { CAMPOS, evaluarCompletitud, quienValido, type CampoDelManual } from './campos-del-manual'
import { enviarALaPuerta, type EntornoDeLaPuerta, type ResultadoDeEnvio } from '../notas-del-dueno/puerta-del-dueno'
import { CANAL_DEL_MANUAL } from '../portero-alimenta/dueno'

type Fila = Record<string, unknown>
export interface Db { from(tabla: string): any }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const esObjeto = (x: unknown): x is Fila => typeof x === 'object' && x !== null && !Array.isArray(x)
const objeto = (v: unknown): Fila => {
  if (typeof v === 'string') { try { const x = JSON.parse(v); return esObjeto(x) ? x : {} } catch { return {} } }
  return esObjeto(v) ? v : {}
}
export const FLUJO_DEL_DASHBOARD_MANUAL = 'dashboard-manual'
const MARCA_DEL_DUENO = '[frase propia del cliente, verbatim — escrita por el dueño]'

/** los campos que el tablero puede editar, por la clave con que los nombra el tablero (B1) */
export const EDITABLES_DEL_TABLERO: Readonly<Record<string, CampoDelManual>> = Object.fromEntries(
  CAMPOS.filter((c) => c.editable && c.clave_del_tablero).map((c) => [c.clave_del_tablero as string, c]),
)

export interface Cambio { clave: string; clave_del_tablero: string; etiqueta: string; valor: string; valor_anterior: string | null }

const comoTexto = (v: unknown): string | null => {
  if (Array.isArray(v)) { const t = v.map((x) => String(x).trim()).filter(Boolean); return t.length ? t.join('\n') : null }
  if (typeof v === 'string') return v.trim() || null
  return null
}
/** el texto que escribió el dueño → lista (una línea o un «;» por elemento) */
const aLista = (t: string): string[] => t.split(/\r?\n|;/).map((x) => x.trim()).filter(Boolean)

function valoresNuevos(c: CampoDelManual, texto: string): { borrador: unknown; columna: unknown } {
  if (c.clave === 'tagline_opciones') return { borrador: [`${texto} ${MARCA_DEL_DUENO}`], columna: texto }
  const lista = c.tipo === 'lista' ? aLista(texto) : null
  const borrador = lista ?? texto
  const columna = c.tipo_de_columna === 'texto' ? (lista ? lista.join('\n') : texto) : borrador
  return { borrador, columna }
}

export type ResultadoDeEdicion =
  | { ok: true; version_nueva: number; source_id: string; cambios: Cambio[]; completo: boolean; huecos: string[] }
  | { ok: false; status: number; error: string; detalle: string }

const mal = (status: number, error: string, detalle: string): ResultadoDeEdicion => ({ ok: false, status, error, detalle })

async function leerVigente(db: Db, client_id: string): Promise<{ fila: Fila | null; error?: string }> {
  const q = await db.from('client_brand_books').select('*').eq('client_id', client_id).order('version', { ascending: false }).limit(1)
  if (q.error) return { fila: null, error: String(q.error.message ?? q.error) }
  return { fila: (Array.isArray(q.data) ? (q.data[0] as Fila | undefined) : undefined) ?? null }
}

function copiaSinIdentidad(f: Fila): Fila {
  const c = { ...f }
  for (const k of ['id', 'created_at', 'updated_at']) delete c[k]
  return c
}

async function insertarVersion(db: Db, client_id: string, armar: (vigente: Fila) => Fila): Promise<{ ok: true; id: string; version: number; vigente: Fila } | { ok: false; error: string; sin_manual?: boolean }> {
  for (let intento = 0; intento < 2; intento++) {
    const { fila, error } = await leerVigente(db, client_id)
    if (error) return { ok: false, error: `no pude leer el manual vigente: ${error}` }
    if (!fila) return { ok: false, error: 'el cliente todavía no tiene manual', sin_manual: true }
    const nueva = armar(fila)
    const ins = await db.from('client_brand_books').insert(nueva).select('id, version').single()
    if (!ins.error) return { ok: true, id: String((ins.data as Fila).id), version: Number((ins.data as Fila).version), vigente: fila }
    // otra edición entró al mismo tiempo (versión repetida): se vuelve a leer la vigente y se arma otra vez, una sola vez
    const choque = String((ins.error as Fila).code ?? '') === '23505' || /duplicate|unique/i.test(String((ins.error as Fila).message ?? ''))
    if (!choque || intento === 1) return { ok: false, error: `no pude guardar la versión nueva: ${String((ins.error as Fila).message ?? ins.error)}` }
  }
  return { ok: false, error: 'no pude guardar la versión nueva' }
}

export interface EntradaDeEdicion { client_id: string; campos: Record<string, unknown>; comentario?: string | null; reviewer: string; ahora?: Date }

export async function editarManualDelDueno(db: Db, e: EntradaDeEdicion): Promise<ResultadoDeEdicion> {
  if (!UUID.test(e.client_id)) return mal(400, 'entrada_invalida', 'falta el cliente')
  if (!esObjeto(e.campos) || !Object.keys(e.campos).length) return mal(400, 'entrada_invalida', 'faltan los campos que cambian')
  const elegidos: Array<{ campo: CampoDelManual; clave_del_tablero: string; texto: string }> = []
  for (const [k, v] of Object.entries(e.campos)) {
    const campo = EDITABLES_DEL_TABLERO[k]
    if (!campo) return mal(400, 'campo_no_editable', `«${k}» no es un campo que se pueda editar`)
    const texto = typeof v === 'string' ? v.trim() : ''
    if (!texto || texto.length > 2000) return mal(400, 'entrada_invalida', `«${k}» debe tener entre 1 y 2.000 caracteres`)
    elegidos.push({ campo, clave_del_tablero: k, texto })
  }
  const ahora = (e.ahora ?? new Date()).toISOString()
  const cita = typeof e.comentario === 'string' && e.comentario.trim() ? e.comentario.trim().slice(0, 1000) : null
  const cambios: Cambio[] = []
  let completitud: ReturnType<typeof evaluarCompletitud> | null = null

  const r = await insertarVersion(db, e.client_id, (vigente) => {
    cambios.length = 0
    const contenido = objeto(vigente.content_text)
    const borrador: Fila = { ...objeto(contenido.brand_book_draft) }
    const meta: Fila = { ...objeto(borrador._field_meta) }
    const nueva = copiaSinIdentidad(vigente)
    for (const { campo, clave_del_tablero, texto } of elegidos) {
      const { borrador: bv, columna } = valoresNuevos(campo, texto)
      const anterior = comoTexto(campo.columna ? vigente[campo.columna] : null) ?? comoTexto(borrador[campo.clave]) ?? (campo.ruta ? comoTexto(borrador[campo.ruta]) : null)
      borrador[campo.clave] = bv
      if (campo.ruta && campo.ruta !== campo.clave) borrador[campo.ruta] = bv
      if (campo.columna) nueva[campo.columna] = columna
      meta[campo.clave] = { fuente: 'dueno', por: e.reviewer, en: ahora, valor_anterior: anterior, cita }
      cambios.push({ clave: campo.clave, clave_del_tablero, etiqueta: campo.etiqueta, valor: texto, valor_anterior: anterior })
    }
    borrador._field_meta = meta
    completitud = evaluarCompletitud(borrador, {})
    nueva.content_text = JSON.stringify({ ...contenido, brand_book_draft: borrador, completitud })
    nueva.version = Number(vigente.version) + 1
    nueva.auto_generated_from = 'edicion_del_dueno'
    nueva.provenance_tag = { ...objeto(vigente.provenance_tag), editado_por_dueno: { por: e.reviewer, en: ahora, campos: elegidos.map((x) => x.campo.clave) } }
    return nueva
  })
  if (!r.ok) return mal(r.sin_manual ? 404 : 502, r.sin_manual ? 'sin_manual' : 'no_se_pudo_guardar', r.error)
  const c = completitud as unknown as ReturnType<typeof evaluarCompletitud> | null
  return { ok: true, version_nueva: r.version, source_id: r.id, cambios: [...cambios], completo: c?.completo ?? false, huecos: c?.huecos.map((h) => h.clave) ?? [] }
}

export type ResultadoDeValidacion =
  | { ok: true; version_nueva: number | null; source_id: string; sin_cambios: boolean; aceptados: string[] }
  | { ok: false; status: number; error: string; detalle: string }

/** «Validar el manual»: la vigente pasa a validada por el dueño (nueva versión `max+1`; la anterior queda) */
export async function validarManualDelDueno(db: Db, e: { client_id: string; reviewer: string; ahora?: Date }): Promise<ResultadoDeValidacion> {
  if (!UUID.test(e.client_id)) return { ok: false, status: 400, error: 'entrada_invalida', detalle: 'falta el cliente' }
  const { fila, error } = await leerVigente(db, e.client_id)
  if (error) return { ok: false, status: 502, error: 'no_se_pudo_leer', detalle: `no pude leer el manual vigente: ${error}` }
  if (!fila) return { ok: false, status: 404, error: 'sin_manual', detalle: 'el cliente todavía no tiene manual' }
  if (quienValido(fila) === 'dueno') return { ok: true, version_nueva: null, source_id: String(fila.id), sin_cambios: true, aceptados: [] }
  const ahora = (e.ahora ?? new Date()).toISOString()
  const aceptados: string[] = []
  const r = await insertarVersion(db, e.client_id, (vigente) => {
    aceptados.length = 0
    const contenido = objeto(vigente.content_text)
    const borrador: Fila = { ...objeto(contenido.brand_book_draft) }
    const meta: Fila = { ...objeto(borrador._field_meta) }
    // lo que el dueño no escribió pero acepta queda como «aceptado por el dueño» (distinto de «escrito por el dueño»)
    for (const c of CAMPOS) {
      const m = objeto(meta[c.clave])
      const hayValor = (c.columna ? vigente[c.columna] != null && String(vigente[c.columna]).trim() !== '' : false) || borrador[c.clave] != null
      if (m.fuente === 'dueno' || !hayValor) continue
      meta[c.clave] = { ...m, aceptado_por_el_dueno: { por: e.reviewer, en: ahora } }
      aceptados.push(c.clave)
    }
    borrador._field_meta = meta
    const nueva = copiaSinIdentidad(vigente)
    nueva.content_text = JSON.stringify({ ...contenido, brand_book_draft: borrador })
    nueva.version = Number(vigente.version) + 1
    nueva.human_validated = true
    nueva.auto_generated_from = 'validacion_del_dueno'
    nueva.provenance_tag = { ...objeto(vigente.provenance_tag), validado_por: 'dueno', validado_en: ahora, validado_via: e.reviewer }
    return nueva
  })
  if (!r.ok) return { ok: false, status: r.sin_manual ? 404 : 502, error: r.sin_manual ? 'sin_manual' : 'no_se_pudo_guardar', detalle: r.error }
  return { ok: true, version_nueva: r.version, source_id: r.id, sin_cambios: false, aceptados: [...aceptados] }
}

/* ───────── el cerebro, después ───────── */

const recortar = (s: string, n: number): string => (s.length <= n ? s : `${s.slice(0, n - 1).trimEnd()}…`)

/** el cuerpo exacto que pide Cerebro para la puerta del dueño (§1): dato del manual por campo, SIN `acumula` (reemplaza al anterior del mismo campo) */
export function cuerpoParaElCerebro(x: { client_id: string; version: number; cambio: Cambio; reviewer: string; en: string }): Record<string, unknown> {
  return {
    evento: 'respuesta', client_id: x.client_id, tema: `manual · ${x.cambio.clave}`, pregunta: x.cambio.etiqueta, respuesta: recortar(x.cambio.valor, 2000),
    canal: CANAL_DEL_MANUAL, mensaje_ref: `manual:${x.client_id}:v${x.version}:${x.cambio.clave}`, respondido_en: x.en,
    preguntado_por: { oficina: 'dashboard', agente: 'emilio' },
    dry_run: false, workflow_id: FLUJO_DEL_DASHBOARD_MANUAL, workflow_execution_id: `dashboard:manual:${x.client_id}:v${x.version}`,
  }
}

export interface PendienteDelCerebro { clave: string; error: string }
export interface DepsDelCerebro { env: EntornoDeLaPuerta; fetchImpl?: typeof fetch; esperar?: (ms: number) => Promise<void>; enviar?: (env: EntornoDeLaPuerta, f: typeof fetch, cuerpo: Record<string, unknown>) => Promise<ResultadoDeEnvio> }

/** empuja cada campo cambiado a la puerta del dueño con reintento (3 intentos si el fallo es pasajero). Nunca lanza: lo que no entró vuelve como pendiente. */
export async function empujarCamposAlCerebro(d: DepsDelCerebro, x: { client_id: string; version: number; cambios: Cambio[]; reviewer: string; en: string }): Promise<{ enviados: string[]; pendientes: PendienteDelCerebro[] }> {
  const enviar = d.enviar ?? enviarALaPuerta
  const f = d.fetchImpl ?? fetch
  const esperar = d.esperar ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)))
  const enviados: string[] = []
  const pendientes: PendienteDelCerebro[] = []
  for (const cambio of x.cambios) {
    const cuerpo = cuerpoParaElCerebro({ client_id: x.client_id, version: x.version, cambio, reviewer: x.reviewer, en: x.en })
    let ultimo: ResultadoDeEnvio = { ok: false, permanente: false, error: 'sin intentar' }
    for (let i = 0; i < 3; i++) {
      ultimo = await enviar(d.env, f, cuerpo)
      if (ultimo.ok || ultimo.permanente) break
      if (i < 2) await esperar(i === 0 ? 400 : 1200)
    }
    if (ultimo.ok) enviados.push(cambio.clave)
    else pendientes.push({ clave: cambio.clave, error: ultimo.error })
  }
  return { enviados, pendientes }
}

/* ───────── lo que escribió el dueño no lo pisa una corrida posterior ───────── */

/**
 * «Declarado obliga»: una corrida del alta o del cimiento arma su borrador desde cero. Antes de guardarlo como versión nueva, los campos que el dueño escribió en la vigente
 * (`_field_meta.<campo>.fuente === 'dueno'`) se vuelven a poner —valor y procedencia— en el borrador nuevo. Todo lo demás de la corrida queda igual. Puro.
 */
export function conservarLoDelDueno(previa: Fila | null | undefined, bb: Fila): { bb: Fila; conservados: string[] } {
  if (!previa) return { bb, conservados: [] }
  const borradorPrevio = objeto(objeto(previa.content_text).brand_book_draft)
  const metaPrevia = objeto(borradorPrevio._field_meta)
  const conservados: string[] = []
  const nuevo: Fila = { ...bb }
  const meta: Fila = { ...objeto(bb._field_meta) }
  for (const c of CAMPOS) {
    const m = objeto(metaPrevia[c.clave])
    if (m.fuente !== 'dueno') continue
    const valor = borradorPrevio[c.clave] ?? (c.columna ? previa[c.columna] : undefined)
    if (valor == null || (typeof valor === 'string' && !valor.trim())) continue
    nuevo[c.clave] = valor
    if (c.ruta && c.ruta !== c.clave) nuevo[c.ruta] = valor
    meta[c.clave] = m
    conservados.push(c.clave)
  }
  if (!conservados.length) return { bb, conservados }
  nuevo._field_meta = meta
  return { bb: nuevo, conservados }
}
