// ═══ CUERPO DEL NODO «[BB] Piso visual (antes del Promote · CC#1)» · cimiento ssLtwYPt7zxuvnM2
// ═══ (el constructor pega ANTES de esto piso-visual-logica.js, letra por letra)
//
// Corre UNA vez, justo antes de «[BB] Promote prep» (por las dos ramas que hoy llegan ahí: el paso
// de fidelidad y el de ciclos agotados). Lee la materia prima ya raspada (sitio propio · Instagram
// propio, nunca competidor · R6), mira las fotos SIN client_id (R5), arma las dos capas + las reglas
// + la muestra, y las escribe en `brand_book_draft.visual` — de ahí las toma el Promote (que no se
// toca) porque copia el borrador entero a `content_text` (§6 del diseño: «el atajo»).
// El resto del objeto ($json.fidelity, $json.cycle) viaja intacto: Promote prep los necesita.
// Cualquier fallo queda en `visual.error`; nunca para la corrida (aditivo, no bloqueante).
const j = $json
const draft = j.brand_book_draft || {}
let visual = null
try {
  const clientId = $('Validate Deal Data').first().json.client_id
  const base = 'https://ordaeyxvvvdqsznsecjx.supabase.co'
  const authDb = { apikey: $env.SUPABASE_SERVICE_ROLE_KEY, Authorization: 'Bearer ' + $env.SUPABASE_SERVICE_ROLE_KEY }

  const fichas = await this.helpers.httpRequest({
    url: base + '/rest/v1/clients?id=eq.' + clientId + '&select=config,brand_colors,brand_fonts',
    method: 'GET', json: true, timeout: 10000, headers: authDb,
  })

  const filasSitio = await this.helpers.httpRequest({
    url: base + '/rest/v1/apify_raw?client_id=eq.' + clientId + '&apify_function=eq.website_content_scraper&ensayo=eq.false&order=created_at.desc&limit=1&select=respuesta',
    method: 'GET', json: true, timeout: 10000, headers: authDb,
  })
  const filaSitio = filasSitio[0] || null

  // PLAN DE COPIA PROPIA (29-sep): las fotos del perfil PROPIO ya copiadas a nuestro almacén por el paso
  // «Copiar fotos» del flujo de Apify. El modelo mira ESTAS URLs, nunca el enlace de Instagram.
  // 21-oct · TODAS las fuentes propias: el logo y las fotos de cualquier cuenta/red propia ya copiadas (owner_role = propio), no solo el Instagram de la ficha.
  const copias = await this.helpers.httpRequest({
    url: base + '/rest/v1/client_social_images?client_id=eq.' + clientId + '&owner_role=eq.propio&select=post_id,tipo,url,estado,causa,handle,medio,posted_at,owner_role&order=posted_at.desc.nullslast&limit=200',
    method: 'GET', json: true, timeout: 10000, headers: authDb,
  })

  const invocarModelo = async (pedido) => {
    const r = await this.helpers.httpRequest({
      url: ($env.ZERO_RISK_API_URL || 'https://zero-risk-platform.vercel.app') + '/api/agents/run-sdk',
      method: 'POST', json: true, timeout: 120000,
      headers: { 'Content-Type': 'application/json', 'x-api-key': $env.INTERNAL_API_KEY },
      body: {
        // R5 · SIN client_id, a propósito.
        agent: 'jefe-marketing',
        workflow_id: $execution.id,
        workflow_execution_id: $execution.id,
        step_name: 'bb-visual-piso',
        task: pedido.task,
        images: pedido.images,
        images_mode: 'base64',
        // sin client_id no hay checkpoint que saltar (workflow-checkpoint.ts: clientId null ⇒
        // no_client_id ⇒ nunca cachea) · se deja igual, defensivo y declarado.
        force_restart: true,
        context: { role: 'visual_floor' },
      },
    })
    const body = r.body || r
    return {
      response: body.response,
      brain_hit: !!(body.brainEnrichment && body.brainEnrichment.brain_hit === true),
    }
  }

  visual = await derivarPisoVisualTodasLasFuentes({ clientId, filaSitio, ficha: fichas[0] || null, copias: Array.isArray(copias) ? copias : [] }, invocarModelo)
} catch (e) {
  visual = { version: 2, estado: 'ausente', motivo: 'el piso visual falló: ' + String((e && e.message) || e).slice(0, 250), error: String((e && e.message) || e).slice(0, 300) }
}

// el manual queda coherente: sus columnas de colores y tipografía se completan (solo si vienen vacías) con lo del bloque visual, que lleva su procedencia y su estado (declarado/propuesta)
const nuevoDraft = { ...draft, visual }
const pm = visual && visual.para_el_manual
if (pm) {
  // 21-oct (tick de las 19:30Z): las columnas que ESCRIBIÓ el piso en una corrida anterior (objetos con estado y procedencia) se REEMPLAZAN por las de esta corrida (si no, un v3 limpio
  // heredaba la basura del v2); las que puso otra fuente (texto plano, una persona) no se tocan nunca.
  const delPiso = (a) => Array.isArray(a) && a.length > 0 && a.every((x) => x && typeof x === 'object' && !!x.estado && !!x.procedencia)
  const libre = (a) => !Array.isArray(a) || a.length === 0 || delPiso(a)
  if (libre(draft.primary_colors) && (pm.primary_colors.length || delPiso(draft.primary_colors))) nuevoDraft.primary_colors = pm.primary_colors
  if (libre(draft.typography) && (pm.typography.length || delPiso(draft.typography))) nuevoDraft.typography = pm.typography
}
// la compuerta DECLARA el hueco: si lo visual no quedó completo, el registro del manual lo cuenta como provisional (parcial) o ausente, con su motivo (Promote prep arma `campos_provisionales` / `campos_ausentes` desde `_field_meta`)
if (visual && visual.estado === 'completo' && draft._field_meta && draft._field_meta.visual) {
  // ya no hay hueco que declarar: se quita la marca que dejó una corrida anterior
  const fm = Object.assign({}, draft._field_meta)
  delete fm.visual
  nuevoDraft._field_meta = fm
}
if (visual && visual.estado && visual.estado !== 'completo') {
  nuevoDraft._field_meta = Object.assign({}, draft._field_meta || {}, { visual: { estado: visual.estado === 'parcial' ? 'provisional' : 'ausente', motivo: String(visual.motivo || '').slice(0, 300) } })
}
return [{ json: { ...j, brand_book_draft: nuevoDraft } }]
