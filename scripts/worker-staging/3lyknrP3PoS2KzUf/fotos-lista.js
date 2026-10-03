// COPIA DE FOTOS · 1/5 · LISTA · CC#1 · 2026-09-29 · 03-oct: CADA FOTO CON SU CONTEXTO (texto, fecha, enlace del post, posición en el carrusel, medio real) vía `contextoDePost` (fotos-contexto-logica.js, pegada arriba por el constructor).
// Una salida por foto a copiar (perfil HD + últimas portadas + hijas de carrusel).
// Solo instagram_scraper real (no ensayo) con client_id. Sin fotos ⇒ [] y la rama termina sin ruido.
const ctx = $('Validar el cuerpo contra el esquema').first().json
if (ctx.apify_function !== 'instagram_scraper' || ctx.dry_run === true || !ctx.client_id) return []
const SB = 'https://ordaeyxvvvdqsznsecjx.supabase.co'
const auth = { apikey: $env.SUPABASE_SERVICE_ROLE_KEY, Authorization: 'Bearer ' + $env.SUPABASE_SERVICE_ROLE_KEY }
const MAX_POSTS = 12
const MAX_HIJAS = 6
const norm = (h) => String(h || '').trim().toLowerCase().replace(/^@/, '').replace(/^https?:\/\/(www\.)?instagram\.com\//, '').replace(/\/.*$/, '')
const fichas = await this.helpers.httpRequest({ url: SB + '/rest/v1/clients?id=eq.' + ctx.client_id + '&select=config', method: 'GET', json: true, timeout: 10000, headers: auth })
const own = norm(fichas[0] && fichas[0].config && fichas[0].config.apify && fichas[0].config.apify.own_handles && fichas[0].config.apify.own_handles.instagram)
const base = { client_id: ctx.client_id }
const out = []
for (const it of $('Merge · apify data ready').all().map((i) => i.json)) {
  const handle = norm(it && it.username)
  if (!handle) continue
  const owner_role = own && handle === own ? 'propio' : 'competidor'
  const push = (post_id, tipo, src, extra) => { if (src) out.push({ json: { ...base, owner_role, handle, post_id, tipo, src, ...(extra || {}) } }) }
  push('logo-hd', 'logo_hd', it.profilePicUrlHD || it.profilePicUrl, { medio: 'logo', posicion: 'unica' })
  for (const p of (it.latestPosts || []).slice(0, MAX_POSTS)) {
    for (const c of contextoDePost(p, { maxHijas: MAX_HIJAS })) out.push({ json: { ...base, owner_role, handle, ...c } })
  }
}
return out
