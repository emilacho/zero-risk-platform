import { validacionDelManual, versionVigente } from '../manual/campos-del-manual'

/**
 * EL ESTADO DEL MANUAL VIGENTE (30-oct) · solo lectura de `client_brand_books`: ¿lo validó el dueño, la jefatura o es una propuesta del sistema sin validar?, ¿qué versión?, ¿de cuándo?
 * Lo muestran el resumen vivo y `GET /api/brain/consultar` para que la mesa sepa cuánto pesa lo que lee del manual. No escribe nada y no llama a ningún modelo (US$ 0).
 * El vigente es la versión de mayor número; las anteriores se conservan pero no cuentan.
 */
type Fila = Record<string, unknown>
interface Db { from: (t: string) => any }

export type EstadoDelManual = 'validado_por_el_dueno' | 'validado_por_la_jefatura' | 'propuesta_sin_validar' | 'sin_manual'
export interface ManualVigente { estado: EstadoDelManual; version: number | null; fecha: string | null; texto: string }

const dia = (x: unknown): string | null => (typeof x === 'string' && x.length >= 10 ? x.slice(0, 10) : null)

/** puro: del conjunto de versiones del manual, el estado de la vigente */
export function estadoDelManual(filas: Fila[]): ManualVigente {
  const vigente = versionVigente(filas)
  const vig = vigente ? { f: vigente, v: Number(vigente.version) || 0 } : null
  if (!vig) return { estado: 'sin_manual', version: null, fecha: null, texto: 'Manual de marca: el cliente todavía no tiene manual.' }
  const fecha = dia(vig.f.validated_at) ?? dia(vig.f.created_at)
  // la etiqueta sale de QUIÉN validó de verdad (`provenance_tag.validado_por`), no de que alguien lo haya marcado: antes decía «dueño» ante cualquier human_validated
  const { quien } = validacionDelManual(vig.f)
  if (quien === 'jefatura') return { estado: 'validado_por_la_jefatura', version: vig.v, fecha, texto: `Manual de marca: validado por la jefatura (versión ${vig.v}${fecha ? `, ${fecha}` : ''}).` }
  if (quien === 'dueno') return { estado: 'validado_por_el_dueno', version: vig.v, fecha, texto: `Manual de marca: validado por el dueño (versión ${vig.v}${fecha ? `, ${fecha}` : ''}).` }
  return { estado: 'propuesta_sin_validar', version: vig.v, fecha, texto: `Manual de marca: propuesta del sistema, sin validar por el dueño (versión ${vig.v}${fecha ? `, ${fecha}` : ''}).` }
}

/** lee el estado del manual vigente; si no se puede leer se dice (no se inventa un estado) */
export async function leerEstadoDelManual(db: Db, clientId: string): Promise<ManualVigente | { estado: 'no_se_pudo_leer'; detalle: string }> {
  try {
    const q = await db.from('client_brand_books').select('id, version, human_validated, created_at, provenance_tag').eq('client_id', clientId).order('version', { ascending: false }).limit(1)
    if (q.error) return { estado: 'no_se_pudo_leer', detalle: `client_brand_books: ${String(q.error.message).slice(0, 120)}` }
    return estadoDelManual(Array.isArray(q.data) ? (q.data as Fila[]) : [])
  } catch (e) {
    return { estado: 'no_se_pudo_leer', detalle: `client_brand_books: ${e instanceof Error ? e.message.slice(0, 120) : 'error'}` }
  }
}
