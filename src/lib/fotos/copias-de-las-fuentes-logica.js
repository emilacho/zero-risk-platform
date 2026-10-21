/**
 * COPIA DE FOTOS Y LOGO PROPIOS DE TODAS LAS FUENTES · lógica PURA (sin red, sin `this`, sin `require` fuera de este archivo) · CC#1 · 2026-10-21 · ENCARGO «manual visual con todas las fuentes», T2.
 * La pega delante de «Fotos · lista» el constructor del Servicio de Apify (igual que `fotos-contexto-logica.js`).
 *
 * Qué resuelve: el escritor único de copias (la cadena `Fotos ·`) sólo copiaba Instagram. Esta función entrega, para las demás fuentes PROPIAS, las MISMAS filas que ya entrega el camino de
 * Instagram: `{ owner_role, handle, post_id, tipo, src, medio, posicion, caption, posted_at, post_url }`. El resto de la cadena (bajar · revisar · subir · anotar) no cambia.
 * Instagram NO pasa por aquí (su camino queda byte a byte como estaba).
 *
 * Reglas:
 *  · SOLO lo propio: la función dice que es del propio cliente (`own_*`, el sitio propio) o la llamada lo declara (`metadata.target_kind === 'own'`). Competidores de estas fuentes NO se copian (R6).
 *  · La fuente va en el `handle` con prefijo (`maps:` · `sitio:` · `facebook:` · `youtube:`); `post_id` único por fuente. Así la llave `client+rol+handle+post_id` no choca y no hace falta columna nueva.
 *  · Cada tipo de imagen declara lo que es (`tipo`/`medio`): el logo es `logo`; la foto del lugar o del sitio NO es una foto de producto (`lugar_image` · `sitio_image`); el cuadro de un video es `video`.
 *  · Formas REALES medidas en `apify_raw` (21-oct): Mapas `imageUrl`+`placeId`; sitio `metadata.openGraph[{property,content}]` y `metadata.jsonLd` (anidado); Facebook `media[].image.uri` y `user.profilePic`;
 *    YouTube `thumbnailUrl`. Facebook y YouTube están «sin ejercer»: sólo hay UNA fila real de cada uno; el primer cliente con esa red propia lo cierra.
 */

var MAX_LUGARES = 5
var MAX_IMAGENES_SITIO = 6
var MAX_POSTS_FACEBOOK = 12
var MAX_FOTOS_POR_POST = 4

/** una url http(s) usable (nunca data: ni vacía) */
function urlDeImagen(x) {
  var u = typeof x === 'string' ? x : x && typeof x === 'object' ? x.url || x.contentUrl || x.uri || x.src : null
  u = typeof u === 'string' ? u.trim() : ''
  return /^https?:\/\/[^\s]+$/i.test(u) ? u : null
}

/** un trozo de texto seguro para ir dentro de un handle o un post_id (sin espacios ni símbolos raros) */
function segmento(s, max) {
  return String(s == null ? '' : s).trim().toLowerCase().replace(/[^a-z0-9._-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, max || 60)
}

/** el host de una url sin «www.» */
function hostDe(u) {
  var m = String(u || '').match(/^https?:\/\/([^\/?#]+)/i)
  return m ? m[1].toLowerCase().replace(/^www\./, '') : ''
}

/** ¿esta llamada es del propio cliente? Por su función (`own_*`, el sitio propio) o porque quien llama lo declara. */
function fuenteSoportada(apifyFunction) { return Object.prototype.hasOwnProperty.call(FUENTES, apifyFunction) }

function esDelPropio(apifyFunction, metadata) {
  if (/^own_/.test(String(apifyFunction || ''))) return true
  if (apifyFunction === 'website_content_scraper') return true // el sitio de competencia tiene su propia función (competitor_website_scraper)
  return !!(metadata && metadata.target_kind === 'own')
}

/** aplana listas anidadas (el jsonLd llega como lista de listas) */
function aplana(x, out) {
  out = out || []
  if (Array.isArray(x)) x.forEach(function (y) { aplana(y, out) })
  else if (x != null) out.push(x)
  return out
}

function filaBase(propio, handle, post_id, tipo, medio, posicion, src, extra) {
  var f = { owner_role: propio, handle: handle, post_id: post_id, tipo: tipo, src: src, medio: medio, posicion: posicion }
  if (extra) for (var k in extra) if (extra[k] != null && extra[k] !== '') f[k] = extra[k]
  return f
}

/** Mapas · la ficha del lugar PROPIO: una foto por sede (`imageUrl`), nunca producto. */
function deMapas(items) {
  var out = []
  var vistos = {}
  ;(items || []).forEach(function (it) {
    if (out.length >= MAX_LUGARES || !it) return
    var src = urlDeImagen(it.imageUrl)
    var id = segmento(it.placeId || it.cid || it.title, 60)
    if (!src || !id || vistos[id]) return
    vistos[id] = true
    out.push(filaBase('propio', 'maps:' + id, 'maps-' + id, 'lugar_image', 'imagen', 'unica', src, { caption: it.title ? String(it.title).slice(0, 300) : null, post_url: urlDeImagen(it.url) }))
  })
  return out
}

/** Sitio propio · el logo declarado (jsonLd.logo) y las imágenes que el sitio declara de sí mismo (openGraph og:image, jsonLd.image). */
function deSitio(items) {
  var logo = null
  var imagenes = []
  var host = ''
  var vistas = {}
  ;(items || []).forEach(function (it) {
    if (!it) return
    if (!host) host = hostDe(it.url || (it.metadata && it.metadata.canonicalUrl))
    var md = it.metadata || {}
    aplana(md.openGraph).forEach(function (p) {
      if (p && p.property === 'og:image') { var u = urlDeImagen(p.content); if (u && !vistas[u]) { vistas[u] = true; imagenes.push(u) } }
    })
    aplana(md.jsonLd).forEach(function (n) {
      if (!n || typeof n !== 'object') return
      var l = aplana(n.logo).map(urlDeImagen).filter(Boolean)[0]
      if (l && !logo) logo = l
      aplana(n.image).map(urlDeImagen).filter(Boolean).forEach(function (u) { if (!vistas[u]) { vistas[u] = true; imagenes.push(u) } })
    })
  })
  if (!host) return []
  var handle = 'sitio:' + segmento(host, 60)
  var out = []
  if (logo) { out.push(filaBase('propio', handle, 'sitio-logo', 'logo_hd', 'logo', 'unica', logo)); vistas[logo] = true }
  imagenes.filter(function (u) { return u !== logo }).slice(0, MAX_IMAGENES_SITIO).forEach(function (u, i) {
    out.push(filaBase('propio', handle, 'sitio-img-' + (i + 1), 'sitio_image', 'imagen', 'unica', u))
  })
  return out
}

/** una fecha usable a partir de `time` (ISO o epoch) o `timestamp` (epoch en s o ms) */
function fechaDe(it) {
  var t = it && (it.time != null ? it.time : it.timestamp)
  if (t == null || t === '') return null
  var d = typeof t === 'number' || /^\d+$/.test(String(t)) ? new Date(Number(t) < 1e12 ? Number(t) * 1000 : Number(t)) : new Date(t)
  return isNaN(d.getTime()) ? null : d.toISOString()
}

/** Facebook · la página PROPIA: foto de perfil de la página (logo) y las imágenes de sus publicaciones (`media[].image.uri`). SIN EJERCER con más de una fila real. */
function deFacebook(items) {
  var posts = (items || []).filter(function (x) { return x && typeof x === 'object' })
  if (!posts.length) return []
  var primero = posts[0]
  var pagina = segmento(primero.pageName || (primero.user && primero.user.name) || primero.facebookId || (primero.user && primero.user.id), 60)
  if (!pagina) return []
  var handle = 'facebook:' + pagina
  var out = []
  var perfil = urlDeImagen(primero.user && primero.user.profilePic)
  if (perfil) out.push(filaBase('propio', handle, 'fb-logo', 'logo_hd', 'logo', 'unica', perfil))
  posts.slice(0, MAX_POSTS_FACEBOOK).forEach(function (p) {
    var idp = segmento(p.postId || p.facebookId, 60)
    if (!idp) return
    var imgs = aplana(p.media).map(function (m) { return m && typeof m === 'object' ? urlDeImagen(m.image) || urlDeImagen(m.thumbnail) : null }).filter(Boolean)
    var unicas = imgs.filter(function (u, i) { return imgs.indexOf(u) === i }).slice(0, MAX_FOTOS_POR_POST)
    unicas.forEach(function (u, i) {
      out.push(filaBase('propio', handle, 'fb-' + idp + '-' + (i + 1), 'post_image', 'imagen', unicas.length === 1 ? 'unica' : i === 0 ? 'portada' : 'hijo-' + i, u,
        { caption: p.text ? String(p.text).slice(0, 2000) : null, posted_at: fechaDe(p), post_url: urlDeImagen(p.url) || urlDeImagen(p.link) }))
    })
  })
  return out
}

/** YouTube · el cuadro de portada de los videos del canal PROPIO (medio `video`: nunca cuenta como foto de producto). SIN EJERCER con más de una fila real. */
function deYoutube(items) {
  var out = []
  ;(items || []).slice(0, MAX_POSTS_FACEBOOK).forEach(function (it) {
    if (!it) return
    var src = urlDeImagen(it.thumbnailUrl)
    var canal = segmento(it.channelId || it.channelName || it.channelUsername, 60)
    var id = segmento(it.id, 40)
    if (!src || !canal || !id) return
    out.push(filaBase('propio', 'youtube:' + canal, 'yt-' + id, 'video_portada', 'video', 'unica', src,
      { caption: it.title ? String(it.title).slice(0, 300) : null, posted_at: fechaDe({ time: it.date }), post_url: urlDeImagen(it.url) }))
  })
  return out
}

var FUENTES = { own_google_maps_profile: deMapas, website_content_scraper: deSitio, publicaciones_facebook: deFacebook, videos_youtube: deYoutube }

/**
 * Las filas a copiar para UNA llamada de Apify que NO es de Instagram.
 * o = { apify_function, items, metadata, excluido }.  Devuelve [] si la fuente no está soportada, si no es del propio cliente, o si el cliente está excluido.
 */
function copiasDeLaLlamada(o) {
  if (!o || o.excluido === true) return []
  var fn = FUENTES[o.apify_function]
  if (!fn) return []
  if (!esDelPropio(o.apify_function, o.metadata)) return []
  var filas = fn(aplana(o.items))
  var vistas = {}
  return filas.filter(function (f) { var k = f.handle + '|' + f.post_id; if (vistas[k]) return false; vistas[k] = true; return true })
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    FUENTES_SOPORTADAS: Object.keys(FUENTES), fuenteSoportada: fuenteSoportada, copiasDeLaLlamada: copiasDeLaLlamada, esDelPropio: esDelPropio, segmento: segmento, hostDe: hostDe, urlDeImagen: urlDeImagen,
    deMapas: deMapas, deSitio: deSitio, deFacebook: deFacebook, deYoutube: deYoutube,
  }
}
