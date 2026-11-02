/**
 * «PEDIR CAMBIOS AL MANUAL» · lo que no es de la puerta: qué campos del dueño libera un pedido y cómo lo lee el guardado.
 * Lo escrito o validado por el dueño no lo pisa una corrida (#832). En un pedido suyo, se liberan los campos de la sección pedida y los que nombra su texto.
 */
import { CAMPOS } from './campos-del-manual'

type Fila = Record<string, unknown>
const objeto = (x: unknown): Fila => (typeof x === 'object' && x !== null && !Array.isArray(x) ? (x as Fila) : {})
const normal = (t: string): string => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

/** los campos que el dueño escribió o validó por separado: son los que una corrida conserva */
export function camposDelDueno(meta: unknown): string[] {
  const m = objeto(meta)
  return CAMPOS.filter((c) => { const x = objeto(m[c.clave]); return x.fuente === 'dueno' || objeto(x.aceptado_por_el_dueno).campo === true }).map((c) => c.clave)
}

/** de los campos del dueño, los que este pedido libera: los de su sección y los que su texto nombra por la etiqueta. Nombrar solo libera: nunca limita */
export function camposQueLibera(a: { delDueno: string[]; texto: string; campos: string[] }): string[] {
  const texto = normal(a.texto)
  const nombrado = (clave: string): boolean => {
    const c = CAMPOS.find((x) => x.clave === clave)
    return !!c && new RegExp(`(^|[^\\p{L}])${normal(c.etiqueta)}($|[^\\p{L}])`, 'u').test(texto)
  }
  return a.delDueno.filter((k) => a.campos.includes(k) || nombrado(k))
}

/** el sello que la base pone a una versión nueva (ADR-012). Escribir la columna reemplaza ese valor: el pedido lo repite y agrega su marca. No hereda «validado»: el contenido cambió */
export const selloDeLaVersionPedida = (manual_cambio_id: string): Fila => ({ type: 'evidence', source: 'legacy_pre_adr012', trust_level: 'unknown', manual_cambio_id })

const comparable = (v: unknown): string => {
  if (v == null) return ''
  if (typeof v === 'string') return v.trim()
  if (Array.isArray(v)) return JSON.stringify(v.map(comparable).filter(Boolean))
  return JSON.stringify(v)
}
/** ¿la reescritura dejó todos los campos del manual como estaban? Entonces no hay versión nueva: costaría una reindexación del cerebro y no cambiaría nada. Solo mira los campos del manual, no sus marcas */
export function sinCambiosReales(contenidoPrevio: unknown, nuevo: Fila): boolean {
  let borrador: Fila = {}
  try {
    const c = typeof contenidoPrevio === 'string' ? (JSON.parse(contenidoPrevio) as unknown) : contenidoPrevio
    borrador = objeto(objeto(c).brand_book_draft)
  } catch { return false }
  if (!Object.keys(borrador).length) return false
  return CAMPOS.every((c) => comparable(borrador[c.clave]) === comparable(nuevo[c.clave]))
}

const textos = (x: unknown): string[] => (Array.isArray(x) ? x.filter((v): v is string => typeof v === 'string' && v.trim() !== '') : [])
export interface ResultadoDelPedido { sin_cambios: boolean; protegidos: string[]; tocados_validados: string[]; declarado: string[] }
/**
 * 02-nov · lo que dejó un pedido, para el pedido mismo: si no cambió nada no hay versión, y este es el único lugar donde el dueño puede leer por qué.
 * `tocados_validados`: los validados que el pedido parece tocar por sus palabras y no liberó: son los que el aviso nombra. `protegidos`: todos los validados que no se tocaron; nombraría campos que el dueño ni mencionó.
 * Solo claves reales del manual. Solo informa: no cambia texto ni estado.
 */
export function resultadoDelPedido(bb: Fila, sin_cambios: boolean): ResultadoDelPedido {
  const equipo = objeto(bb._equipo)
  const claves = new Set(CAMPOS.map((c) => c.clave))
  const campos = (x: unknown): string[] => [...new Set(textos(x))].filter((k) => claves.has(k))
  return { sin_cambios, protegidos: campos(equipo.protegidos), tocados_validados: campos(equipo.tocados_validados), declarado: textos(equipo.declarado).slice(0, 20).map((t) => t.slice(0, 300)) }
}

export interface PedidoDelManual { id: string; campos_liberados: string[]; creado_en: string; manual_nuevo_id: string | null }
export type LecturaDelPedido = { ok: true; pedido: PedidoDelManual } | { ok: false; status: number; error: string; detalle: string }

export async function leerPedidoDelManual(db: { from(t: string): any }, client_id: string, id: unknown): Promise<LecturaDelPedido> {
  if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id)) return { ok: false, status: 400, error: 'pedido_invalido', detalle: '`manual_cambio_id` debe ser un uuid' }
  const r = await db.from('plan_cambios').select('id, client_id, documento, campos_liberados, creado_en, manual_nuevo_id').eq('id', id).limit(1)
  if (r.error) return { ok: false, status: 500, error: 'pedido_no_leido', detalle: String(r.error.message ?? r.error).slice(0, 300) }
  const f = ((r.data as Fila[] | null) ?? [])[0]
  if (!f || f.documento !== 'manual' || f.client_id !== client_id) return { ok: false, status: 404, error: 'pedido_inexistente', detalle: 'no hay un pedido de cambios de este manual con ese id' }
  return { ok: true, pedido: { id, campos_liberados: Array.isArray(f.campos_liberados) ? (f.campos_liberados as string[]) : [], creado_en: String(f.creado_en), manual_nuevo_id: typeof f.manual_nuevo_id === 'string' ? f.manual_nuevo_id : null } }
}
