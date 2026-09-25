// CABLE ② · COLORES Y TIPOGRAFÍA DEL SITIO · CC#1 · 2026-09-25 · §144 Emilio.
// VERSIÓN DEL EXTRACTOR: 2 · (2026-09-25 · «las tipografías viven en las hojas de estilo» · hallazgo de CC#3)
//
// Extractor DETERMINÍSTICO (sin modelo) de lo que el sitio DECLARA en su HTML y sus hojas de
// estilo: códigos de color (#hex · rgb()) y familias tipográficas (font-family · @font-face ·
// Google Fonts). Vacío = no se encontró; NUNCA se inventa un color ni una fuente.
//
// Este archivo es el ESPEJO del código que corre dentro del nodo «Colores y tipografía del sitio»
// del Servicio de Apify (3lyknrP3PoS2KzUf): el constructor lo embebe letra por letra y la prueba
// automática comprueba que siguen iguales. Sin `require`, sin dependencias y SIN globales que el
// sandbox del nodo Code de n8n no tenga: JavaScript que corre igual en Node y en n8n.
//
// v2 · POR QUÉ: la v1 resolvía los enlaces a las hojas de estilo con el constructor de direcciones
// nativo (la clase global de direcciones) dentro de un try/catch que devolvía [] si fallaba. En el
// sandbox del nodo Code de n8n esa clase global NO existe, así que
// el nodo leyó 0 hojas y concluyó «sin tipografías» sobre un sitio que declara 7 familias reales en
// sus dos hojas (108.005 caracteres · medido por CC#3 y reproducido en local el 25-sep). Ahora las
// direcciones se resuelven a mano (absolutas · //host · /raíz · relativas) y si algo no se puede
// resolver se DECLARA (`motivo`), no se calla. Además: las familias «… Fallback» que genera
// next/font (métricas de reserva, no fuentes del sitio) se excluyen, y el tope sube de 4 a 8 para
// que quepan todas las reales de un sitio normal.

var VERSION_EXTRACTOR = 2
var GENERICAS = new Set(['serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui', 'ui-serif', 'ui-sans-serif', 'ui-monospace', 'ui-rounded', 'emoji', 'math', 'fangsong', 'inherit', 'initial', 'unset', 'revert', '-apple-system', 'blinkmacsystemfont', 'segoe ui', 'apple color emoji', 'segoe ui emoji', 'segoe ui symbol', 'noto color emoji', 'helvetica neue', 'helvetica', 'arial', 'times new roman', 'times', 'courier new', 'courier', 'georgia', 'verdana', 'tahoma', 'trebuchet ms', 'roboto', 'consolas', 'menlo', 'monaco', 'liberation mono', 'sfmono-regular', 'sf mono', 'ui-serif', 'lucida console'].map(function (s) { return s.toLowerCase() }))
var IGNORAR_COLOR = new Set(['#000000', '#ffffff'])
var MAX_COLORES = 6
var MAX_TIPOGRAFIAS = 8

function aHex6(h) {
  var s = String(h).toLowerCase()
  if (s.length === 4) return '#' + s[1] + s[1] + s[2] + s[2] + s[3] + s[3]
  return s.slice(0, 7)
}
function rgbAHex(r, g, b) {
  var p = function (n) { var v = Math.max(0, Math.min(255, parseInt(n, 10) || 0)).toString(16); return v.length === 1 ? '0' + v : v }
  return '#' + p(r) + p(g) + p(b)
}
function sumar(mapa, clave) { mapa[clave] = (mapa[clave] || 0) + 1 }
function ordenar(mapa, tope) {
  return Object.keys(mapa).map(function (k) { return { valor: k, n: mapa[k] } })
    .sort(function (a, b) { return b.n - a.n || (a.valor < b.valor ? -1 : 1) })
    .slice(0, tope)
}
function limpiarFamilia(f) {
  var s = String(f).trim().replace(/^["']|["']$/g, '').replace(/\s+/g, ' ').trim()
  if (!s || s.indexOf('var(') === 0 || s.indexOf('$') === 0 || s.indexOf('{') !== -1 || s.indexOf(')') !== -1) return null
  if (s.length > 60 || GENERICAS.has(s.toLowerCase())) return null
  // next/font genera «<Familia> Fallback»: métricas de reserva, no una fuente que el sitio use
  if (/ fallback$/i.test(s)) return null
  if (!/^[A-Za-z][A-Za-z0-9 \-]*$/.test(s)) return null
  return s
}

/** Devuelve { colores: [hex…], tipografias: [nombre…], detalle: {…} } · sólo lo declarado. */
function extraer(html, cssTextos) {
  var textos = [String(html || '')].concat((cssTextos || []).map(function (t) { return String(t || '') }))
  var colores = {}
  var fuentes = {}
  var totalColores = 0
  var fontFace = 0
  textos.forEach(function (t) {
    var m
    var reHex = /#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/g
    while ((m = reHex.exec(t)) !== null) { var hx = aHex6(m[0]); totalColores++; if (!IGNORAR_COLOR.has(hx)) sumar(colores, hx) }
    var reRgb = /rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/g
    while ((m = reRgb.exec(t)) !== null) { var h2 = rgbAHex(m[1], m[2], m[3]); totalColores++; if (!IGNORAR_COLOR.has(h2)) sumar(colores, h2) }
    fontFace += (t.match(/@font-face/gi) || []).length
    var reFam = /font-family\s*:\s*([^;}{]+)/gi
    while ((m = reFam.exec(t)) !== null) {
      m[1].split(',').forEach(function (f) { var n = limpiarFamilia(f); if (n) sumar(fuentes, n) })
    }
    var reGoogle = /fonts\.googleapis\.com\/css2?\?([^"'\s)>]+)/gi
    while ((m = reGoogle.exec(t)) !== null) {
      m[1].split('&').forEach(function (par) {
        if (par.indexOf('family=') !== 0) return
        var nombre = decodeURIComponent(par.slice(7)).split(':')[0].replace(/\+/g, ' ')
        var n = limpiarFamilia(nombre); if (n) sumar(fuentes, n)
      })
    }
  })
  var topC = ordenar(colores, MAX_COLORES)
  var topF = ordenar(fuentes, MAX_TIPOGRAFIAS)
  return {
    colores: topC.map(function (c) { return c.valor }),
    tipografias: topF.map(function (f) { return f.valor }),
    detalle: {
      version_extractor: VERSION_EXTRACTOR,
      colores_con_conteo: topC,
      tipografias_con_conteo: topF,
      colores_distintos: Object.keys(colores).length,
      tipografias_distintas: Object.keys(fuentes).length,
      menciones_de_color: totalColores,
      font_face: fontFace,
      textos_leidos: textos.length,
      material_leido_chars: textos.reduce(function (s, t) { return s + t.length }, 0),
      regla: 'sólo lo declarado en HTML/CSS · se ignoran #000000 y #ffffff, las familias genéricas o de sistema y las «… Fallback» de next/font · vacío = no se encontró',
    },
  }
}

/** Resuelve una dirección relativa contra la página · a mano, sin `URL` (el sandbox de n8n no la tiene). */
function resolverDireccion(href, urlPagina) {
  var h = String(href || '').trim()
  var base = /^(https?):\/\/([^\/?#]+)(\/[^?#]*)?/i.exec(String(urlPagina || '').trim())
  if (!base) return null
  var esquema = base[1].toLowerCase(), host = base[2].toLowerCase(), ruta = base[3] || '/'
  if (/^https?:\/\//i.test(h)) return h
  if (h.indexOf('//') === 0) return esquema + ':' + h
  if (h.indexOf('/') === 0) return esquema + '://' + host + h
  if (!h || /^[a-z][a-z0-9+.-]*:/i.test(h)) return null
  var dir = ruta.replace(/[^\/]*$/, '')
  return esquema + '://' + host + dir + h
}
function hostDe(url) {
  var m = /^https?:\/\/([^\/?#]+)/i.exec(String(url || ''))
  return m ? m[1].toLowerCase() : null
}

/** Hojas de estilo enlazadas (<link rel=stylesheet>) · sólo el mismo origen o Google Fonts · con motivo si no se pudo. */
function hojasDeEstilo(html, urlPagina) {
  var out = []
  var hostBase = hostDe(urlPagina)
  if (!hostBase) return { hojas: [], motivo: 'la dirección de la página no se pudo leer: ' + String(urlPagina).slice(0, 80), enlaces_vistos: 0, descartadas: [] }
  var m
  var re = /<link\b[^>]*>/gi
  var vistos = 0
  var descartadas = []
  while ((m = re.exec(String(html || ''))) !== null) {
    var tag = m[0]
    if (!/rel\s*=\s*["']?[^"'>]*stylesheet/i.test(tag)) continue
    vistos++
    var h = /href\s*=\s*["']([^"']+)["']/i.exec(tag)
    if (!h) { descartadas.push('sin href'); continue }
    var u = resolverDireccion(h[1].replace(/&amp;/g, '&'), urlPagina)
    if (!u) { descartadas.push(h[1].slice(0, 80)); continue }
    var host = hostDe(u)
    if (host === hostBase || host === 'fonts.googleapis.com') { if (out.indexOf(u) === -1) out.push(u) } else descartadas.push('otro origen: ' + host)
  }
  return { hojas: out, motivo: null, enlaces_vistos: vistos, descartadas: descartadas }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { extraer, hojasDeEstilo, resolverDireccion, hostDe, limpiarFamilia, GENERICAS, IGNORAR_COLOR, MAX_COLORES, MAX_TIPOGRAFIAS, VERSION_EXTRACTOR }
}
