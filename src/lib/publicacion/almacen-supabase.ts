/**
 * Los puertos de «publicar lo aprobado» sobre Supabase (CC#2 · 19-oct). Solo toca `hitl_queue` (la bandeja): lee el elemento, lo crea y deja el ensayo en su `metadata`.
 * No toca `social_schedules` ni `social_posts` (la base solo admite ciertos estados ahí y nada publica de esas colas), ni llama a Meta.
 */
import { TIPO_LOTE_SOCIAL, type ElementoDeBandeja, type PuertosDePublicacion, type ResultadoDeEnsayo } from './en-ensayo'

export type Db = { from(tabla: string): any }
type Fila = Record<string, unknown>

const comoObjeto = (x: unknown): Record<string, unknown> | null => (x !== null && typeof x === 'object' && !Array.isArray(x) ? (x as Record<string, unknown>) : null)

export function puertosDePublicacion(db: Db, env: Record<string, string | undefined> = process.env): PuertosDePublicacion {
  return {
    env,
    ahora: () => new Date(),
    async leerElemento(id) {
      const r = await db.from('hitl_queue').select('id,type,status,client_id,metadata').eq('id', id).maybeSingle()
      if (r.error) throw new Error('no pude leer la bandeja: ' + r.error.message)
      if (!r.data) return null
      const f = r.data as Fila
      return { id: String(f.id), type: (f.type as string | null) ?? null, status: String(f.status), client_id: (f.client_id as string | null) ?? null, metadata: comoObjeto(f.metadata) } satisfies ElementoDeBandeja
    },
    async guardarEnsayo(id, ensayo: ResultadoDeEnsayo) {
      // se lee lo que ya traía `metadata` para no borrarlo
      const previa = await db.from('hitl_queue').select('metadata').eq('id', id).maybeSingle()
      if (previa.error) throw new Error('no pude leer la bandeja: ' + previa.error.message)
      const r = await db.from('hitl_queue').update({ metadata: { ...(comoObjeto(previa.data?.metadata) ?? {}), publicacion_ensayo: ensayo } }).eq('id', id)
      if (r.error) throw new Error('no pude guardar el ensayo: ' + r.error.message)
    },
    async buscarLote(task_id, client_id) {
      const r = await db.from('hitl_queue').select('id').eq('type', TIPO_LOTE_SOCIAL).eq('client_id', client_id).filter('metadata->>task_id', 'eq', task_id).limit(1)
      if (r.error) throw new Error('no pude leer la bandeja: ' + r.error.message)
      const f = Array.isArray(r.data) ? (r.data[0] as Fila | undefined) : undefined
      return f ? { id: String(f.id) } : null
    },
    async crearElemento(e) {
      const r = await db.from('hitl_queue').insert({
        client_id: e.client_id,
        // la bandeja trae columnas heredadas que no pueden ir vacías (mismas que usa /api/hitl/queue)
        agent_name: 'social-publisher', risk_type: 'strategic_decision', output_preview: e.output_preview,
        type: TIPO_LOTE_SOCIAL, title: e.title, priority: 'medium', status: 'pending', payload: e.payload, metadata: e.metadata,
      }).select('id').single()
      if (r.error || !r.data) throw new Error('no pude encolar el lote: ' + (r.error?.message ?? 'sin fila'))
      return { id: String((r.data as Fila).id) }
    },
  }
}
