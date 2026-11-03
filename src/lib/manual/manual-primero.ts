/**
 * MANUAL PRIMERO (firma de Emilio, 3-nov 14:46Z: la cadena espera a que apruebe el manual, y al aprobarlo se rehace el plan). Un plan no se firma antes de su manual.
 * Aprobado = validado por el dueño: una validación de la jefatura no cuenta. Un cliente sin manual no queda trabado: no habría nada que aprobar.
 */
import { quienValido } from './campos-del-manual'

type Fila = Record<string, unknown>
export interface BaseDelManual { from(tabla: string): any }
export type LecturaDelManual = { ok: true; espera: boolean } | { ok: false; error: string }

/** ¿el plan de este cliente debe esperar al manual? */
export async function planEsperaAlManual(db: BaseDelManual, client_id: string): Promise<LecturaDelManual> {
  const r = await db.from('client_brand_books').select('id, human_validated, provenance_tag').eq('client_id', client_id).order('version', { ascending: false }).limit(1)
  if (r.error) return { ok: false, error: String(r.error.message ?? r.error) }
  const vigente = ((r.data as Fila[] | null) ?? [])[0]
  return { ok: true, espera: !!vigente && quienValido(vigente) !== 'dueno' }
}

/**
 * Al aprobar el manual se pide un plan nuevo: lo que el plan anterior aún pedía firmar deja de contar, para que no se firme uno hecho con el manual de antes mientras llega el nuevo.
 * Solo cierra lo abierto; el plan no se borra. Nunca lanza: el manual ya quedó aprobado y el plan, pedido.
 */
export async function cerrarFirmasDelPlanAnterior(db: BaseDelManual, client_id: string, ahora: Date): Promise<{ ok: boolean; detalle?: string }> {
  const hora = ahora.toISOString()
  try {
    const a = await db.from('plan_aprobaciones').update({ estado: 'reemplazado', comentario: 'reemplazado al aprobar el manual', actualizado_en: hora }).eq('client_id', client_id).eq('estado', 'pendiente')
    const b = await db.from('hitl_queue').update({ status: 'rejected', resolved_by: 'manual-aprobado', resolved_at: hora, decided_at: hora, decision: { por: 'manual-aprobado', cuando: hora, motivo: 'reemplazado_al_aprobar_el_manual', vencida: true, decision: 'rejected' } }).eq('client_id', client_id).eq('documento', 'plan').eq('status', 'pending')
    const error = a.error ?? b.error
    return error ? { ok: false, detalle: String(error.message ?? error).slice(0, 200) } : { ok: true }
  } catch (e) {
    return { ok: false, detalle: e instanceof Error ? e.message.slice(0, 200) : 'error' }
  }
}
