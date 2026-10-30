/**
 * REGLA ESTRUCTURAL «SUPERADA» (30-oct · ADENDA 3, firmada por Emilio): cuando una versión nueva de una pieza llega a la bandeja, la versión anterior de la MISMA pieza
 * (mismo cliente, mismo parte_id y brief_id) que siga `pending` se retira sola. Vale para cualquier cliente y cualquier vía (mesa, «Pedir cambios», re-revisar, rehacer): todas pasan por `bandeja`.
 * No es una decisión del dueño: 0 notas_del_dueno y 0 eventos_de_emilio. `hitl_queue.status` solo admite pending/approved/rejected/edited → se marca `rejected` con `decision.superada`
 * (visible en «Todas»; reversible). Una pieza ya decidida (approved/edited/rejected) no se toca. Nunca lanza: un fallo aquí jamás frena la entrega.
 */
type Fila = Record<string, unknown>
type Db = { from(t: string): any }

export const RETIRADOR_DE_SUPERADAS = 'oficina-superada'

export async function retirarLasSuperadas(db: Db, nueva: { hitl_id: string; client_id: string; metadata: Record<string, unknown> }, ahora: () => Date = () => new Date()): Promise<{ retiradas: string[] }> {
  try {
    const parte = nueva.metadata.parte_id, brief = nueva.metadata.brief_id
    if (typeof parte !== 'string' || typeof brief !== 'string' || !parte || !brief) return { retiradas: [] }
    const r = (await db.from('hitl_queue').select('id, metadata').eq('client_id', nueva.client_id).eq('type', 'content_piece_review').eq('status', 'pending').eq('metadata->>parte_id', parte).eq('metadata->>brief_id', brief)) as { data: Fila[] | null; error: unknown }
    if (r.error || !r.data) return { retiradas: [] }
    const hora = ahora().toISOString()
    const retiradas: string[] = []
    for (const f of r.data) {
      const id = String(f.id)
      if (id === nueva.hitl_id) continue
      const m = f.metadata as Fila | null
      if (!m || m.parte_id !== parte || m.brief_id !== brief) continue // el filtro de la base ya lo hace; esto es el cinturón
      const u = (await db.from('hitl_queue').update({ status: 'rejected', reviewer: RETIRADOR_DE_SUPERADAS, resolved_by: RETIRADOR_DE_SUPERADAS, decided_at: hora, resolved_at: hora, resolution_notes: 'Superada por una versión más nueva de la misma pieza', decision: { superada: true, superada_por: nueva.hitl_id, no_es_decision_del_dueno: true } }).eq('id', id).eq('status', 'pending').select('id')) as { data: Fila[] | null; error: unknown }
      if (!u.error && (u.data?.length ?? 0) > 0) retiradas.push(id)
    }
    return { retiradas }
  } catch { return { retiradas: [] } }
}
