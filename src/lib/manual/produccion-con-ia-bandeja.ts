/**
 * ENCARGO 17 · 24-nov · «CÓMO SE PRODUCE CON IA» NACE SIN VIGENCIA (firma de Emilio: «un error ahí puede ser fatal»).
 *
 * La corrida ya NO inserta una versión del manual. Guarda un BORRADOR (`client_historical_outputs`) y una TARJETA en la
 * bandeja (`hitl_queue`), por el MISMO mecanismo de aprobación del manual que ya existe (la tarjeta de la revisión M2 y
 * la ruta `PATCH /api/hitl/[id]`): la mesa y el generador leen `client_brand_books` por versión máxima, así que un
 * borrador en la bandeja no llega a NINGUNA pieza. Solo cuando Emilio APRUEBA la tarjeta, `promoverProduccionConIa`
 * llama al escritor certificado (`escribirProduccionConIa`, #1275: copia exacta del vigente + la sección, nada más) y la
 * versión nueva nace firmada por esa aprobación. Al RECHAZAR, la nota queda en el borrador y no se escribe nada.
 *
 *  · el borrador se valida ANTES de guardarse con el propio escritor en seco (`dry_run: true`): topes y versión base;
 *  · idempotente: una tarjeta ya aprobada no vuelve a insertar versión (`ya_promovido`);
 *  · si la versión vigente cambió entre el borrador y la aprobación, no se pisa nada: se declara y el borrador queda.
 */
import { DIAS_DE_VIGENCIA_DE_LA_TARJETA } from './borrador'
import { escribirProduccionConIa, type ResultadoDeEscribir } from './produccion-con-ia'
import type { Db } from './revision'

type Fila = Record<string, unknown>
const txt = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')
const lista = (x: unknown): Fila[] => (Array.isArray(x) ? (x as Fila[]) : [])

export const TIPO_DE_BORRADOR_DE_LA_SECCION = 'produccion_con_ia_borrador'
export const TIPO_DE_BANDEJA_DE_LA_SECCION = 'produccion_con_ia_review'

export type ResultadoDelBorradorDeLaSeccion =
  | { ok: true; dry_run: boolean; output_id: string | null; hitl_id: string | null; version_base: number; sin_vigencia: true }
  | { ok: false; status: number; error: string; detalle: string }

/** guarda la sección como borrador + tarjeta (SIN tocar `client_brand_books`); con `dry_run: true` valida todo y no guarda nada */
export async function guardarBorradorDeLaSeccion(db: Db, e: { client_id: string; texto: string; version_base: number; dry_run: boolean; workflow_id?: string; workflow_execution_id?: string; ahora?: Date }): Promise<ResultadoDelBorradorDeLaSeccion> {
  // la validación es la del escritor certificado, en seco: topes del texto y versión vigente sin cambiar
  const valida = await escribirProduccionConIa(db, { client_id: e.client_id, texto: e.texto, version_base: e.version_base, dry_run: true, workflow_id: e.workflow_id, workflow_execution_id: e.workflow_execution_id })
  if (!valida.ok) return valida
  if (e.dry_run) return { ok: true, dry_run: true, output_id: null, hitl_id: null, version_base: e.version_base, sin_vigencia: true }

  const ahora = e.ahora ?? new Date()
  const texto = txt(e.texto)
  const contenido = JSON.stringify({ texto, version_base: e.version_base, workflow_id: e.workflow_id ?? null, workflow_execution_id: e.workflow_execution_id ?? null })
  const out = await db.from('client_historical_outputs').insert({
    client_id: e.client_id, title: `Manual · «Cómo se produce con IA» · borrador sobre la versión ${e.version_base}`, output_type: TIPO_DE_BORRADOR_DE_LA_SECCION,
    content: contenido, content_text: texto, producing_agent: 'manual · sección produccion_con_ia', status: 'draft',
    provenance_tag: { fuente: 'produccion_con_ia_borrador', version_base: e.version_base, workflow_id: e.workflow_id ?? null, workflow_execution_id: e.workflow_execution_id ?? null, en: ahora.toISOString() },
  }).select('id').single()
  if (out.error) return { ok: false, status: 502, error: 'borrador_fallido', detalle: out.error.message }
  const output_id = String((out.data as Fila).id)

  const hitl = await db.from('hitl_queue').insert({
    client_id: e.client_id, agent_name: 'manual · sección produccion_con_ia', risk_type: 'strategic_decision',
    output_preview: texto, type: TIPO_DE_BANDEJA_DE_LA_SECCION, // nada se recorta: Emilio lee ENTERO lo que aprueba
    title: `«Cómo se produce con IA» · aprobar para que entre al manual (versión base ${e.version_base})`,
    priority: 'medium', status: 'pending', payload: {}, metadata: { version_base: e.version_base, largo: texto.length }, output_id,
    expires_at: new Date(ahora.getTime() + DIAS_DE_VIGENCIA_DE_LA_TARJETA * 86_400_000).toISOString(),
  }).select('id').single()
  if (hitl.error) return { ok: false, status: 502, error: 'bandeja_fallida', detalle: `${hitl.error.message} (el borrador ${output_id} quedó escrito)` }
  return { ok: true, dry_run: false, output_id, hitl_id: String((hitl.data as Fila).id), version_base: e.version_base, sin_vigencia: true }
}

export type ResultadoDePromoverLaSeccion =
  | { ok: true; ya_promovido: true; version: null }
  | (ResultadoDeEscribir & { ok: true; aprobado_por: string })
  | { ok: false; status: number; error: string; detalle: string }

/** al APROBAR la tarjeta: la sección entra al manual por el escritor certificado (copia del vigente + sección) y el borrador queda `approved` */
export async function promoverProduccionConIa(db: Db, e: { output_id: string; client_id: string; aprobador: string; ahora?: Date }): Promise<ResultadoDePromoverLaSeccion> {
  const r = await db.from('client_historical_outputs').select('id, client_id, output_type, status, content').eq('id', e.output_id).limit(1)
  if (r.error) return { ok: false, status: 502, error: 'lectura_fallida', detalle: `borrador: ${r.error.message}` }
  const fila = lista(r.data)[0]
  if (!fila || fila.output_type !== TIPO_DE_BORRADOR_DE_LA_SECCION || String(fila.client_id) !== e.client_id) return { ok: false, status: 404, error: 'borrador_inexistente', detalle: 'no hay un borrador de la sección con ese id para ese cliente' }
  if (fila.status === 'approved') return { ok: true, ya_promovido: true, version: null }
  let contenido: { texto?: string; version_base?: number; workflow_id?: string | null; workflow_execution_id?: string | null }
  try { contenido = JSON.parse(String(fila.content)) } catch { return { ok: false, status: 409, error: 'borrador_ilegible', detalle: 'el contenido del borrador no es JSON' } }

  const esc = await escribirProduccionConIa(db, {
    client_id: e.client_id, texto: txt(contenido.texto), version_base: Number(contenido.version_base), dry_run: false,
    workflow_id: txt(contenido.workflow_id) || undefined, workflow_execution_id: txt(contenido.workflow_execution_id) || undefined, ahora: e.ahora,
  })
  if (!esc.ok) return esc

  // la versión ya nació: un fallo al marcar el borrador no la deshace (el rastro queda en la tarjeta aprobada de la bandeja)
  await db.from('client_historical_outputs').update({ status: 'approved' }).eq('id', e.output_id)
  return { ...esc, aprobado_por: e.aprobador }
}

/** al RECHAZAR: la nota queda en el borrador (status `rejected`); no se escribe nada en el manual */
export async function rechazarProduccionConIa(db: Db, e: { output_id: string; client_id: string; nota: string; rechazado_por: string; ahora?: Date }): Promise<{ ok: boolean; error?: string }> {
  const r = await db.from('client_historical_outputs').select('id, output_type, client_id, provenance_tag').eq('id', e.output_id).limit(1)
  if (r.error) return { ok: false, error: r.error.message }
  const fila = lista(r.data)[0]
  if (!fila || fila.output_type !== TIPO_DE_BORRADOR_DE_LA_SECCION || String(fila.client_id) !== e.client_id) return { ok: false, error: 'borrador_inexistente' }
  const pt = (fila.provenance_tag && typeof fila.provenance_tag === 'object' ? fila.provenance_tag : {}) as Fila
  const u = await db.from('client_historical_outputs').update({ status: 'rejected', provenance_tag: { ...pt, nota_de_rechazo: e.nota, rechazado_por: e.rechazado_por, rechazado_en: (e.ahora ?? new Date()).toISOString() } }).eq('id', e.output_id)
  return u.error ? { ok: false, error: u.error.message } : { ok: true }
}
