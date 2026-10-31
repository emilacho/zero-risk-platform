// COPIA DE FOTOS · 1/5 · LISTA · CC#1 · 2026-09-29 · 03-oct: CADA FOTO CON SU CONTEXTO (texto, fecha, enlace del post, posición en el carrusel, medio real) vía `contextoDePost` (fotos-contexto-logica.js, pegada arriba por el constructor).
// Una salida por foto a copiar (perfil HD + últimas portadas + hijas de carrusel).
// Instagram real (no ensayo) con client_id, más (27-oct) las fuentes ajenas de competencia/referencias. Sin fotos ⇒ [] y la rama termina sin ruido.
const ctx = $('Validar el cuerpo contra el esquema').first().json
if (ctx.dry_run === true || !ctx.client_id) return []
// 27-oct · competencia y referencias: Mapas, sitios de competidores y biblioteca de anuncios también dejan sus fotos, cada una con su origen (competidor / referencia)
// 31-oct · «guardar todo»: los SITIOS dejan TODAS sus imágenes y una captura por página principal. El rol sale de la PÁGINA que la base ya rotuló con la regla única (propio / competidor / referencia):
// una página de referencia (artículo, tercero) NO deja imágenes; dentro de una propia, lo servido desde otro dominio se rotula 'referencia' (nunca 'propio').
if (ctx.apify_function === 'website_content_scraper' || ctx.apify_function === 'competitor_website_scraper') {
  const crudos = $('Merge · apify data ready').all().map((i) => i.json)
  let rol = ctx.apify_function === 'competitor_website_scraper' ? 'competidor' : null
  if (!rol) {
    const inicio = ($('Armar el cuerpo del raspador').first().json.cuerpo.startUrls || [])[0]
    const url = inicio && inicio.url
    if (!url) return []
    const filas = await this.helpers.httpRequest({ url: 'https://ordaeyxvvvdqsznsecjx.supabase.co/rest/v1/client_web_pages?client_id=eq.' + ctx.client_id + '&url=eq.' + encodeURIComponent(url) + '&select=owner_role', method: 'GET', json: true, timeout: 10000, headers: { apikey: $env.SUPABASE_SERVICE_ROLE_KEY, Authorization: 'Bearer ' + $env.SUPABASE_SERVICE_ROLE_KEY } })
    rol = Array.isArray(filas) && filas[0] && filas[0].owner_role === 'propio' ? 'propio' : null
  }
  // 31-oct · parte 2 · los PDF enlazados (menús, catálogos) se leen como una página más: se vuelve a llamar al Servicio con cada PDF (1 página), que guarda su texto como ficha con el rol de la regla única.
  // No espera la respuesta (el rastreo del PDF corre solo) y no encadena: una llamada que ya viene de un PDF (`#documento`) no pide más.
  const yaDocumento = String((ctx.metadata && ctx.metadata.llamado_por) || '').endsWith('#documento')
  if (rol && !yaDocumento) {
    const pdfs = pdfsEnlazados(crudos, { max: 5 })
    for (const d of pdfs) {
      const cuerpoPdf = { client_id: ctx.client_id, destination: 'respuesta', dry_run: false, apify_function: ctx.apify_function, params: { startUrls: [{ url: d.url }], maxCrawlPages: 1, maxCrawlDepth: 0, ...(rol === 'competidor' && ctx.params && ctx.params.competitor_id ? { competitor_id: ctx.params.competitor_id } : {}) }, metadata: { ...(ctx.metadata || {}), llamado_por: String((ctx.metadata && ctx.metadata.llamado_por) || 'servicio') + '#documento', pdf_de: d.pagina } }
      if (rol === 'competidor' && !(cuerpoPdf.params.competitor_id)) continue
      try { await this.helpers.httpRequest({ url: 'https://n8n-production-72be.up.railway.app/webhook/apify-service-workflow', method: 'POST', json: true, body: cuerpoPdf, timeout: 4000 }) } catch (e) { /* el envío salió; la respuesta tarda lo que tarde el rastreo */ }
    }
  }
  return fotosDeSitio(crudos, { rol, tope: 80, capturas: 8 }).map((f) => ({ json: { client_id: ctx.client_id, ...f } }))
}
if (esFuenteAjena(ctx.apify_function)) {
  const crudos = $('Merge · apify data ready').all().map((i) => i.json)
  return fotosDeOtrasFuentes(ctx.apify_function, crudos, { max: ctx.apify_function === 'google_maps_scraper' ? 60 : 12 }).map((f) => ({ json: { client_id: ctx.client_id, ...f } }))
}
if (ctx.apify_function !== 'instagram_scraper') return []
const SB = 'https://ordaeyxvvvdqsznsecjx.supabase.co'
const auth = { apikey: $env.SUPABASE_SERVICE_ROLE_KEY, Authorization: 'Bearer ' + $env.SUPABASE_SERVICE_ROLE_KEY }
const MAX_POSTS = 12
const MAX_HIJAS = 20
const norm = (h) => String(h || '').trim().toLowerCase().replace(/^@/, '').replace(/^https?:\/\/(www\.)?instagram\.com\//, '').replace(/\/.*$/, '')
const fichas = await this.helpers.httpRequest({ url: SB + '/rest/v1/clients?id=eq.' + ctx.client_id + '&select=config', method: 'GET', json: true, timeout: 10000, headers: auth })
const own = norm(fichas[0] && fichas[0].config && fichas[0].config.apify && fichas[0].config.apify.own_handles && fichas[0].config.apify.own_handles.instagram)
const base = { client_id: ctx.client_id }
// 21-oct · el rol lo decide `rolDeLaCuenta`: la ficha si ya dice cuál es la cuenta propia; si no, lo que la llamada declara (metadata.target_kind === 'own').
const declaradoPropio = !!(ctx.metadata && ctx.metadata.target_kind === 'own')
const objetivos = objetivosDeLaLlamada(ctx.cuerpo || ctx.params)
const out = []
for (const it of $('Merge · apify data ready').all().map((i) => i.json)) {
  const handle = norm(it && it.username)
  if (!handle) continue
  const owner_role = rolDeLaCuenta({ handle, own, declaradoPropio, objetivos })
  const push = (post_id, tipo, src, extra) => { if (src) out.push({ json: { ...base, owner_role, handle, post_id, tipo, src, ...(extra || {}) } }) }
  push('logo-hd', 'logo_hd', it.profilePicUrlHD || it.profilePicUrl, { medio: 'logo', posicion: 'unica' })
  for (const p of (it.latestPosts || []).slice(0, MAX_POSTS)) {
    for (const c of contextoDePost(p, { maxHijas: MAX_HIJAS })) out.push({ json: { ...base, owner_role, handle, ...c } })
  }
}
return out
