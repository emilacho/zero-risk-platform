/**
 * LA PUERTA DEL DUEÑO EN EL CEREBRO · el cliente HTTP del buzón (CC#1 · 16-oct). Solo LLAMA a la entrada ya publicada (`/api/brain/alimentar/dueno`, de CC-CEREBRO); no escribe en tablas del cerebro.
 *  · `registrarPregunta`: ANTES de escribirle al dueño. Si el cerebro ya tiene la respuesta, no se pregunta; si otra oficina ya espera, tampoco.
 *  · `registrarRespuesta`: al recoger lo que contestó el dueño por el MD.
 * La base, la llave y el `fetch` entran por parámetro (la llave NUNCA se imprime). NUNCA lanza: cualquier fallo es `{ ok: false }` y el buzón sigue con supuestos y lo avisa.
 */
type Fetch = typeof fetch

export interface PreguntaAlCerebro {
  client_id: string
  tema: string
  pregunta: string
  /** repite la pregunta aunque ya haya respuesta (si el agente decide que ya no vale) */
  forzar?: boolean
}
export type VeredictoDePregunta =
  | { ok: true; estado: 'registrada'; pregunta_id: string | null }
  | { ok: true; estado: 'ya_respondida'; respuestas: Array<{ respuesta: string; canal?: string; respondido_en?: string }> }
  | { ok: true; estado: 'ya_preguntada' | 'repetida' }
  | { ok: false; error: string }
export interface RespuestaAlCerebro {
  client_id: string
  tema: string
  pregunta: string
  respuesta: string
  mensaje_ref: string
  respondido_en: string
  pregunta_id?: string | null
}
export interface CerebroDelDueno {
  registrarPregunta(p: PreguntaAlCerebro): Promise<VeredictoDePregunta>
  registrarRespuesta(p: RespuestaAlCerebro): Promise<{ ok: true } | { ok: false; error: string }>
}

const OFICINA = { oficina: 'financiera', agente: 'chief-financial-officer' }

export function cerebroDelDueno(p: { base: string; llave: string; workflow_id: string; workflow_execution_id: string; fetch?: Fetch }): CerebroDelDueno {
  const f = p.fetch ?? fetch
  const sin = !p.base || !p.llave || !p.workflow_id || !p.workflow_execution_id
  const url = `${p.base.replace(/\/+$/, '')}/api/brain/alimentar/dueno`
  async function post(cuerpo: Record<string, unknown>): Promise<{ ok: true; j: Record<string, any> } | { ok: false; error: string }> {
    if (sin) return { ok: false, error: 'cerebro_no_configurado' }
    try {
      const r = await f(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': p.llave },
        body: JSON.stringify({ ...cuerpo, preguntado_por: OFICINA, dry_run: false, workflow_id: p.workflow_id, workflow_execution_id: p.workflow_execution_id }),
      })
      const j = (await r.json().catch(() => ({}))) as Record<string, any>
      return r.status >= 200 && r.status < 300 ? { ok: true, j } : { ok: false, error: `http_${r.status}${typeof j.error === 'string' ? `:${j.error}` : ''}` }
    } catch { return { ok: false, error: 'red' } }
  }
  return {
    async registrarPregunta(q) {
      const r = await post({ evento: 'pregunta', client_id: q.client_id, tema: q.tema, pregunta: q.pregunta, canal: 'MD de Slack', ...(q.forzar ? { forzar: true } : {}) })
      if (!r.ok) return r
      const j = r.j
      if (j.registrada === true) return { ok: true, estado: 'registrada', pregunta_id: typeof j.pregunta_id === 'string' ? j.pregunta_id : null }
      if (j.ya_respondida === true) {
        const rs = Array.isArray(j.respuestas) ? (j.respuestas as Array<Record<string, unknown>>).filter((x) => typeof x?.respuesta === 'string' && String(x.respuesta).trim()) : []
        return rs.length
          ? { ok: true, estado: 'ya_respondida', respuestas: rs.map((x) => ({ respuesta: String(x.respuesta), canal: typeof x.canal === 'string' ? x.canal : undefined, respondido_en: typeof x.respondido_en === 'string' ? x.respondido_en : undefined })) }
          : { ok: false, error: 'ya_respondida_sin_respuesta' }
      }
      if (j.ya_preguntada === true) return { ok: true, estado: 'ya_preguntada' }
      if (j.repetida === true) return { ok: true, estado: 'repetida' }
      return { ok: false, error: 'respuesta_no_entendida' }
    },
    async registrarRespuesta(x) {
      const r = await post({ evento: 'respuesta', client_id: x.client_id, tema: x.tema, pregunta: x.pregunta, respuesta: x.respuesta, canal: 'MD de Slack', mensaje_ref: x.mensaje_ref, respondido_en: x.respondido_en, ...(x.pregunta_id ? { pregunta_id: x.pregunta_id } : {}) })
      if (!r.ok) return r
      return r.j.guardada === true || r.j.ok === true ? { ok: true } : { ok: false, error: 'no_guardada' }
    },
  }
}
