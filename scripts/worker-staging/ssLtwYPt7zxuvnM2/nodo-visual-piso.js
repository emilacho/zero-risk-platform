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
    url: base + '/rest/v1/clients?id=eq.' + clientId + '&select=config',
    method: 'GET', json: true, timeout: 10000, headers: authDb,
  })
  const ownHandle = (fichas[0] && fichas[0].config && fichas[0].config.apify && fichas[0].config.apify.own_handles && fichas[0].config.apify.own_handles.instagram) || null

  const filasSitio = await this.helpers.httpRequest({
    url: base + '/rest/v1/apify_raw?client_id=eq.' + clientId + '&apify_function=eq.website_content_scraper&ensayo=eq.false&order=created_at.desc&limit=1&select=respuesta',
    method: 'GET', json: true, timeout: 10000, headers: authDb,
  })
  const filaSitio = filasSitio[0] || null

  // Se leen hasta 10 filas recientes de instagram_scraper (propio Y competidores mezclados: ver
  // esInstagramPropio en piso-visual-logica.js) y se toma la PRIMERA que sea del propio cliente.
  const filasInsta = await this.helpers.httpRequest({
    url: base + '/rest/v1/apify_raw?client_id=eq.' + clientId + '&apify_function=eq.instagram_scraper&ensayo=eq.false&order=created_at.desc&limit=10&select=params,respuesta',
    method: 'GET', json: true, timeout: 10000, headers: authDb,
  })
  let filaInstagram = null
  for (const f of filasInsta || []) {
    if (esInstagramPropio(f.params, ownHandle).propio) { filaInstagram = f; break }
  }

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

  visual = await derivarPisoVisual({ clientId, ownInstagramHandle: ownHandle, filaSitio, filaInstagram }, invocarModelo)
} catch (e) {
  visual = { error: String((e && e.message) || e).slice(0, 300) }
}

return [{ json: { ...j, brand_book_draft: { ...draft, visual } } }]
