/**
 * Los puertos de «publicar lo aprobado» sobre Supabase (CC#2 · 19-oct · CC3 16-nov). Toca `hitl_queue` (la bandeja: lee el elemento, lo crea y deja el ensayo
 * o el resultado real en su `metadata`), lee la ficha del cliente (`clients.config.redes_oficiales`) y deja una fila en `agent_invocations` por cada publicación real.
 * No toca `social_schedules` ni `social_posts`. La llamada a Meta vive en `meta-real.ts`.
 */
import { leerCuentasMeta } from '@/lib/clients/cuentas-meta'
import { TIPO_LOTE_SOCIAL, type ElementoDeBandeja, type PuertosDePublicacion, type ResultadoDeEnsayo, type ResultadoReal } from './en-ensayo'
import { publicarPiezaEnMeta } from './meta-real'

export type Db = { from(tabla: string): any }
type Fila = Record<string, unknown>

const comoObjeto = (x: unknown): Record<string, unknown> | null => (x !== null && typeof x === 'object' && !Array.isArray(x) ? (x as Record<string, unknown>) : null)

export function puertosDePublicacion(db: Db, env: Record<string, string | undefined> = process.env): PuertosDePublicacion {
  return {
    env,
    ahora: () => new Date(),
    async leerElemento(id) {
      const r = await db.from('hitl_queue').select('id,type,status,client_id,metadata,output_id').eq('id', id).maybeSingle()
      if (r.error) throw new Error('no pude leer la bandeja: ' + r.error.message)
      if (!r.data) return null
      const f = r.data as Fila
      return { id: String(f.id), type: (f.type as string | null) ?? null, status: String(f.status), client_id: (f.client_id as string | null) ?? null, metadata: comoObjeto(f.metadata), output_id: (f.output_id as string | null) ?? null } satisfies ElementoDeBandeja
    },
    async guardarEnsayo(id, ensayo: ResultadoDeEnsayo) {
      // se lee lo que ya traía `metadata` para no borrarlo
      const previa = await db.from('hitl_queue').select('metadata').eq('id', id).maybeSingle()
      if (previa.error) throw new Error('no pude leer la bandeja: ' + previa.error.message)
      const r = await db.from('hitl_queue').update({ metadata: { ...(comoObjeto(previa.data?.metadata) ?? {}), publicacion_ensayo: ensayo } }).eq('id', id)
      if (r.error) throw new Error('no pude guardar el ensayo: ' + r.error.message)
    },
    async leerSalida(id) {
      const r = await db.from('client_historical_outputs').select('id,client_id,content').eq('id', id).maybeSingle()
      if (r.error) throw new Error('no pude leer la salida: ' + r.error.message)
      if (!r.data) return null
      const f = r.data as Fila
      return { id: String(f.id), client_id: (f.client_id as string | null) ?? null, content: (f.content as string | null) ?? null }
    },
    async buscarLote(task_id, client_id) {
      const r = await db.from('hitl_queue').select('id').eq('type', TIPO_LOTE_SOCIAL).eq('client_id', client_id).filter('metadata->>task_id', 'eq', task_id).limit(1)
      if (r.error) throw new Error('no pude leer la bandeja: ' + r.error.message)
      const f = Array.isArray(r.data) ? (r.data[0] as Fila | undefined) : undefined
      return f ? { id: String(f.id) } : null
    },
    async leerCuentas(client_id) {
      const l = await leerCuentasMeta(db, client_id)
      if (!l.ok && l.motivo === 'no_se_pudo_leer_la_ficha') throw new Error('no pude leer la ficha del cliente: ' + (l.detalle ?? ''))
      return l.ok ? l.cuentas : { pagina_facebook: null, instagram_id: null, publicacion_real: false }
    },
    async reclamarReal(id, marca) {
      // UNA sola vez: solo si no hay publicacion_real, o lo anterior falló sin publicar nada. La condición va en el propio UPDATE (dos llamadas a la vez: solo una gana)
      const previa = await db.from('hitl_queue').select('metadata').eq('id', id).maybeSingle()
      if (previa.error) throw new Error('no pude leer la bandeja: ' + previa.error.message)
      const md = comoObjeto(previa.data?.metadata) ?? {}
      const r = await db.from('hitl_queue').update({ metadata: { ...md, publicacion_real: marca } }).eq('id', id)
        .or('metadata->publicacion_real.is.null,metadata->publicacion_real->>estado.eq.fallida').select('id')
      if (r.error) throw new Error('no pude reclamar la publicación: ' + r.error.message)
      return Array.isArray(r.data) && r.data.length === 1
    },
    async guardarReal(id, real: ResultadoReal) {
      const previa = await db.from('hitl_queue').select('metadata').eq('id', id).maybeSingle()
      if (previa.error) throw new Error('no pude leer la bandeja: ' + previa.error.message)
      const r = await db.from('hitl_queue').update({ metadata: { ...(comoObjeto(previa.data?.metadata) ?? {}), publicacion_real: real } }).eq('id', id)
      if (r.error) throw new Error('no pude guardar la publicación: ' + r.error.message)
    },
    publicarEnMeta: (p, cuentas) => publicarPiezaEnMeta(p, cuentas, env),
    async registrarPublicacion(f) {
      const fin = new Date()
      const r = await db.from('agent_invocations').insert({
        session_id: `publicar-aprobado-${f.hitl_id}-${f.resultado.canal}`,
        agent_id: 'social-publisher', agent_name: 'social-publisher', command: null,
        task_id: f.task_id, workflow_id: `bandeja:${f.hitl_id}`, workflow_execution_id: null, client_id: f.client_id, journey_id: null,
        model: 'meta-graph-v21', started_at: new Date(fin.getTime() - f.duracion_ms).toISOString(), ended_at: fin.toISOString(), duration_ms: f.duracion_ms,
        cost_usd: 0, tokens_input: 0, tokens_output: 0, tokens_cache_read: 0, tokens_cache_creation: 0, num_turns: 1,
        status: f.resultado.ok ? 'completed' : 'failed', exit_code: f.resultado.ok ? 0 : 1, error_message: f.resultado.ok ? null : `${f.resultado.paso}: ${f.resultado.error}`,
        metadata: { source: 'publicar_aprobado', hitl_id: f.hitl_id, platform: f.resultado.canal, ...(f.resultado.ok ? { post_id: f.resultado.id, ...(f.resultado.creation_id ? { creation_id: f.resultado.creation_id } : {}) } : { paso: f.resultado.paso }) },
      })
      if (r.error) throw new Error('no pude registrar la publicación: ' + r.error.message)
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
