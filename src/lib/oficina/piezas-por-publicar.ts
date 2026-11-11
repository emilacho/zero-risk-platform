/**
 * COLATERALES 2d · la GUARDA MÍNIMA · ¿hay piezas por publicar que dependen del documento editado? (CC1 · certifican CC7 y CC6).
 * Regla (A) aceptada por CC6 (RESPUESTA regla-A, 11-nov) con sus 4 condiciones · hoy NINGÚN registro dice que una pieza salió (la publicación es a mano):
 *   · por publicar = producida o en producción, sin descartar, y su pieza espera al dueño (pendiente o con cambios pedidos), o está APROBADA y su FECHA DE
 *     PUBLICACIÓN todavía no pasó. La fecha es la de la FILA DEL CALENDARIO que el encargo guarda (`sala_ref.fila.fecha`), NUNCA `expires_at` de la bandeja
 *     (nota de CC6: ese puede venir del «aprobar antes de» del brief, que no es publicar). «Pasó» = el día de la fila a las 00:00 UTC + 48 h (lado seguro:
 *     cubre el final de ese día en cualquier zona y la hora de la fila; una pieza de hoy frena);
 *   · aprobada con la fecha ya pasada = SE ASUME PUBLICADA: no frena y se DECLARA (nunca se calla que es una suposición);
 *   · límite declarado: la fila es la COPIA que el encargo guardó al producirse; si alguien movió esa fila del calendario después, no se ve aquí;
 *   · lo que no se sabe FRENA: aprobada sin fecha, fecha ilegible, encargo producido sin fila en la bandeja, bandeja no encontrada, estado desconocido;
 *   · no frena: rechazada o vencida en la bandeja, bandeja o encargo archivados, encargo que nunca produjo (fallido / cerrado por tope SIN bandeja);
 *   · las MESAS de la cadena (brief, gran idea, reubicación) viven en la misma tabla pero NO son piezas: no cuentan;
 *   · solo encargos REALES (ni ensayo ni prueba);
 *   · campaña: el encargo llega a ella por su PARTE (no tiene campana_id). Si el parte no se ubica en ninguna campaña, cuenta como de ESTA (frena), nunca de otra;
 *   · un error al leer se LANZA (quien llama frena): nunca se lee como «cero piezas».
 * El día que exista un registro de publicación, se cambia SOLO `clasificarPieza` (CC6 · «una sola función»).
 * Solo `src/lib/oficina/` nombra las tablas `oficina_*`. Agnóstico: ningún dato de un cliente.
 */
import { FAMILIA_DE } from './mesa/de-la-cadena'

export type Db = { from(tabla: string): any }
const objeto = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {})

/** las familias que son MESAS de la cadena (no piezas) · la misma lista que usa la oficina */
export const FAMILIAS_QUE_NO_SON_PIEZAS: ReadonlySet<string> = new Set(Object.values(FAMILIA_DE))
/** desde las 00:00 UTC del día de la fila: cubre el final de ese día en cualquier zona horaria (UTC-12 termina a las 12:00 UTC del día siguiente) y su hora */
export const MARGEN_DE_PUBLICACION_MS = 48 * 60 * 60 * 1000
/** un encargo que terminó así y NUNCA dejó fila en la bandeja no produjo nada que publicar */
const NUNCA_PRODUJO = new Set(['fallido', 'cerrado_por_tope'])

export type MotivoQueFrena = 'espera_al_dueno' | 'aprobada_fecha_futura' | 'aprobada_sin_fecha' | 'fecha_ilegible' | 'sin_bandeja' | 'bandeja_no_encontrada' | 'estado_desconocido'
export type MotivoQueNoFrena = 'descartada' | 'archivada' | 'nunca_produjo' | 'se_asume_publicada'
export type Veredicto = { frena: true; motivo: MotivoQueFrena } | { frena: false; motivo: MotivoQueNoFrena; publicada_en?: string }

export interface EncargoLeido { id: string; parte_id: string | null; brief_id: string | null; familia: string | null; estado: string; hitl_queue_id: string | null; sala_ref: unknown }
export interface BandejaLeida { id: string; status: string; archivada_en: string | null }

/** la fecha de la FILA DEL CALENDARIO que el encargo guardó (`sala_ref.fila.fecha`, AAAA-MM-DD) · null si no hay fila · 'ilegible' si no es una fecha */
export function fechaDeLaFila(salaRef: unknown): string | null | 'ilegible' {
  const fila = objeto(objeto(salaRef).fila)
  if (!('fecha' in fila)) return null
  const f = fila.fecha
  if (typeof f !== 'string' || !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(f) || !Number.isFinite(Date.parse(f + 'T00:00:00Z'))) return 'ilegible'
  return f
}

/** LA regla (una sola función) · encargo (con su fila del calendario) + su fila de bandeja (undefined = no se encontró) */
export function clasificarPieza(e: Pick<EncargoLeido, 'estado' | 'hitl_queue_id' | 'sala_ref'>, b: BandejaLeida | undefined, ahora: Date): Veredicto {
  if (!e.hitl_queue_id) return NUNCA_PRODUJO.has(e.estado) ? { frena: false, motivo: 'nunca_produjo' } : { frena: true, motivo: 'sin_bandeja' }
  if (!b) return { frena: true, motivo: 'bandeja_no_encontrada' }
  if (b.archivada_en) return { frena: false, motivo: 'archivada' }
  if (b.status === 'rejected' || b.status === 'expired') return { frena: false, motivo: 'descartada' }
  if (b.status === 'pending' || b.status === 'edited') return { frena: true, motivo: 'espera_al_dueno' }
  if (b.status !== 'approved') return { frena: true, motivo: 'estado_desconocido' }
  const fecha = fechaDeLaFila(e.sala_ref)
  if (fecha === null) return { frena: true, motivo: 'aprobada_sin_fecha' }
  if (fecha === 'ilegible') return { frena: true, motivo: 'fecha_ilegible' }
  return Date.parse(fecha + 'T00:00:00Z') + MARGEN_DE_PUBLICACION_MS > ahora.getTime() ? { frena: true, motivo: 'aprobada_fecha_futura' } : { frena: false, motivo: 'se_asume_publicada', publicada_en: fecha }
}

export interface PiezaQueFrena { encargo_id: string; brief_id: string | null; motivo: MotivoQueFrena; parte_sin_campana?: true }
export interface PiezaQueSeAsume { encargo_id: string; brief_id: string | null; publicada_en: string }
export interface ResultadoDeLaGuarda { frenan: PiezaQueFrena[]; se_asumen_publicadas: PiezaQueSeAsume[] }

function ok<T>(r: { data: T; error: { message: string } | null }, que: string): T {
  if (r.error) throw new Error(`${que}: ${r.error.message}`)
  return r.data
}

/**
 * Las piezas por publicar del cliente. `campana_id` null = el documento es del cliente (manual, plan): cuentan todas sus campañas.
 * Con `campana_id`, solo las de esa campaña (por su parte) y las que no se pueden ubicar.
 */
export async function piezasPorPublicar(db: Db, p: { client_id: string; campana_id: string | null }, ahora: Date): Promise<ResultadoDeLaGuarda> {
  const encargos = ((ok(await db.from('oficina_encargos').select('id, parte_id, brief_id, familia, estado, hitl_queue_id, sala_ref').eq('client_id', p.client_id).eq('dry_run', false).eq('prueba', false).is('archivada_en', null), 'leer los encargos') as EncargoLeido[] | null) ?? [])
    .filter((e) => !FAMILIAS_QUE_NO_SON_PIEZAS.has(String(e.familia)))
  if (!encargos.length) return { frenan: [], se_asumen_publicadas: [] }

  // la campaña de cada encargo, por su parte (solo hace falta si el documento es de una campaña)
  let deEstaCampana: (e: EncargoLeido) => { cuenta: boolean; sin_campana: boolean } = () => ({ cuenta: true, sin_campana: false })
  if (p.campana_id !== null) {
    const partes = [...new Set(encargos.map((e) => e.parte_id).filter((x): x is string => typeof x === 'string' && x !== ''))]
    const filas = partes.length ? ((ok(await db.from('client_historical_outputs').select('id, provenance_tag').in('id', partes), 'leer los partes') as { id: string; provenance_tag: unknown }[] | null) ?? []) : []
    const campanaDe = new Map(filas.map((f) => [String(f.id), objeto(f.provenance_tag).campana_id]))
    deEstaCampana = (e) => {
      const c = e.parte_id ? campanaDe.get(e.parte_id) : undefined
      if (typeof c !== 'string' || c === '') return { cuenta: true, sin_campana: true } // no se ubica: cuenta como de ESTA (frena)
      return { cuenta: c === p.campana_id, sin_campana: false }
    }
  }
  const delAlcance = encargos.map((e) => ({ e, a: deEstaCampana(e) })).filter((x) => x.a.cuenta)
  if (!delAlcance.length) return { frenan: [], se_asumen_publicadas: [] }

  const ids = [...new Set(delAlcance.map((x) => x.e.hitl_queue_id).filter((x): x is string => typeof x === 'string' && x !== ''))]
  const bandeja = ids.length ? ((ok(await db.from('hitl_queue').select('id, status, archivada_en').in('id', ids), 'leer la bandeja') as BandejaLeida[] | null) ?? []) : []
  const porId = new Map(bandeja.map((b) => [String(b.id), b]))

  const r: ResultadoDeLaGuarda = { frenan: [], se_asumen_publicadas: [] }
  for (const { e, a } of delAlcance) {
    const v = clasificarPieza(e, e.hitl_queue_id ? porId.get(e.hitl_queue_id) : undefined, ahora)
    if (v.frena) r.frenan.push({ encargo_id: e.id, brief_id: e.brief_id, motivo: v.motivo, ...(a.sin_campana ? { parte_sin_campana: true as const } : {}) })
    else if (v.motivo === 'se_asume_publicada') r.se_asumen_publicadas.push({ encargo_id: e.id, brief_id: e.brief_id, publicada_en: v.publicada_en as string })
  }
  return r
}

/** la nota de la edición: lo que frena y lo que SE ASUME (condición 1 de CC6: la suposición queda escrita, con la pieza y la fecha) */
export function notaDeLaGuarda(r: ResultadoDeLaGuarda): string | null {
  const partes: string[] = []
  if (r.frenan.length) partes.push(`hay ${r.frenan.length} pieza(s) por publicar que dependen de este documento: ${r.frenan.map((x) => `${x.brief_id ?? x.encargo_id} (${x.motivo}${x.parte_sin_campana ? ', parte sin campaña' : ''})`).join(', ')}`)
  if (r.se_asumen_publicadas.length) partes.push(`se asume publicada por fecha: ${r.se_asumen_publicadas.map((x) => `${x.brief_id ?? x.encargo_id} (${x.publicada_en})`).join(', ')}`)
  return partes.length ? partes.join(' · ') : null
}
