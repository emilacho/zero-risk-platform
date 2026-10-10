/**
 * M2 · LA PROMOCIÓN. Al APROBAR la tarjeta `manual_de_marca_review` el borrador se vuelve la versión `max+1` VIGENTE de `client_brand_books`, firmada (`human_validated = true`);
 * al RECHAZAR, la nota queda en el borrador para la próxima corrida (nunca una edición a mano). La versión vieja queda; ninguna fila existente se edita.
 *
 *  · se promueve SOLO si la versión vigente sigue siendo la que se revisó (si entró otra mientras tanto, no se pisa: se dice y el borrador queda).
 *  · idempotente: un borrador ya aprobado no vuelve a insertar versión.
 *  · empuja el manual al cerebro (no se espera) con la misma función que usa el alta; el PDF a Drive NO se dispara desde aquí (ver el papel de entrega).
 */
import { buildBrandBookRow } from '../../app/api/brand-book/[clientId]/route'
import { empujarManualAlCerebro, type EmpujeEntrada, type EmpujeResultado } from '../brain/push-al-terminar'
import { TIPO_DE_BORRADOR } from './borrador'
import type { Db } from './revision'

type Fila = Record<string, unknown>
/** columnas de la versión anterior que el manual escrito por palabras no trae y deben seguir vigentes (los visuales vienen de la ficha, no se pierden) */
export const COLUMNAS_QUE_SE_HEREDAN = ['primary_colors', 'typography', 'imagery_style', 'logo_usage_notes']
export const PROVENANCE_DEL_MANUAL_REVISADO = { type: 'evidence', source: 'manual_revisado', trust_level: 'tenant_trusted' } as const

export type ResultadoDePromocion =
  | { ok: true; version: number; id: string; previous_id: string | null; brain_push: EmpujeResultado | null; ya_promovido?: false }
  | { ok: true; ya_promovido: true; version: null }
  | { ok: false; error: 'borrador_inexistente' | 'borrador_ilegible' | 'version_vigente_cambio' | 'lectura_fallida' | 'insercion_fallida'; detalle: string }

export interface EntradaDePromocion {
  output_id: string
  client_id: string
  aprobador: string
  frase_del_aprobador?: string | null
  empujar?: (e: EmpujeEntrada) => EmpujeResultado
  ahora?: Date
}

async function leerBorrador(db: Db, outputId: string, clientId: string): Promise<{ fila: Fila | null; error?: string }> {
  const r = await db.from('client_historical_outputs').select('id, client_id, output_type, status, content, provenance_tag').eq('id', outputId).limit(1)
  if (r.error) return { fila: null, error: r.error.message }
  const f = (Array.isArray(r.data) ? r.data : [])[0] as Fila | undefined
  if (!f || f.output_type !== TIPO_DE_BORRADOR || String(f.client_id) !== clientId) return { fila: null }
  return { fila: f }
}

export async function promoverManualRevisado(db: Db, e: EntradaDePromocion): Promise<ResultadoDePromocion> {
  const b = await leerBorrador(db, e.output_id, e.client_id)
  if (b.error) return { ok: false, error: 'lectura_fallida', detalle: `borrador: ${b.error}` }
  if (!b.fila) return { ok: false, error: 'borrador_inexistente', detalle: 'no hay un borrador de revisión de manual con ese id para ese cliente' }
  if (b.fila.status === 'approved') return { ok: true, ya_promovido: true, version: null }
  let contenido: { manual?: Fila; version_base?: number | null }
  try { contenido = JSON.parse(String(b.fila.content)) } catch { return { ok: false, error: 'borrador_ilegible', detalle: 'el contenido del borrador no es JSON' } }
  if (!contenido.manual || typeof contenido.manual !== 'object') return { ok: false, error: 'borrador_ilegible', detalle: 'el borrador no trae `manual`' }

  const prev = await db.from('client_brand_books').select('*').eq('client_id', e.client_id).order('version', { ascending: false }).limit(1)
  if (prev.error) return { ok: false, error: 'lectura_fallida', detalle: `client_brand_books: ${prev.error.message}` }
  const anterior = (Array.isArray(prev.data) ? prev.data : [])[0] as Fila | undefined
  const vigente = anterior ? Number(anterior.version) || 0 : 0
  if ((contenido.version_base ?? 0) !== vigente) return { ok: false, error: 'version_vigente_cambio', detalle: `se revisó la versión ${contenido.version_base ?? 'ninguna'} y la vigente ya es la ${vigente}; el borrador queda sin promover` }

  const ahora = (e.ahora ?? new Date()).toISOString()
  const version = vigente + 1
  const base = buildBrandBookRow(e.client_id, contenido.manual, { approved_by: e.aprobador, approved_at: ahora, source: 'revision_del_manual', gate_outcome: null, gate_nota: 'revisado por código y revisor externo; firmado por una persona', fidelity_passed: false }, version)
  const row: Fila = { ...base, human_validated: true, auto_generated_from: 'revision_del_manual', provenance_tag: PROVENANCE_DEL_MANUAL_REVISADO }
  const eslogan = typeof contenido.manual.tagline === 'string' && contenido.manual.tagline.trim() ? contenido.manual.tagline : (anterior?.tagline ?? null)
  if (eslogan) row.tagline = eslogan
  for (const c of COLUMNAS_QUE_SE_HEREDAN) if (row[c] == null && anterior?.[c] != null) row[c] = anterior[c]

  const ins = await db.from('client_brand_books').insert(row).select('id').single()
  if (ins.error) return { ok: false, error: 'insercion_fallida', detalle: ins.error.message }
  const id = String((ins.data as Fila).id)
  // marca el borrador como aprobado (si la base lo rechaza, la promoción ya ocurrió: no se deshace; el borrador aprobado dos veces no inserta de nuevo porque la versión base ya no es la vigente)
  await db.from('client_historical_outputs').update({ status: 'approved', provenance_tag: { ...((b.fila.provenance_tag as Fila | null) ?? {}), aprobado_por: e.aprobador, aprobado_en: ahora, frase_del_aprobador: e.frase_del_aprobador ?? null, version_promovida: version } }).eq('id', e.output_id)
  const brain_push = (e.empujar ?? empujarManualAlCerebro)({ client_id: e.client_id, source_id: id })
  return { ok: true, version, id, previous_id: anterior ? String(anterior.id) : null, brain_push }
}

/** rechazar: la nota queda en el borrador (auditoría y guía de la próxima corrida); no se edita ningún manual */
export async function guardarNotaDeRechazo(db: Db, o: { output_id: string; client_id: string; nota: string; rechazado_por: string; ahora?: Date }): Promise<{ ok: boolean; error?: string }> {
  const b = await leerBorrador(db, o.output_id, o.client_id)
  if (b.error) return { ok: false, error: b.error }
  if (!b.fila) return { ok: false, error: 'borrador_inexistente' }
  const u = await db.from('client_historical_outputs').update({ status: 'rejected', provenance_tag: { ...((b.fila.provenance_tag as Fila | null) ?? {}), nota_de_rechazo: o.nota, rechazado_por: o.rechazado_por, rechazado_en: (o.ahora ?? new Date()).toISOString() } }).eq('id', o.output_id)
  return u.error ? { ok: false, error: u.error.message } : { ok: true }
}
