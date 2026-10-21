// COPIA DE FOTOS · 1/5 · LISTA · CC#1 · 2026-09-29 · 03-oct: CADA FOTO CON SU CONTEXTO (texto, fecha, enlace del post, posición en el carrusel, medio real) vía `contextoDePost` (fotos-contexto-logica.js, pegada arriba por el constructor).
// Una salida por foto a copiar (perfil HD + últimas portadas + hijas de carrusel).
// Solo instagram_scraper real (no ensayo) con client_id. Sin fotos ⇒ [] y la rama termina sin ruido.
const ctx = $('Validar el cuerpo contra el esquema').first().json
if (ctx.dry_run === true || !ctx.client_id) return []
const SB = 'https://ordaeyxvvvdqsznsecjx.supabase.co'
const auth = { apikey: $env.SUPABASE_SERVICE_ROLE_KEY, Authorization: 'Bearer ' + $env.SUPABASE_SERVICE_ROLE_KEY }
// 21-oct · T2 «manual visual con todas las fuentes»: las demás fuentes PROPIAS (Mapas, sitio, Facebook, YouTube) entran por el MISMO escritor único. Instagram sigue su camino de siempre (abajo).
// Competidores de esas fuentes no se copian; un cliente en `cadena_config.copias_fuentes_excluidos` (uuid) no entra.
if (ctx.apify_function !== 'instagram_scraper') {
  if (!fuenteSoportada(ctx.apify_function)) return []
  const cfg = await this.helpers.httpRequest({ url: SB + '/rest/v1/cadena_config?clave=eq.copias_fuentes_excluidos&select=valor', method: 'GET', json: true, timeout: 10000, headers: auth })
  const excluidos = (Array.isArray(cfg) && cfg[0] && Array.isArray(cfg[0].valor) ? cfg[0].valor : []).map((x) => String(x).toLowerCase())
  const filas = copiasDeLaLlamada({ apify_function: ctx.apify_function, items: $('Merge · apify data ready').all().map((i) => i.json), metadata: ctx.metadata, excluido: excluidos.indexOf(String(ctx.client_id).toLowerCase()) !== -1 })
  return filas.map((f) => ({ json: { client_id: ctx.client_id, ...f } }))
}
const MAX_POSTS = 12
const MAX_HIJAS = 6
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
