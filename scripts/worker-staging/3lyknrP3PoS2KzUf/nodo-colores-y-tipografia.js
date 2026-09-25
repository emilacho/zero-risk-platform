// ═══ CUERPO DEL NODO «Colores y tipografía del sitio (cable ② · CC#1)» · Servicio de Apify 3lyknrP3PoS2KzUf
// ═══ (el constructor pega ANTES de esto el extractor de extraer-colores-y-tipografia.js, letra por letra)
// ═══ v2 (2026-09-25) · lee también las hojas de estilo del propio dominio · declara cuánto material leyó
//
// Corre UNA vez por corrida, entre «Rearmar con el id de la página» y «Merge · apify data ready».
// Deja pasar los ítems TAL CUAL (el texto y el markdown del sitio no se tocan: ROJO 1 del encargo)
// y añade `_visual` al primero. Sólo actúa para `website_content_scraper` (el sitio PROPIO);
// para las demás funciones devuelve la entrada sin cambios.
// La ficha (`clients.brand_colors` / `brand_fonts`) se escribe SÓLO si estaba vacía y SÓLO si se
// encontró algo: vacío no se escribe, y nunca se pisa lo que ventas o alguien puso a mano.
// Cualquier fallo (red, $env, PostgREST) queda DECLARADO en `_visual.error`: no para la corrida
// y no se disfraza de dato. Las hojas que no se pudieron leer quedan en `hojas_leidas[].error`.
const ctx = $('Validar el cuerpo contra el esquema').first().json
const items = $input.all().map((i) => i.json)
const fn = ctx.apify_function
const visual = {
  cable: 'colores-y-tipografia · CC#1 · 2026-09-25 · v2',
  funcion: fn,
  aplica: fn === 'website_content_scraper',
  url: null,
  colores: [],
  tipografias: [],
  detalle: null,
  hojas_encontradas: 0,
  hojas_leidas: [],
  hojas_motivo: null,
  html_bytes: 0,
  material_leido_bytes: 0,
  ficha: 'no_aplica',
  error: null,
  nota: 'sólo lo declarado en el HTML y en las hojas de estilo del propio dominio (o de Google Fonts) · se guarda en la ficha únicamente si estaba vacía · vacío = no se encontró, no se inventa',
}
if (!visual.aplica || !items.length) return items.map((j) => ({ json: j }))
const UA = 'Mozilla/5.0 (compatible; ZeroRiskBot/1.0; +https://zero-risk-platform.vercel.app)'
try {
  const url = $('Armar el cuerpo del raspador').first().json.cuerpo.startUrls[0].url
  visual.url = url
  const html = String(await this.helpers.httpRequest({ url, method: 'GET', timeout: 15000, json: false, headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml' } }))
  visual.html_bytes = html.length
  const css = []
  const hojas = hojasDeEstilo(html, url)
  visual.hojas_encontradas = hojas.hojas.length
  visual.hojas_motivo = hojas.motivo || (hojas.descartadas.length ? 'descartadas: ' + hojas.descartadas.slice(0, 5).join(' · ') : null)
  for (const h of hojas.hojas.slice(0, 5)) {
    try {
      const t = String(await this.helpers.httpRequest({ url: h, method: 'GET', timeout: 10000, json: false, headers: { 'User-Agent': UA, Accept: 'text/css,*/*' } }))
      css.push(t.slice(0, 300000))
      visual.hojas_leidas.push({ url: h, bytes: t.length, recortada: t.length > 300000 })
    } catch (e) {
      visual.hojas_leidas.push({ url: h, error: String((e && e.message) || e).slice(0, 120) })
    }
  }
  visual.material_leido_bytes = html.length + css.reduce((s, t) => s + t.length, 0)
  const r = extraer(html, css)
  visual.colores = r.colores
  visual.tipografias = r.tipografias
  visual.detalle = r.detalle
  // la ficha · sólo si estaba vacía y sólo si hay algo
  const base = $env.SUPABASE_URL || $env.NEXT_PUBLIC_SUPABASE_URL
  const key = $env.SUPABASE_SERVICE_ROLE_KEY
  const cid = ctx.client_id
  const auth = { apikey: key, Authorization: 'Bearer ' + key }
  const fichas = await this.helpers.httpRequest({ url: base + '/rest/v1/clients?id=eq.' + cid + '&select=id,brand_colors,brand_fonts', method: 'GET', timeout: 10000, json: true, headers: auth })
  const f = Array.isArray(fichas) ? fichas[0] : null
  const vacio = (v) => v === null || v === undefined || (Array.isArray(v) && v.length === 0)
  const patch = {}
  if (f && vacio(f.brand_colors) && visual.colores.length) patch.brand_colors = visual.colores
  if (f && vacio(f.brand_fonts) && visual.tipografias.length) patch.brand_fonts = visual.tipografias
  if (!f) visual.ficha = 'no_encontrada'
  else if (!Object.keys(patch).length) visual.ficha = (visual.colores.length || visual.tipografias.length) ? 'ya_tenia_valores' : 'sin_datos_que_guardar'
  else {
    await this.helpers.httpRequest({ url: base + '/rest/v1/clients?id=eq.' + cid, method: 'PATCH', timeout: 10000, json: true, body: patch, headers: Object.assign({ 'Content-Type': 'application/json', Prefer: 'return=minimal' }, auth) })
    visual.ficha = 'escrito:' + Object.keys(patch).join('+')
  }
} catch (e) {
  visual.error = String((e && e.message) || e).slice(0, 200)
}
items[0] = Object.assign({}, items[0], { _visual: visual })
return items.map((j) => ({ json: j }))
