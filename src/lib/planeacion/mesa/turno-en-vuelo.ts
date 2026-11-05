/**
 * 05-nov · ¿el corredor sigue trabajando este turno de la mesa? Lo dice su punto de control, escrito al empezar y al terminar.
 * Un punto «en curso» muy viejo es un empleado muerto: no se espera para siempre. Si no se puede leer, responde `null`: quien llama no sabe.
 */
import type { Db } from '@/lib/finanzas/almacen-supabase'

/** el empleado más largo medido tardó 32 min (29-sep) */
export const VENCE_EL_TURNO_EN_VUELO_MS = 35 * 60 * 1000

export async function turnoEnVueloEnElCorredor(db: Db, q: { workflow_id: string; client_id: string; clave: string; desde?: string }, ahora: Date): Promise<boolean | null> {
  const r = await db.from('workflow_checkpoints').select('step_status,updated_at').eq('workflow_id', q.workflow_id).eq('client_id', q.client_id).eq('step_name', q.clave).limit(1)
  if (r.error || !Array.isArray(r.data)) return null
  const f = r.data[0] as { step_status?: unknown; updated_at?: unknown } | undefined
  if (!f || f.step_status !== 'in_progress') return false
  const desde = Date.parse(String(f.updated_at))
  if (!Number.isFinite(desde)) return null
  // la base pone `updated_at` en cada escritura: si no cambió desde el fallo declarado, es la fila de ese fallo y nadie trabaja
  const fallo = q.desde === undefined ? NaN : Date.parse(q.desde)
  if (Number.isFinite(fallo) && desde <= fallo) return false
  return ahora.getTime() - desde < VENCE_EL_TURNO_EN_VUELO_MS
}
