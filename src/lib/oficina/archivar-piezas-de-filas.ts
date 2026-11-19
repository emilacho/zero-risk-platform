/**
 * 19-nov · LA PIEZA VIEJA DE UNA FILA QUE VOLVIÓ AL BRIEF SE ARCHIVA SOLA (#1195 · decisión A de Lenovo 01:16Z · 🔴 de CC7 00:57Z · cuidados de CC3 00:59Z) · CC1 · US$ 0.
 * Cuando una idea del banco se retira (o se corrige) y una fila con brief vuelve a `lista_para_brief`, su pieza vieja seguía esperando a Emilio en la bandeja,
 * con la idea que él quitó, mientras salía una segunda con la nueva. Esta función la archiva con la MISMA marca que el archivo de una pieza suelta
 * (`archivada_en` + `archivo_motivo` en la bandeja y en su encargo): no borra nada y se deshace con `desarchivarPieza`.
 *   · SOLO una pieza `pending` (esperando a Emilio). Aprobada, rechazada, con cambios pedidos o vencida = ya la decidió él: NO se toca, se declara.
 *   · la escritura es condicional (`status = pending` y sin archivar): si Emilio decide en el mismo instante, gana él y se declara.
 *   · lo que no se puede leer NO se archiva y se dice (`ok: false` con el motivo, o `bandeja_no_encontrada` por pieza). NUNCA lanza.
 *   · repetirla no cambia nada (lo ya archivado se cuenta como `ya_archivadas`).
 *   · un encargo todavía sin pieza en la bandeja no se toca: se declara (`sin_pieza_todavia`).
 * Solo `src/lib/oficina/` nombra las tablas `oficina_*`. Agnóstico: ningún dato de un cliente.
 */
import { FAMILIAS_QUE_NO_SON_PIEZAS } from './piezas-por-publicar'

interface Lectura { data: unknown; error: { message: string } | null }
interface Consulta extends PromiseLike<Lectura> {
  select(c?: string): Consulta
  eq(c: string, v: unknown): Consulta
  in(c: string, v: unknown[]): Consulta
  is(c: string, v: unknown): Consulta
  update(p: Record<string, unknown>): Consulta
}
export type Db = { from(tabla: string): Consulta }

/** los encargos que terminaron así sin bandeja nunca produjeron pieza: no hay nada que archivar ni que declarar */
const NUNCA_PRODUJO = new Set(['fallido', 'cerrado_por_tope'])

export interface PiezaArchivada { fila_id: string; hitl_id: string; encargo_ids: string[] }
export type MotivoNoArchivada = 'decidida_por_emilio' | 'emilio_decidio_al_mismo_tiempo' | 'sin_pieza_todavia' | 'bandeja_no_encontrada'
export interface PiezaNoArchivada { fila_id: string; hitl_id: string | null; encargo_id: string; motivo: MotivoNoArchivada; estado?: string }
export type ResultadoDelArchivoDeFilas =
  | { ok: true; archivadas: PiezaArchivada[]; ya_archivadas: string[]; no_archivadas: PiezaNoArchivada[] }
  | { ok: false; motivo: string }

const objeto = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {})
const filasDe = (r: Lectura): Record<string, unknown>[] => (Array.isArray(r.data) ? (r.data as Record<string, unknown>[]) : [])
const fallo = (que: string, e: unknown) => ({ ok: false as const, motivo: `${que}: ${e instanceof Error ? e.message : String((e as { message?: unknown })?.message ?? e)}`.slice(0, 300) })

/**
 * Archiva las piezas PENDIENTES de esas filas, dentro de los partes de UNA campaña (`parte_ids`: los partes de la campaña, así no se toca otra).
 * `motivo` queda escrito en la pieza y en su encargo (p. ej. «reemplazada: la idea «C1-I16» se retiró del banco»).
 */
export async function archivarPiezasDeFilas(db: Db, p: { parte_ids: readonly string[]; fila_ids: readonly string[]; motivo: string }, ahora: Date = new Date()): Promise<ResultadoDelArchivoDeFilas> {
  const filas = new Set(p.fila_ids)
  const motivo = p.motivo.trim()
  if (!filas.size || !p.parte_ids.length) return { ok: true, archivadas: [], ya_archivadas: [], no_archivadas: [] }
  if (!motivo) return { ok: false, motivo: 'falta el motivo del archivo' }
  try {
    const re = await db.from('oficina_encargos').select('id, familia, estado, hitl_queue_id, fila:sala_ref->fila').eq('dry_run', false).eq('prueba', false).in('parte_id', [...new Set(p.parte_ids)])
    if (re.error) return { ok: false, motivo: `no se pudieron leer los encargos: ${re.error.message}` }
    const encargos = filasDe(re)
      .filter((e) => !FAMILIAS_QUE_NO_SON_PIEZAS.has(String(e.familia)))
      .map((e) => ({ id: String(e.id), estado: String(e.estado ?? ''), hitl: typeof e.hitl_queue_id === 'string' && e.hitl_queue_id !== '' ? e.hitl_queue_id : null, fila: objeto(e.fila).id }))
      .filter((e): e is { id: string; estado: string; hitl: string | null; fila: string } => typeof e.fila === 'string' && filas.has(e.fila))

    const no_archivadas: PiezaNoArchivada[] = []
    const porPieza = new Map<string, { fila_id: string; encargo_ids: string[] }>()
    for (const e of encargos) {
      if (!e.hitl) { if (!NUNCA_PRODUJO.has(e.estado)) no_archivadas.push({ fila_id: e.fila, hitl_id: null, encargo_id: e.id, motivo: 'sin_pieza_todavia', estado: e.estado }); continue }
      const x = porPieza.get(e.hitl) ?? { fila_id: e.fila, encargo_ids: [] }
      x.encargo_ids.push(e.id)
      porPieza.set(e.hitl, x)
    }
    if (!porPieza.size) return { ok: true, archivadas: [], ya_archivadas: [], no_archivadas }

    const rb = await db.from('hitl_queue').select('id, status, archivada_en').in('id', [...porPieza.keys()])
    if (rb.error) return { ok: false, motivo: `no se pudo leer la bandeja: ${rb.error.message}` }
    const bandeja = new Map(filasDe(rb).map((b) => [String(b.id), b]))

    const hora = ahora.toISOString()
    const archivadas: PiezaArchivada[] = []
    const ya_archivadas: string[] = []
    for (const [hitl, x] of porPieza) {
      const b = bandeja.get(hitl)
      const base = { fila_id: x.fila_id, hitl_id: hitl, encargo_id: x.encargo_ids[0] }
      if (!b) { no_archivadas.push({ ...base, motivo: 'bandeja_no_encontrada' }); continue }
      if (b.archivada_en) {
        // un corte anterior pudo archivar la pieza y no su encargo: se completa (la marca ya está puesta: nunca se pisa la hora de otro archivo)
        const ue = await db.from('oficina_encargos').update({ archivada_en: b.archivada_en, archivo_motivo: motivo }).in('id', x.encargo_ids).is('archivada_en', null)
        if (ue.error) return { ok: false, motivo: `no se pudo completar el encargo de la pieza ${hitl}: ${ue.error.message}` }
        ya_archivadas.push(hitl)
        continue
      }
      if (b.status !== 'pending') { no_archivadas.push({ ...base, motivo: 'decidida_por_emilio', estado: String(b.status) }); continue }
      // condicional: si Emilio la decidió entre la lectura y aquí, no se escribe nada y gana él
      const up = await db.from('hitl_queue').update({ archivada_en: hora, archivo_motivo: motivo }).eq('id', hitl).eq('status', 'pending').is('archivada_en', null).select('id')
      if (up.error) return { ok: false, motivo: `no se pudo archivar la pieza ${hitl}: ${up.error.message}` }
      if (!filasDe(up).length) { no_archivadas.push({ ...base, motivo: 'emilio_decidio_al_mismo_tiempo' }); continue }
      const ue = await db.from('oficina_encargos').update({ archivada_en: hora, archivo_motivo: motivo }).in('id', x.encargo_ids).is('archivada_en', null)
      if (ue.error) return { ok: false, motivo: `la pieza ${hitl} quedó archivada, pero no su encargo: ${ue.error.message}` }
      archivadas.push({ fila_id: x.fila_id, hitl_id: hitl, encargo_ids: x.encargo_ids })
    }
    return { ok: true, archivadas, ya_archivadas, no_archivadas }
  } catch (e) {
    return fallo('la oficina no contestó', e)
  }
}
