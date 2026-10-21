// ELEGIR EL CLIENTE · barrido del manual visual · CC#1 · 2026-10-21 · lógica en barrido-logica.js (pegada arriba por el constructor).
// Dos entradas: el reloj (cada 30 min → recorre los clientes AUTORIZADOS) o el webhook (un cliente concreto; exige x-api-key). Entrega A LO MÁS UN cliente por vuelta.
// Autorizados = cadena_config.manual_visual_clientes (lista de uuid; vacía por omisión ⇒ el flujo no hace nada). Nunca toca un manual aprobado por una persona.
const SB = 'https://ordaeyxvvvdqsznsecjx.supabase.co'
const auth = { apikey: $env.SUPABASE_SERVICE_ROLE_KEY, Authorization: 'Bearer ' + $env.SUPABASE_SERVICE_ROLE_KEY }
const e = $input.first().json || {}
const esWebhook = !!e.headers
const body = (esWebhook && e.body && typeof e.body === 'object') ? e.body : {}
if (esWebhook) {
  const k = (e.headers && (e.headers['x-api-key'] || e.headers['X-API-Key'])) || ''
  if (!$env.INTERNAL_API_KEY || k !== $env.INTERNAL_API_KEY) throw new Error('MANUAL_VISUAL_SIN_LLAVE · x-api-key no coincide')
}
const get = (ruta) => this.helpers.httpRequest({ url: SB + '/rest/v1/' + ruta, method: 'GET', json: true, timeout: 15000, headers: auth })
const cfg = await get('cadena_config?clave=eq.manual_visual_clientes&select=valor')
const permitidos = clientesAutorizados(cfg[0] && cfg[0].valor)
const pedido = typeof body.client_id === 'string' ? body.client_id : null
const forzar = body.forzar === true
const candidatos = pedido ? [pedido] : permitidos
const est = $getWorkflowStaticData('global')
est.intentos = est.intentos || {}
const hoy = new Date().toISOString().slice(0, 10)
const omitidos = []
for (const cid of candidatos) {
  const permitido = permitidos.map((x) => x.toLowerCase()).indexOf(String(cid).toLowerCase()) !== -1
  if (!permitido) { omitidos.push({ client_id: cid, motivo: 'cliente_no_autorizado' }); continue }
  const manuales = await get('client_brand_books?client_id=eq.' + cid + '&select=id,version,content_text,human_validated&order=version.desc&limit=1')
  const m = manuales[0]
  if (!m) { omitidos.push({ client_id: cid, motivo: 'sin_manual' }); continue }
  let ct = null
  try { ct = JSON.parse(m.content_text) } catch (x) { ct = null }
  const borrador = ct && ct.brand_book_draft
  if (!borrador || typeof borrador !== 'object') { omitidos.push({ client_id: cid, motivo: 'manual_ilegible' }); continue }
  const fichas = await get('clients?id=eq.' + cid + '&select=brand_colors,brand_fonts')
  const copias = await get('client_social_images?client_id=eq.' + cid + '&owner_role=eq.propio&select=estado,url,created_at&limit=500')
  const sitio = await get('apify_raw?client_id=eq.' + cid + '&apify_function=eq.website_content_scraper&ensayo=eq.false&order=created_at.desc&limit=1&select=id')
  const huella = huellaDeEntradas({ copias: copias, ficha: fichas[0] || {}, sitioId: sitio[0] && sitio[0].id })
  const d = decidirSiCorrer({ permitido: permitido, humanoAprobo: m.human_validated === true, visual: borrador.visual || null, huellaActual: huella, intento: est.intentos[cid] || null, hoy: hoy, forzar: forzar })
  if (!d.correr) { omitidos.push({ client_id: cid, motivo: d.motivo }); continue }
  return [{ json: {
    correr: true, client_id: cid, manual_id: m.id, version: m.version, huella: huella, brand_book_draft: borrador,
    previo: { gate_outcome: ct.gate_outcome, gate_nota: ct.gate_nota, fidelity_passed: ct.fidelity_passed, fidelity_scores: ct.fidelity_scores, fidelity_threshold: ct.fidelity_threshold },
  } }]
}
return [{ json: { correr: false, omitidos: omitidos, motivo: omitidos.length ? omitidos.map((o) => o.motivo).join(',') : 'sin_clientes_autorizados' } }]
