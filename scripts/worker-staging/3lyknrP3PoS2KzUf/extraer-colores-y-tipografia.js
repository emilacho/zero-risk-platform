// CABLE ② · COLORES Y TIPOGRAFÍA DEL SITIO · CC#1 · 2026-09-25 · §144 Emilio.
//
// Extractor DETERMINÍSTICO (sin modelo) de lo que el sitio DECLARA en su HTML y sus hojas de
// estilo: códigos de color (#hex · rgb()) y familias tipográficas (font-family · @font-face ·
// Google Fonts). Vacío = no se encontró; NUNCA se inventa un color.
//
// Este archivo es el ESPEJO del código que corre dentro del nodo «Colores y tipografía del sitio»
// del Servicio de Apify (3lyknrP3PoS2KzUf): el constructor lo embebe letra por letra y la prueba
// automática comprueba que siguen iguales. Sin `require`, sin dependencias: JavaScript que corre
// igual en Node y en un nodo Code de n8n.
//
// Medido en el censo del 25-sep: el lector de sitios (website-content-crawler) devuelve texto y
// markdown; el HTML llega `null` porque `saveHtml` no se pide. El Arquitecto corrigió el diseño:
// NO se prende `saveHtml` (lo guardado se recorta a 200.000 bytes y el HTML entero podría empujar
// el texto fuera del recorte). ⇒ el HTML se PIDE aparte, se extrae en el momento y se guarda SÓLO
// el resultado: cuatro colores y dos tipografías ocupan nada.

var GENERICAS = new Set(['serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui', 'ui-serif', 'ui-sans-serif', 'ui-monospace', 'ui-rounded', 'emoji', 'math', 'fangsong', 'inherit', 'initial', 'unset', 'revert', '-apple-system', 'blinkmacsystemfont', 'segoe ui', 'apple color emoji', 'segoe ui emoji', 'segoe ui symbol', 'noto color emoji', 'helvetica neue', 'helvetica', 'arial', 'times new roman', 'times', 'courier new', 'courier', 'georgia', 'verdana', 'tahoma', 'trebuchet ms', 'roboto'].map(function (s) { return s.toLowerCase() }))
var IGNORAR_COLOR = new Set(['#000000', '#ffffff'])
var MAX_COLORES = 6
var MAX_TIPOGRAFIAS = 4

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
  if (!s || s.indexOf('var(') === 0 || s.indexOf('$') === 0 || s.indexOf('{') !== -1) return null
  if (s.length > 60 || GENERICAS.has(s.toLowerCase())) return null
  if (!/^[A-Za-z][A-Za-z0-9 \-]*$/.test(s)) return null
  return s
}

/** Devuelve { colores: [hex…], tipografias: [nombre…], detalle: {…} } · sólo lo declarado. */
function extraer(html, cssTextos) {
  var textos = [String(html || '')].concat((cssTextos || []).map(function (t) { return String(t || '') }))
  var colores = {}
  var fuentes = {}
  var totalColores = 0
  textos.forEach(function (t) {
    var m
    var reHex = /#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/g
    while ((m = reHex.exec(t)) !== null) { var hx = aHex6(m[0]); totalColores++; if (!IGNORAR_COLOR.has(hx)) sumar(colores, hx) }
    var reRgb = /rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/g
    while ((m = reRgb.exec(t)) !== null) { var h2 = rgbAHex(m[1], m[2], m[3]); totalColores++; if (!IGNORAR_COLOR.has(h2)) sumar(colores, h2) }
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
      colores_con_conteo: topC,
      tipografias_con_conteo: topF,
      colores_distintos: Object.keys(colores).length,
      menciones_de_color: totalColores,
      textos_leidos: textos.length,
      regla: 'sólo lo declarado en HTML/CSS · se ignoran #000000 y #ffffff y las familias genéricas · vacío = no se encontró',
    },
  }
}

/** Hojas de estilo enlazadas (<link rel=stylesheet>) resueltas contra la página · mismo origen o Google Fonts. */
function hojasDeEstilo(html, urlPagina) {
  var out = []
  var m
  var re = /<link\b[^>]*>/gi
  var base
  try { base = new URL(urlPagina) } catch (e) { return out }
  while ((m = re.exec(String(html || ''))) !== null) {
    var tag = m[0]
    if (!/rel\s*=\s*["']?[^"'>]*stylesheet/i.test(tag)) continue
    var h = /href\s*=\s*["']([^"']+)["']/i.exec(tag)
    if (!h) continue
    try {
      var u = new URL(h[1], base)
      if (u.protocol !== 'https:' && u.protocol !== 'http:') continue
      if (u.host === base.host || u.host === 'fonts.googleapis.com') { if (out.indexOf(u.href) === -1) out.push(u.href) }
    } catch (e) { /* href inválido · se ignora */ }
  }
  return out
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { extraer, hojasDeEstilo, GENERICAS, IGNORAR_COLOR, MAX_COLORES, MAX_TIPOGRAFIAS }
}
