/**
 * LAS PREGUNTAS AL DUEÑO · el cliente HTTP del buzón (CC#1 · 16-oct · 06-nov: las preguntas salieron del cerebro, firma de Emilio vía Lenovo).
 * Preguntar, cerrar y responder van a la lista de la PLATAFORMA (`/api/dueno/preguntas`); ella manda al cerebro solo la respuesta (o el supuesto asumido).
 * `leerRespuestas` sigue leyendo del cerebro (`/api/brain/alimentar/dueno`, de CC-CEREBRO): lo que el dueño ya dijo sí es canon. No escribe en tablas de nadie.
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
  /** el supuesto que la oficina propone si el dueño no contesta: el dueño puede ASUMIRLO en Tu oficina */
  supuesto?: string
}
export type VeredictoDePregunta =
  | { ok: true; estado: 'registrada'; pregunta_id: string | null }
  | { ok: true; estado: 'ya_respondida'; respuestas: Array<{ respuesta: string; canal?: string; respondido_en?: string }> }
  | { ok: true; estado: 'ya_preguntada' }
  /** la pregunta es de esta misma oficina y sigue pendiente: trae su id para poder cerrarla al contestar */
  | { ok: true; estado: 'repetida'; pregunta_id: string | null }
  | { ok: false; error: string }
export interface RespuestaAlCerebro {
  client_id: string
  tema: string
  pregunta: string
  respuesta: string
  mensaje_ref: string
  respondido_en: string
  pregunta_id?: string | null
  /** quién contestó (queda en la fila de la pregunta); por omisión «el dueño» */
  decidido_por?: string
}
export interface CerebroDelDueno {
  registrarPregunta(p: PreguntaAlCerebro): Promise<VeredictoDePregunta>
  registrarRespuesta(p: RespuestaAlCerebro): Promise<{ ok: true } | { ok: false; error: string }>
  /** ¿ya contestó? Solo lee: a diferencia de `registrarPregunta`, nunca crea una fila */
  leerRespuestas?(p: { client_id: string; tema: string }): Promise<{ ok: true; respuestas: Array<{ respuesta: string }> } | { ok: false; error: string }>
  /** cierra UNA pregunta, de cualquier antigüedad, sin tocar las de otra sede u otra oficina. Se usa tras guardar una respuesta: la puerta solo cierra sola las de las últimas 72 horas */
  cerrarPendiente?(p: { client_id: string; pregunta_id: string; motivo: string }): Promise<{ ok: true } | { ok: false; error: string }>
}

const OFICINA = { oficina: 'financiera', agente: 'chief-financial-officer' }

export function cerebroDelDueno(p: { base: string; llave: string; workflow_id: string; workflow_execution_id: string; canal_etiqueta?: string; fetch?: Fetch }): CerebroDelDueno {
  const etiqueta = p.canal_etiqueta?.trim() || 'MD de Slack'
  const f = p.fetch ?? fetch
  const sin = !p.base || !p.llave || !p.workflow_id || !p.workflow_execution_id
  const url = `${p.base.replace(/\/+$/, '')}/api/brain/alimentar/dueno`
  const urlDeLaPlataforma = `${p.base.replace(/\/+$/, '')}/api/dueno/preguntas`
  async function post(cuerpo: Record<string, unknown>): Promise<{ ok: true; j: Record<string, any> } | { ok: false; error: string }> {
    if (sin) return { ok: false, error: 'cerebro_no_configurado' }
    try {
      const r = await f(urlDeLaPlataforma, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': p.llave },
        body: JSON.stringify({ ...cuerpo, preguntado_por: OFICINA, workflow_id: p.workflow_id, workflow_execution_id: p.workflow_execution_id }),
      })
      const j = (await r.json().catch(() => ({}))) as Record<string, any>
      if (r.status >= 200 && r.status < 300) return { ok: true, j }
      // otro cerró la fila DESPUÉS de que el cerebro guardó: lo del dueño ya está, no se repite
      if (r.status === 409 && j.guardada_en_cerebro === true) return { ok: true, j: { ...j, ok: true, guardada: true } }
      return { ok: false, error: `http_${r.status}${typeof j.error === 'string' ? `:${j.error}` : ''}` }
    } catch { return { ok: false, error: 'red' } }
  }
  return {
    async registrarPregunta(q) {
      const r = await post({ accion: 'preguntar', client_id: q.client_id, tema: q.tema, pregunta: q.pregunta, canal: etiqueta, ...(q.supuesto?.trim() ? { supuesto: q.supuesto.trim() } : {}), ...(q.forzar ? { forzar: true } : {}) })
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
      if (j.repetida === true) return { ok: true, estado: 'repetida', pregunta_id: typeof j.pregunta_id === 'string' ? j.pregunta_id : null }
      return { ok: false, error: 'respuesta_no_entendida' }
    },
    async leerRespuestas(q) {
      if (sin) return { ok: false, error: 'cerebro_no_configurado' }
      try {
        const r = await f(`${url}?client_id=${encodeURIComponent(q.client_id)}&tema=${encodeURIComponent(q.tema)}`, { method: 'GET', headers: { 'x-api-key': p.llave } })
        const j = (await r.json().catch(() => ({}))) as Record<string, any>
        if (r.status < 200 || r.status >= 300) return { ok: false, error: `http_${r.status}` }
        // con la puerta apagada no se leyó nada: eso no es «no contestó»
        if (j.ok !== true || !Array.isArray(j.respuestas)) return { ok: false, error: j.apagado === true ? 'puerta_apagada' : 'respuesta_no_entendida' }
        return { ok: true, respuestas: (j.respuestas as Array<Record<string, unknown>>).filter((x) => typeof x?.respuesta === 'string' && String(x.respuesta).trim()).map((x) => ({ respuesta: String(x.respuesta) })) }
      } catch { return { ok: false, error: 'red' } }
    },
    async cerrarPendiente(q) {
      // la cierra el SISTEMA, no el dueño: queda «obsoleta» con su motivo. Si ya estaba cerrada (409), el objetivo ya se cumplió.
      const r = await post({ accion: 'descartar', por_el_sistema: true, decidido_por: `sistema · ${OFICINA.oficina}`, client_id: q.client_id, pregunta_id: q.pregunta_id, motivo: q.motivo })
      if (!r.ok) return r.error.startsWith('http_409') ? { ok: true } : r
      return r.j.ok === true ? { ok: true } : { ok: false, error: 'no_cerrada' }
    },
    async registrarRespuesta(x) {
      const cuerpo = { accion: 'responder', decidido_por: x.decidido_por?.trim() || 'el dueño', client_id: x.client_id, tema: x.tema, pregunta: x.pregunta, respuesta: x.respuesta, canal: etiqueta, mensaje_ref: x.mensaje_ref, respondido_en: x.respondido_en }
      let r = await post({ ...cuerpo, ...(x.pregunta_id ? { pregunta_id: x.pregunta_id } : {}) })
      // la pregunta ya estaba cerrada (p. ej. la contestó en Tu oficina): lo que dijo igual es su palabra y va al cerebro, sin esa fila
      if (!r.ok && x.pregunta_id && /^http_(404|409):(ya_cerrada|pregunta_inexistente)$/.test(r.error)) r = await post(cuerpo)
      if (!r.ok) return r
      return r.j.guardada === true || r.j.ok === true ? { ok: true } : { ok: false, error: 'no_guardada' }
    },
  }
}
