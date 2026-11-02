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
