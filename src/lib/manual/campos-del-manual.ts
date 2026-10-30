/**
 * LA DEFINICIÓN ÚNICA DE LOS CAMPOS DEL MANUAL (30-oct · «el manual sale solo» · E1 + N1 + N2).
 *
 * Antes, el nombre de cada campo vivía en siete sitios (lentes, consolidador, esquema del tool, `buildBrandBookRow`, el fragmentador del cerebro, el tablero, la propuesta del agente)
 * y no coincidían: el borrador los llama en español (`mision`), las columnas en inglés (`brand_mission`). Resultado medido el 27-ago: 6 columnas vacías pese a que el campo existía.
 * AQUÍ está cada campo UNA vez: su clave (la del borrador), su etiqueta, dónde se guarda (columna, o ruta dentro de `content_text.brand_book_draft` si no tiene columna),
 * si el dueño lo puede editar, si es obligatorio. Lo usan: `buildBrandBookRow` (columnas + cierre), la propuesta del agente, la validación de la jefatura, el fragmentador del cerebro
 * y —copiada con una prueba que compara— la pantalla del tablero. La prueba `campos-del-manual.test.ts` FALLA si un campo del borrador no tiene columna/ruta.
 *
 * PURO: sin IO. Ampliable: un campo nuevo es una fila de `CAMPOS`; un tipo de negocio nuevo, una fila de `REGLAS_POR_TIPO`.
 */
import { ROTULO_DE_PROPUESTA } from './propuesta'
import { detectInternalTerms } from '../brand-book-caveat-extractor'

export type TipoDeCampo = 'texto' | 'lista'

export interface CampoDelManual {
  /** la clave del borrador (español); es la misma que usan el cerebro (`tema: "manual · <clave>"`) y la propuesta del agente */
  clave: string
  etiqueta: string
  tipo: TipoDeCampo
  /** columna de `client_brand_books`; si no tiene, `ruta` (clave dentro de `content_text.brand_book_draft`) */
  columna?: string
  /** el tipo de la COLUMNA cuando difiere del del campo (la personalidad es una lista en el borrador y un texto, un rasgo por línea, en la columna; el eslogan: varias opciones, una columna de texto) */
  tipo_de_columna?: TipoDeCampo
  ruta?: string
  /** el dueño lo puede editar desde el tablero (los derivados no: salen de lo raspado) */
  editable: boolean
  /** obligatorio para todo negocio; los matices por tipo van en `REGLAS_POR_TIPO` */
  obligatorio: boolean
  /** la clave con la que lo nombra el tablero (B1), si es editable */
  clave_del_tablero?: string
}

export const CAMPOS: readonly CampoDelManual[] = [
  { clave: 'proposito', etiqueta: 'Propósito', tipo: 'texto', columna: 'brand_purpose', editable: true, obligatorio: true, clave_del_tablero: 'proposito' },
  { clave: 'mision', etiqueta: 'Misión', tipo: 'texto', columna: 'brand_mission', editable: true, obligatorio: true },
  { clave: 'vision', etiqueta: 'Visión', tipo: 'texto', columna: 'brand_vision', editable: true, obligatorio: true },
  { clave: 'valores', etiqueta: 'Valores', tipo: 'lista', columna: 'brand_values', editable: true, obligatorio: true, clave_del_tablero: 'valores' },
  { clave: 'tagline_opciones', etiqueta: 'Eslogan', tipo: 'lista', tipo_de_columna: 'texto', columna: 'tagline', editable: true, obligatorio: true, clave_del_tablero: 'eslogan' },
  { clave: 'voice_description', etiqueta: 'Voz', tipo: 'texto', columna: 'voice_description', editable: true, obligatorio: true, clave_del_tablero: 'voz' },
  { clave: 'personalidad', etiqueta: 'Personalidad', tipo: 'lista', tipo_de_columna: 'texto', columna: 'brand_personality', editable: true, obligatorio: true },
  { clave: 'positioning', etiqueta: 'Posicionamiento', tipo: 'texto', columna: 'positioning', editable: true, obligatorio: true, clave_del_tablero: 'posicionamiento' },
  { clave: 'icp_summary', etiqueta: 'Público', tipo: 'texto', ruta: 'icp_summary', editable: false, obligatorio: true, clave_del_tablero: 'publico' },
  { clave: 'mensajes_clave', etiqueta: 'Mensajes clave', tipo: 'lista', columna: 'key_messages', editable: true, obligatorio: true },
  { clave: 'propuestas_de_valor', etiqueta: 'Propuestas de valor', tipo: 'lista', columna: 'value_propositions', editable: true, obligatorio: true },
  { clave: 'productos', etiqueta: 'Productos o servicios', tipo: 'lista', ruta: 'productos', editable: true, obligatorio: true },
  { clave: 'sedes', etiqueta: 'Sedes', tipo: 'lista', ruta: 'sedes', editable: true, obligatorio: true },
  { clave: 'nunca_hace', etiqueta: 'Lo que nunca dice ni hace', tipo: 'lista', ruta: 'nunca_hace', editable: true, obligatorio: true, clave_del_tablero: 'nunca' },
  { clave: 'forbidden_words', etiqueta: 'Palabras que no usa', tipo: 'lista', columna: 'forbidden_words', editable: true, obligatorio: false },
  { clave: 'required_terminology', etiqueta: 'Palabras que sí usa', tipo: 'lista', columna: 'required_terminology', editable: true, obligatorio: false },
  { clave: 'customer_angle', etiqueta: 'Ángulo del cliente', tipo: 'texto', ruta: 'customer_angle', editable: false, obligatorio: false },
  { clave: 'retention_notes', etiqueta: 'Cómo se fideliza', tipo: 'texto', ruta: 'retention_notes', editable: false, obligatorio: false },
]

export const CAMPO_POR_CLAVE: Readonly<Record<string, CampoDelManual>> = Object.fromEntries(CAMPOS.map((c) => [c.clave, c]))

/**
 * Matices por tipo de negocio: DATO ampliable. `quita` = obligatorios que ese tipo no puede tener (un negocio solo en línea no tiene sedes);
 * `agrega` = campos extra que ese tipo exige. Un tipo que no está aquí usa la base.
 */
export const REGLAS_POR_TIPO: Readonly<Record<string, { quita?: readonly string[]; agrega?: readonly string[] }>> = {
  sin_local: { quita: ['sedes'] },
}

export function obligatoriosPara(tipo?: string | null): string[] {
  const r = tipo ? REGLAS_POR_TIPO[tipo] : undefined
  const base = CAMPOS.filter((c) => c.obligatorio).map((c) => c.clave).filter((c) => !(r?.quita ?? []).includes(c))
  return [...base, ...(r?.agrega ?? []).filter((c) => !base.includes(c))]
}

/* ───────── lectura del valor ───────── */

const texto = (v: unknown): string | null => {
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t ? t : null
}
const lista = (v: unknown): string[] | null => {
  const arr = Array.isArray(v) ? v : texto(v) ? [v as string] : []
  const out = arr.map((x) => String(x).trim()).filter((x) => x.length > 0)
  return out.length ? out : null
}
/** un valor «no es dato»: vacío, o PENDIENTE (lo que la puerta del manual deja cuando retira algo sin fuente) */
const esVacio = (v: unknown): boolean => {
  if (v == null) return true
  if (typeof v === 'string') return v.trim() === '' || /^PENDIENTE\b/i.test(v.trim())
  if (Array.isArray(v)) return v.length === 0 || v.every(esVacio)
  if (typeof v === 'object') return Object.keys(v as object).length === 0
  return false
}

/* ───────── columnas ───────── */

/** Rótulo del lema sin elegir (se conserva por si ninguna opción es declarada y se decide mostrarlas) */
export const LEMA_SIN_ELEGIR = 'Lemas propuestos · ninguno elegido todavía'

/** una opción de eslogan es una CITA pegada como lema («el cliente dice: …»): nunca va a la columna (regla D2 y condición 3 de Cerebro) */
export const esLemaCitado = (s: string): boolean => /^\s*(el cliente dice|la cliente dice|según el cliente|dice el cliente)\b/i.test(s) || /^\s*(dice|dijo)\s*:/i.test(s)

const MARCA_DECLARADA = /\[\s*(frase propia|lema propio|del cliente|verbatim|declarad[oa])[^\]]*\]/i

/**
 * El eslogan que SÍ va a la columna: solo una opción que el propio cliente declaró (lleva el rótulo «frase propia del cliente, verbatim…» que pone la lente)
 * y que no es una cita pegada. Las propuestas del agente NO van: elegir el lema de una marca no es traslado. Sin declarada ⇒ null (hueco declarado, no relleno).
 */
export function eslogan_declarado(opciones: unknown): string | null {
  const l = lista(opciones) ?? []
  const buenas = l.filter((o) => MARCA_DECLARADA.test(o) && !esLemaCitado(o))
  if (buenas.length !== 1) return null
  const limpio = buenas[0].replace(MARCA_DECLARADA, '').replace(/^[\s«"“]+|[\s»"”]+$/g, '').trim()
  return limpio || null
}

export interface ColumnasDelManual {
  readonly brand_purpose: string | null
  readonly brand_mission: string | null
  readonly brand_vision: string | null
  readonly brand_values: string[] | null
  readonly brand_personality: string | null
  readonly tagline: string | null
  readonly key_messages: string[] | null
  readonly value_propositions: string[] | null
}

/** columnas que esta definición escribe (las demás —voz, posicionamiento, palabras— ya las escribía `buildBrandBookRow`) */
export function columnasDelBorrador(bb: Record<string, unknown>, prosaLimpia: Record<string, string> = {}): ColumnasDelManual {
  const prosa = (campo: string, alterno?: string): string | null =>
    Object.prototype.hasOwnProperty.call(prosaLimpia, campo) ? texto(prosaLimpia[campo]) : texto(bb[campo]) ?? (alterno ? texto(bb[alterno]) : null)
  const personalidad = lista(bb.personalidad ?? bb.brand_personality)
  return {
    brand_purpose: prosa('proposito', 'brand_purpose'),
    brand_mission: prosa('mision', 'brand_mission'),
    brand_vision: prosa('vision', 'brand_vision'),
    brand_values: lista(bb.valores ?? bb.brand_values),
    // un rasgo por línea: la columna es de texto y el cerebro la indexa como texto
    brand_personality: personalidad ? personalidad.join('\n') : null,
    tagline: eslogan_declarado(bb.tagline_opciones ?? bb.tagline),
    key_messages: lista(bb.mensajes_clave ?? bb.key_messages),
    value_propositions: lista(bb.propuestas_de_valor ?? bb.value_propositions),
  }
}

/**
 * Identificadores internos que viajan pegados a las columnas de esta definición: SE DECLARAN, NO SE BORRAN (borrar a ciegas mutila la frase).
 * Medido el 05-sep: 3 de los 5 rasgos de personalidad de un manual real citan `discovery_summary` adentro; el detector solo miraba la prosa y varios de estos son listas.
 */
export function fugasDeLasColumnas(bb: Record<string, unknown>, prosaLimpia: Record<string, string> = {}): Record<string, string[]> {
  const out: Record<string, string[]> = {}
  for (const [columna, valor] of Object.entries(columnasDelBorrador(bb, prosaLimpia))) {
    if (valor == null) continue
    const terminos = detectInternalTerms(Array.isArray(valor) ? valor.join(' ') : valor)
    if (terminos.length) out[columna] = terminos
  }
  return out
}

/* ───────── N2 · el cierre: completo, o con sus huecos a la vista ───────── */

export type EstadoDelCampo = 'lleno' | 'propuesta' | 'hueco'

const tieneRotuloDePropuesta = (v: unknown): boolean => JSON.stringify(v ?? '').includes(`[${ROTULO_DE_PROPUESTA}`)

/** lleno = hay dato (incluye lo observado en lo raspado); propuesta = lo escribió un agente y lo dice; hueco = nada (o PENDIENTE) */
export function estadoDelCampo(valor: unknown): EstadoDelCampo {
  if (esVacio(valor)) return 'hueco'
  return tieneRotuloDePropuesta(valor) ? 'propuesta' : 'lleno'
}

export interface Completitud {
  completo: boolean
  tipo: string | null
  llenos: string[]
  propuestos: string[]
  /** cada hueco dice qué se buscó: nunca se rellena */
  huecos: Array<{ clave: string; etiqueta: string; nota: string }>
  visual: { estado: string | null; tipografia: 'con_letra' | 'sin_letra_observada' | 'no_aplica' }
}

const tipografiasDelBorrador = (bb: Record<string, unknown>): unknown[] => {
  const v = (bb.visual ?? {}) as Record<string, unknown>
  const capa = (v.capa_grafica ?? {}) as Record<string, unknown>
  const a = Array.isArray(capa.tipografias) ? capa.tipografias : []
  const b = Array.isArray(bb.typography) ? (bb.typography as unknown[]) : []
  return [...a, ...b]
}

/**
 * El cierre del manual (N2): «completo» = cada obligatorio lleno, o propuesto por un agente y dicho, o hueco declarado con lo que se buscó.
 * Un manual con huecos NO es completo (`completo: false`) aunque la vara de fidelidad haya pasado: la vara mide hechos, esto mide cobertura.
 * `visual` «completo» con tipografía vacía dice «sin letra observada» (no «completo» a secas).
 */
export function evaluarCompletitud(bb: Record<string, unknown>, opciones: { tipo?: string | null; buscadoEn?: readonly string[] } = {}): Completitud {
  const llenos: string[] = []
  const propuestos: string[] = []
  const huecos: Completitud['huecos'] = []
  const donde = opciones.buscadoEn?.length ? opciones.buscadoEn.join(', ') : 'lo raspado del sitio, las redes y los mapas'
  for (const clave of obligatoriosPara(opciones.tipo)) {
    const campo = CAMPO_POR_CLAVE[clave]
    const e = estadoDelCampo(bb[clave])
    if (e === 'lleno') llenos.push(clave)
    else if (e === 'propuesta') propuestos.push(clave)
    else huecos.push({ clave, etiqueta: campo?.etiqueta ?? clave, nota: `sin dato: busqué en ${donde}` })
  }
  const visual = (bb.visual ?? null) as Record<string, unknown> | null
  const estadoVisual = visual && typeof visual.estado === 'string' ? visual.estado : null
  const tipografia: Completitud['visual']['tipografia'] = !visual ? 'no_aplica' : tipografiasDelBorrador(bb).some((t) => !esVacio(t)) ? 'con_letra' : 'sin_letra_observada'
  return { completo: huecos.length === 0, tipo: opciones.tipo ?? null, llenos, propuestos, huecos, visual: { estado: estadoVisual, tipografia } }
}

/** lo que el tablero escribe junto a «completo» en la capa visual */
export const rotuloVisual = (v: Completitud['visual']): string | null =>
  v.estado === 'completo' && v.tipografia === 'sin_letra_observada' ? 'completo · sin letra observada' : v.estado

/* ───────── quién validó ───────── */

export type QuienValido = 'jefatura' | 'dueno' | 'propuesta'

/** «validado por la jefatura» / «validado por el dueño» / «propuesta sin validar». Un manual firmado antes de este ciclo (sin `validado_por`) cuenta como del dueño: solo él firmaba. */
export function quienValido(fila: { human_validated?: unknown; provenance_tag?: unknown }): QuienValido {
  if (fila.human_validated !== true) return 'propuesta'
  const p = (fila.provenance_tag ?? {}) as Record<string, unknown>
  return p.validado_por === 'jefatura' ? 'jefatura' : 'dueno'
}
