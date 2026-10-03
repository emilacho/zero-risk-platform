/**
 * CADA FOTO VIAJA CON TODO SU CONTEXTO · CC#1 · 2026-10-03 · encargo Lenovo «cada foto viaja con todo su contexto».
 *
 * Lógica PURA (sin red, sin `this`, sin `URL`, sin `require`): la usan el Servicio de Apify (copia de fotos), el flujo de la pieza (③ ⑤ ⑦), el completador de filas viejas y las pruebas.
 * Se pega entera en los nodos Code de n8n (como `sedes-logica.js`): por eso va en estilo `var` + `function`.
 *
 * 🔴 ESTRUCTURAL, NUNCA POR CLIENTE: ninguna lista de platos, ni de clientes, ni de ciudades. El «producto» de una foto sale del TEXTO del post, comparado con los productos que el
 * propio cliente declara en su plan (los `protagonista` de sus briefs). Lo que no se puede afirmar se declara «desconocido»: nunca se adivina.
 */

// ───────────────────────────── texto ─────────────────────────────
function sinTildes(s) {
  return String(s === undefined || s === null ? '' : s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}
function limpiar(s, max) {
  var t = String(s === undefined || s === null ? '' : s).replace(/\s+/g, ' ').trim()
  return max && t.length > max ? t.slice(0, max).replace(/\s+\S*$/, '') + '…' : t
}

// palabras de función (español e inglés) y palabras de marketing tan genéricas que no nombran un producto · NO son platos ni marcas: son del idioma
var VACIAS = ('para como esta este esto estos estas esos esas pero porque cuando donde desde hasta entre sobre tambien solo todo toda todos todas cada otro otra otros otras mismo misma muy mas menos ' +
  'que con sin por una unos unas del los las nos les sus tus mis the and for with that this from your you are our not hace hacer tiene tener puede pueden ser son fue era hay aqui alla').split(' ')
var GENERICAS = ('plato platos producto productos servicio servicios marca oferta ofertas promo promocion promociones linea opcion opciones nuevo nueva nuevos nuevas principal especial origen calidad foto fotos imagen ' +
  'pieza cliente negocio local menu carta mejor mejores verdadero verdadera delicioso deliciosa sabor sabores ' +
  'disponibilidad ficha experiencia pedido alma precio precios historia narrativa comunidad horario horarios ciudad direccion telefono informacion mensaje respuesta cuenta resena voz etiqueta accion anuncio fase ' +
  'operativa operativo verificada verificado correcta correcto concreta concreto completo completa existente primer primera').split(' ')

function raiz(w) {
  var t = w.replace(/(es|s)$/, '')
  return t.length > 6 ? t.slice(0, 6) : t
}
/** las palabras significativas de un texto con su raíz: [{ palabra, raiz }] · sin @menciones · las #etiquetas SÍ cuentan (dicen el producto) · `excluir` = raíces que no pueden ser producto (marca, ciudad, usuario) */
function significativas(texto, excluir) {
  var ex = {}
  ;(excluir || []).forEach(function (r) { ex[r] = true })
  var t = sinTildes(texto).replace(/@[a-z0-9._]+/g, ' ').replace(/#/g, ' ')
  var out = []
  var vistas = {}
  t.split(/[^a-z0-9]+/).forEach(function (w) {
    if (w.length < 4 || VACIAS.indexOf(w) !== -1 || GENERICAS.indexOf(w) !== -1) return
    var r = raiz(w)
    if (ex[r] || vistas[r]) return
    vistas[r] = true
    out.push({ palabra: w, raiz: r })
  })
  return out
}
function raicesDe(texto, excluir) {
  return significativas(texto, excluir).map(function (s) { return s.raiz })
}
/** raíces que NO pueden nombrar un producto: la marca, su usuario, las ciudades/mercado/país de la ficha */
function excluirDe(datos) {
  var d = datos || {}
  var textos = [d.nombre].concat(d.handles || [], d.ciudades || [], [d.market, d.country])
  var out = []
  textos.forEach(function (x) { raicesDe(x, []).forEach(function (r) { if (out.indexOf(r) === -1) out.push(r) }) })
  return out
}

// ───────────────────────────── el producto del brief y los del cliente ─────────────────────────────
/** «La pizza con su origen en Parma. UNO. No la focaccia, no el combo.» → lo que el brief PIDE: se quita todo desde cada negación hasta el fin de la frase */
function sinNegaciones(texto) {
  return sinTildes(texto).replace(/\b(no|ni|sin|nunca|jamas|not|never)\b[^.;\n]*/g, ' ')
}
/** { nombre, raices[] } o null si el texto no nombra nada que pueda ser un producto */
function entradaDeProtagonista(protagonista, excluir) {
  var sig = significativas(sinNegaciones(protagonista), excluir)
  if (!sig.length) return null
  // el nombre del producto son SUS palabras («pizza»), no la frase entera del brief
  return { nombre: sig.map(function (s) { return s.palabra }).join(' '), raices: sig.map(function (s) { return s.raiz }) }
}
/**
 * EL PRODUCTO DE UN BRIEF = las palabras de su `protagonista` que su `vocabulario_obligatorio` también dice (el brief ya declara así su producto: «pizza» está en las dos).
 * Sin vocabulario: la primera palabra significativa. Si el protagonista y el vocabulario no comparten ningún término, el brief NO nombra un producto: devuelve null (no se inventa una regla).
 */
function productoDelBrief(brief, excluir) {
  var b = brief || {}
  var S = significativas(sinNegaciones(b.protagonista), excluir)
  if (!S.length) return null
  var vocab = Array.isArray(b.vocabulario_obligatorio) ? b.vocabulario_obligatorio.filter(function (x) { return typeof x === 'string' && x.trim() }) : []
  if (vocab.length) {
    var V = raicesDe(vocab.join(' . '), [])
    S = S.filter(function (s) { return V.indexOf(s.raiz) !== -1 })
    if (!S.length) return null
  } else S = S.slice(0, 1)
  return { nombre: S.map(function (s) { return s.palabra }).join(' '), raices: S.map(function (s) { return s.raiz }) }
}
/**
 * LAS ALTERNATIVAS que el propio brief nombra al negarlas: «No el X, no el Y, no la historia…» → X e Y (la primera palabra de cada cláusula negada · si es abstracta —historia, precio— no cuenta).
 * Es lo que el autor del brief dice que NO es el protagonista: la fuente más precisa de «otro producto» que hay sin una lista fija.
 */
function alternativasDelBrief(brief, excluir, producto) {
  var t = sinTildes((brief || {}).protagonista)
  var ex = {}
  ;(excluir || []).forEach(function (r) { ex[r] = true })
  var vistas = {}
  ;((producto && producto.raices) || []).forEach(function (r) { vistas[r] = true })
  var out = []
  var re = /\b(?:no|ni|sin|nunca|jamas)\s+(?:el|la|los|las|un|una|unos|unas)\s+([^,.;\n]+)/g
  var m
  while ((m = re.exec(t)) !== null) {
    var w = (m[1].split(/[^a-z0-9]+/).filter(Boolean)[0]) || ''
    if (w.length < 4 || VACIAS.indexOf(w) !== -1 || GENERICAS.indexOf(w) !== -1) continue
    var r = raiz(w)
    if (ex[r] || vistas[r]) continue
    vistas[r] = true
    out.push({ nombre: w, raices: [r] })
  }
  return out
}
/** el catálogo con que se mira cada foto de ESTE brief: sus alternativas + los productos que el DUEÑO declara en la ficha (`config.productos`) · el producto del brief va aparte */
function catalogoDelBrief(brief, producto, ficha, excluir) {
  var cat = alternativasDelBrief(brief, excluir, producto)
  var cfg = ficha && ficha.config && typeof ficha.config === 'object' ? ficha.config : {}
  var vistas = {}
  cat.forEach(function (e) { e.raices.forEach(function (r) { vistas[r] = true }) })
  ;((producto && producto.raices) || []).forEach(function (r) { vistas[r] = true })
  ;(Array.isArray(cfg.productos) ? cfg.productos : []).forEach(function (s) {
    var e = entradaDeProtagonista(s, excluir)
    if (e && !e.raices.every(function (r) { return vistas[r] })) { e.raices.forEach(function (r) { vistas[r] = true }); cat.push(e) }
  })
  return cat
}
/** los productos del propio cliente: el protagonista de cada brief de su plan · se quitan las raíces comunes a TODOS (no distinguen un producto de otro) */
function catalogoDeProtagonistas(protagonistas, excluir) {
  var entradas = []
  var vistos = {}
  ;(protagonistas || []).forEach(function (p) {
    var e = entradaDeProtagonista(p, excluir)
    if (!e) return
    var k = e.raices.slice().sort().join('|')
    if (vistos[k]) return
    vistos[k] = true
    entradas.push(e)
  })
  if (entradas.length > 1) {
    var comunes = entradas[0].raices.filter(function (r) { return entradas.every(function (e) { return e.raices.indexOf(r) !== -1 }) })
    entradas.forEach(function (e) {
      var resto = e.raices.filter(function (r) { return comunes.indexOf(r) === -1 })
      if (resto.length) e.raices = resto
    })
  }
  return entradas
}
/** ¿qué productos del catálogo nombra este texto? → { producto: [nombres], fuente: 'caption' | 'desconocido', evidencia: [raíces] } */
function productoDeTexto(texto, catalogo) {
  var n = nombrados(catalogo, texto)
  if (!n.entradas.length) return { producto: [], fuente: 'desconocido', evidencia: [] }
  var evidencia = []
  n.entradas.forEach(function (e) { n.raicesTocadas.forEach(function (x) { if (e.raices.indexOf(x) !== -1 && evidencia.indexOf(x) === -1) evidencia.push(x) }) })
  return { producto: n.entradas.map(function (e) { return e.nombre }), fuente: 'caption', evidencia: evidencia, via: n.via }
}
/**
 * Qué entradas (productos) NOMBRA un texto. 🔴 EL CUERPO MANDA SOBRE LAS ETIQUETAS: una cola de #etiquetas suele meter cualquier plato por alcance («#pizza» en el post de otra receta).
 * Si el cuerpo nombra alguno, SÓLO cuentan los del cuerpo; las etiquetas se usan únicamente cuando el cuerpo no nombra ninguno.
 */
function partesDelTexto(texto) {
  var t = String(texto === undefined || texto === null ? '' : texto)
  return { cuerpo: t.replace(/#[^\s#]+/g, ' '), etiquetas: (t.match(/#[^\s#]+/g) || []).join(' ') }
}
function nombrados(entradas, texto) {
  var p = partesDelTexto(texto)
  var rc = raicesDe(p.cuerpo, [])
  var re = raicesDe(p.etiquetas, [])
  var tocan = function (rs) { return (entradas || []).filter(function (e) { return e.raices.some(function (x) { return rs.indexOf(x) !== -1 }) }) }
  var a = tocan(rc)
  if (a.length) return { entradas: a, via: 'cuerpo', raicesTocadas: rc }
  var b = tocan(re)
  return { entradas: b, via: b.length ? 'etiqueta' : null, raicesTocadas: re }
}

// ───────────────────────────── el contexto de un post (Servicio de Apify) ─────────────────────────────
function aMedio(tipo, productType) {
  var t = String(tipo || '').toLowerCase()
  if (t === 'video') return String(productType || '').toLowerCase() === 'clips' ? 'reel' : 'video'
  return 'imagen'
}
function enlaceDelPost(p, sc) {
  if (p && typeof p.url === 'string' && /^https?:\/\//.test(p.url)) return p.url
  var reel = p && String(p.productType || '').toLowerCase() === 'clips'
  return 'https://www.instagram.com/' + (reel ? 'reel' : 'p') + '/' + sc + '/'
}
/**
 * Las fotos de UN post con todo su contexto: [{ post_id, tipo, src, caption, posted_at, post_url, posicion, indice, medio }]
 *  · post suelto  → 1 foto (posicion «unica»)
 *  · carrusel     → portada (posicion «portada») + una por hijo (posicion «hijo-N»)
 * El medio es el REAL: un reel es «reel» (aunque la foto sea su cuadro de portada), el hijo-video de un carrusel es «video».
 */
function contextoDePost(post, opciones) {
  var o = opciones || {}
  var maxHijas = o.maxHijas === undefined ? 6 : o.maxHijas
  var p = post || {}
  var sc = p.shortCode || p.id
  if (!sc) return []
  sc = String(sc)
  var hijas = Array.isArray(p.childPosts) ? p.childPosts.slice(0, maxHijas) : []
  var base = { caption: limpiar(p.caption, 2200) || null, posted_at: p.timestamp || null, post_url: enlaceDelPost(p, sc) }
  var out = []
  if (p.displayUrl) {
    var esCarrusel = String(p.type || '').toLowerCase() === 'sidecar' || hijas.length > 0
    // la portada de un carrusel es la imagen de su primer hijo: su medio es el del primer hijo
    var medioPortada = esCarrusel && hijas.length ? aMedio(hijas[0].type, hijas[0].productType) : aMedio(p.type, p.productType)
    out.push(Object.assign({ post_id: sc, tipo: 'post_' + String(p.type || '').toLowerCase(), src: p.displayUrl, posicion: esCarrusel ? 'portada' : 'unica', indice: 0, medio: medioPortada }, base))
  }
  hijas.forEach(function (c, i) {
    if (c && c.displayUrl) out.push(Object.assign({ post_id: sc + '-c' + (i + 1), tipo: 'post_hijo', src: c.displayUrl, posicion: 'hijo-' + (i + 1), indice: i + 1, medio: aMedio(c.type, c.productType) }, base))
  })
  return out
}

// ───────────────────────────── huella del archivo (SHA-256 puro · sin `require`) ─────────────────────────────
var K256 = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]
function sha256Hex(bytes) {
  var n = bytes.length
  var total = (((n + 9 + 63) >> 6) << 6)
  var m = new Uint8Array(total)
  for (var i = 0; i < n; i++) m[i] = bytes[i]
  m[n] = 0x80
  var bits = n * 8
  var hi = Math.floor(bits / 4294967296)
  var lo = bits >>> 0
  m[total - 8] = (hi >>> 24) & 255; m[total - 7] = (hi >>> 16) & 255; m[total - 6] = (hi >>> 8) & 255; m[total - 5] = hi & 255
  m[total - 4] = (lo >>> 24) & 255; m[total - 3] = (lo >>> 16) & 255; m[total - 2] = (lo >>> 8) & 255; m[total - 1] = lo & 255
  var H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]
  var w = new Array(64)
  var rotr = function (x, k) { return (x >>> k) | (x << (32 - k)) }
  for (var off = 0; off < total; off += 64) {
    for (var t = 0; t < 16; t++) w[t] = ((m[off + 4 * t] << 24) | (m[off + 4 * t + 1] << 16) | (m[off + 4 * t + 2] << 8) | m[off + 4 * t + 3]) >>> 0
    for (t = 16; t < 64; t++) {
      var s0 = rotr(w[t - 15], 7) ^ rotr(w[t - 15], 18) ^ (w[t - 15] >>> 3)
      var s1 = rotr(w[t - 2], 17) ^ rotr(w[t - 2], 19) ^ (w[t - 2] >>> 10)
      w[t] = (w[t - 16] + s0 + w[t - 7] + s1) >>> 0
    }
    var a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7]
    for (t = 0; t < 64; t++) {
      var S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)
      var ch = (e & f) ^ (~e & g)
      var t1 = (h + S1 + ch + K256[t] + w[t]) >>> 0
      var S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)
      var maj = (a & b) ^ (a & c) ^ (b & c)
      var t2 = (S0 + maj) >>> 0
      h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0
    }
    H[0] = (H[0] + a) >>> 0; H[1] = (H[1] + b) >>> 0; H[2] = (H[2] + c) >>> 0; H[3] = (H[3] + d) >>> 0
    H[4] = (H[4] + e) >>> 0; H[5] = (H[5] + f) >>> 0; H[6] = (H[6] + g) >>> 0; H[7] = (H[7] + h) >>> 0
  }
  return H.map(function (x) { return ('00000000' + x.toString(16)).slice(-8) }).join('')
}

// ───────────────────────────── el viaje de cada foto hacia el productor ─────────────────────────────
function fechaCorta(iso) { return iso ? String(iso).slice(0, 10) : null }
var NOMBRE_MEDIO = { imagen: 'imagen', video: 'video (cuadro)', reel: 'reel (cuadro de portada)', logo: 'logo' }
function nombreDePosicion(f) {
  if (f.posicion === 'portada') return 'portada de carrusel'
  if (/^hijo-/.test(String(f.posicion || ''))) return 'carrusel · foto ' + Number(String(f.posicion).slice(5))
  return 'publicación'
}
function esLogo(f) { return /^logo/.test(String(f.tipo || '')) || /^logo/.test(String(f.post_id || '')) }
function tieneProducto(f) { return Array.isArray(f.producto) ? f.producto.length > 0 : typeof f.producto === 'string' && f.producto.trim() !== '' }
function productosDe(f) { return Array.isArray(f.producto) ? f.producto : typeof f.producto === 'string' && f.producto.trim() ? [f.producto.trim()] : [] }

/**
 * Clasifica TODAS las fotos del cliente frente al producto del brief. Nada se esconde: cada foto vive con su rol.
 *   filas = filas de `client_social_images` (con caption · posted_at · post_url · posicion · medio · producto · producto_fuente · duplicado_de)
 *   opciones = { producto (entrada de `productoDelBrief` o null) | protagonista (texto, sólo pruebas), catalogo, excluir, maxImagenes }
 * Roles: producto_del_brief · otro_producto · no_identificado · marca (logo) · sin_regla (el brief no nombra un producto: no hay contra qué comparar)
 */
function clasificarFotos(filas, opciones) {
  var o = opciones || {}
  var prot = o.producto !== undefined ? o.producto : entradaDeProtagonista(o.protagonista, o.excluir)
  var catalogo = o.catalogo || []
  var max = o.maxImagenes || 20
  var duplicadas = []
  var vivas = []
  ;(filas || []).forEach(function (f) { if (f && f.duplicado_de) duplicadas.push(f.id); else if (f) vivas.push(f) })
  var todasLasEntradas = catalogo.filter(function (e) { return !prot || e.raices.slice().sort().join('|') !== prot.raices.slice().sort().join('|') })
  if (prot) todasLasEntradas = todasLasEntradas.concat([prot])
  var fotos = vivas.map(function (f) {
    var texto = f.caption || ''
    var dueno = f.producto_fuente === 'dueno' && tieneProducto(f)
    var producto, fuente, esElDelBrief
    var viaTexto = null
    if (dueno) {
      producto = productosDe(f)
      fuente = 'dueno'
      esElDelBrief = !!prot && producto.some(function (n) { return raicesDe(n, o.excluir).some(function (r) { return prot.raices.indexOf(r) !== -1 }) })
    } else {
      // el producto del brief cuenta aunque no esté en el catálogo del plan · el cuerpo del texto manda sobre las etiquetas
      var n = nombrados(todasLasEntradas, texto)
      viaTexto = n.via
      producto = n.entradas.map(function (e) { return e.nombre })
      fuente = producto.length ? 'caption' : 'desconocido'
      esElDelBrief = !!prot && n.entradas.some(function (e) { return e === prot })
    }
    var rol
    if (f.producto_fuente === 'conflicto') rol = 'no_identificado'
    else if (esLogo(f)) rol = 'marca'
    else if (!prot) rol = 'sin_regla'
    else if (producto.length > 1) rol = 'varios_productos' // el texto nombra varios platos: no se sabe cuál muestra la foto · NO sirve de referencia
    else if (esElDelBrief) rol = 'producto_del_brief'
    else if (producto.length) rol = 'otro_producto'
    else rol = 'no_identificado'
    return {
      id: f.id || null, url: f.url, tipo: f.tipo || null, post_id: f.post_id || null,
      fecha: fechaCorta(f.posted_at), enlace: f.post_url || null, texto: f.caption || null,
      posicion: f.posicion || null, medio: esLogo(f) ? 'logo' : f.medio || null,
      producto: producto, producto_fuente: f.producto_fuente === 'conflicto' ? 'conflicto' : fuente, via: dueno ? 'dueno' : viaTexto, rol: rol,
    }
  })
  // el producto del brief va primero (si hay que recortar, no se pierde la foto que importa) · dentro de cada rol, el orden de entrada (las más nuevas primero)
  var peso = { producto_del_brief: 0, sin_regla: 1, no_identificado: 2, varios_productos: 2, otro_producto: 3, marca: 4 }
  var ordenadas = fotos.map(function (f, i) { return { f: f, i: i } }).sort(function (a, b) { return peso[a.f.rol] - peso[b.f.rol] || a.i - b.i }).map(function (x) { return x.f })
  var enviadas = ordenadas.slice(0, max)
  var no_enviadas = ordenadas.slice(max).map(function (f) { return f.id || f.post_id })
  enviadas.forEach(function (f, i) { f.ref = 'F' + ('0' + (i + 1)).slice(-2); f.label = etiquetaDeFoto(f) })
  var reglaActiva = !!prot
  return {
    regla_activa: reglaActiva,
    producto_del_brief: prot ? prot.nombre : null,
    raices_del_producto: prot ? prot.raices : [],
    fotos: enviadas, no_enviadas: no_enviadas, duplicadas_ocultas: duplicadas,
    de_referencia: enviadas.filter(function (f) { return f.rol === 'producto_del_brief' }).map(function (f) { return f.ref }),
    sin_foto_del_producto: reglaActiva && !enviadas.some(function (f) { return f.rol === 'producto_del_brief' }),
  }
}

/** ≤ 80 caracteres (el límite del corredor): «F08 · 2025-10-12 · ES el producto: pizza» */
function etiquetaDeFoto(f) {
  var quien = f.rol === 'producto_del_brief' ? 'ES el producto'
    : f.rol === 'otro_producto' ? 'NO es el producto: ' + productosDe(f).join(' + ')
    : f.rol === 'no_identificado' ? 'producto sin identificar'
    : f.rol === 'varios_productos' ? 'varios productos en el texto'
    : f.rol === 'marca' ? 'logo de la marca'
    : (NOMBRE_MEDIO[f.medio] || 'foto')
  var debil = f.via === 'etiqueta' && (f.rol === 'producto_del_brief' || f.rol === 'otro_producto') ? ' (sólo #etiqueta)' : ''
  return (f.ref + ' · ' + (f.fecha || 's/f') + ' · ' + quien + debil).slice(0, 80)
}

/** el bloque B del pedido: CADA foto con su texto, fecha y enlace · y la regla del producto */
function bloqueDeFotos(clasif, nombre) {
  var fotos = clasif.fotos
  if (!fotos.length) {
    return ['B) LAS FOTOS REALES DEL NEGOCIO. Para este cliente NO hay fotos propias disponibles. No las inventes: escribe el prompt de imagen solo desde el brief y declara en',
      '   «no_pude_cumplir» que no hubo fotos reales de apoyo. En «foto_referencia» pon null.'].join('\n')
  }
  var L = ['B) LAS FOTOS REALES DEL NEGOCIO. Van adjuntas a este mensaje: son ' + fotos.length + ' foto' + (fotos.length === 1 ? '' : 's') + ' propias de ' + nombre + '. Cada una lleva una clave (F01, F02…): la clave está en la etiqueta de la foto.',
    '   Aquí abajo está TODO lo que el sistema sabe de cada una: de qué publicación sale, cuándo, el texto con que el dueño la publicó y qué producto nombra ese texto.']
  fotos.forEach(function (f) {
    var donde = f.medio === 'logo' ? 'logo de la marca' : (NOMBRE_MEDIO[f.medio] || 'foto') + ' · ' + nombreDePosicion(f)
    var que = f.rol === 'producto_del_brief' ? 'ES el producto del brief'
      : f.rol === 'otro_producto' ? 'NO es el producto del brief (el texto nombra: ' + productosDe(f).join(' + ') + ')'
      : f.rol === 'no_identificado' ? 'el texto no nombra un producto: NO se sabe qué plato es'
      : f.rol === 'varios_productos' ? 'el texto nombra varios productos (' + productosDe(f).join(' + ') + '): NO se sabe cuál muestra la foto'
      : f.rol === 'marca' ? 'logo'
      : 'sin regla de producto'
    L.push('   ' + f.ref + ' · ' + donde + ' · ' + (f.fecha || 'sin fecha') + (f.enlace ? ' · ' + f.enlace : '') + ' · texto de la publicación: ' + (f.texto ? '«' + limpiar(f.texto, 240) + '»' : '(sin texto)') + ' · ' + que + ' (según ' + (f.producto_fuente === 'dueno' ? 'el dueño' : f.producto_fuente === 'caption' ? (f.via === 'etiqueta' ? 'una #etiqueta: el cuerpo del texto NO lo dice · evidencia débil' : 'el texto de la publicación') : 'nadie') + ')')
  })
  if (clasif.no_enviadas.length) L.push('   (No caben ' + clasif.no_enviadas.length + ' foto(s) más en este pedido: ' + clasif.no_enviadas.join(', ') + ')')
  if (!clasif.regla_activa) {
    L.push('   Míralas todas ANTES de escribir el prompt de imagen. Describe solo lo que de verdad se ve. No inventes elementos que no aparezcan. En «foto_referencia» pon la clave de la foto que usaste de referencia y por qué (o null si no usaste ninguna).')
  } else if (clasif.sin_foto_del_producto) {
    L.push('   🔴 NO HAY NINGUNA FOTO DEL PRODUCTO DE ESTE BRIEF («' + clasif.producto_del_brief + '»). Las fotos de arriba son de OTROS platos o de ningún plato: PROHIBIDO armar el prompt mirando una foto de otro producto y llamarlo «' + clasif.producto_del_brief + '».',
      '   · Si el brief dice que la imagen es del cliente (fuente «cliente»): deja «prompt_imagen» VACÍO, «foto_referencia» en null y declara el hueco en «no_pude_cumplir» («no hay foto del producto»).',
      '   · Si el brief dice «generada»: escribe el prompt SOLO desde el texto del brief (sin copiar nada de las fotos de otros platos), «foto_referencia» en null y declara que no hay foto real del producto.')
  } else {
    L.push('   El producto de este brief es «' + clasif.producto_del_brief + '». Como REFERENCIA del producto solo puedes usar las fotos marcadas «ES el producto» (' + clasif.de_referencia.join(', ') + ').',
      '   Las demás son contexto de marca o de lugar: NO copies su plato ni lo describas como si fuera «' + clasif.producto_del_brief + '». En el prompt de imagen describe solo lo que de verdad se ve en la foto de referencia.',
      '   En «foto_referencia» pon la clave de la foto que usaste y por qué (una frase).')
  }
  return L.join('\n')
}

// ───────────────────────────── el chequeo (determinista · sin modelo) ─────────────────────────────
/** La clave de foto que declara la pieza: «F08» o { foto: 'F08', por_que } · null si declaró «ninguna» */
function fotoDeclarada(pieza) {
  var v = pieza && pieza.foto_referencia
  var s = v && typeof v === 'object' ? v.foto : v
  s = typeof s === 'string' ? s.trim().toUpperCase() : ''
  return /^F\d{2}$/.test(s) ? s : null
}
function nombraProducto(texto, catalogo, prot) {
  var r = raicesDe(texto, [])
  var otros = (catalogo || []).filter(function (e) { return !prot || e.nombre !== prot.nombre }).filter(function (e) { return e.raices.some(function (x) { return r.indexOf(x) !== -1 }) })
  var propio = !!prot && prot.raices.some(function (x) { return r.indexOf(x) !== -1 })
  return { otros: otros.map(function (e) { return e.nombre }), propio: propio }
}
/**
 * `ctx` = { regla_activa, sin_foto_del_producto, producto_del_brief, raices_del_producto, fotos: [{ref, rol, producto}], catalogo }
 * Devuelve [{ chequeo, detalle, fatal }]. Los FATALES son los tres que dejan pasar un plato por otro.
 */
function chequearFotoReferencia(pieza, ctx, brief) {
  var h = []
  if (!ctx || !ctx.regla_activa) return h
  var falla = function (chequeo, detalle, fatal) { h.push({ chequeo: chequeo, detalle: detalle, fatal: fatal === true }) }
  var tipo = sinTildes(brief && brief.tipo_de_pieza)
  if (tipo !== 'imagen' && tipo !== 'carrusel') return h
  var prompt = String((pieza && pieza.prompt_imagen) || '')
  var fuente = String((pieza && pieza.fuente_imagen) || '')
  var ref = fotoDeclarada(pieza)
  var foto = ref ? (ctx.fotos || []).filter(function (f) { return f.ref === ref })[0] : null
  var prot = { nombre: ctx.producto_del_brief, raices: ctx.raices_del_producto || [] }
  if (ref && !foto) falla('foto_referencia_inexistente', 'la pieza declara la foto «' + ref + '» de referencia y esa clave no existe entre las fotos que se le dieron')
  if (foto && foto.rol === 'otro_producto') falla('foto_referencia_de_otro_producto', 'la foto de referencia declarada (' + ref + ') muestra «' + (foto.producto || []).join(' + ') + '» y el producto del brief es «' + ctx.producto_del_brief + '»', true)
  else if (foto && (foto.rol === 'no_identificado' || foto.rol === 'varios_productos')) falla('foto_referencia_sin_producto_identificado', 'la foto de referencia declarada (' + ref + ') no tiene un producto identificado: el sistema no puede comprobar que sea «' + ctx.producto_del_brief + '»')
  if (ctx.sin_foto_del_producto && fuente === 'cliente' && prompt.trim()) falla('prompt_sin_foto_del_producto', 'no hay ninguna foto de «' + ctx.producto_del_brief + '», la fuente de la imagen es «cliente» y la pieza trae un prompt: se armó sobre la foto de otro producto', true)
  if (!ctx.sin_foto_del_producto && fuente === 'cliente' && prompt.trim() && !ref) falla('foto_referencia_no_declarada', 'la imagen es del cliente y la pieza no declara qué foto usó de referencia')
  if (ctx.sin_foto_del_producto) {
    var declaro = (pieza && Array.isArray(pieza.no_pude_cumplir) ? pieza.no_pude_cumplir : []).some(function (x) { return /foto/i.test(String(x)) })
    if (!declaro) falla('hueco_de_foto_no_declarado', 'no hay foto del producto del brief y la pieza no lo declara en «no_pude_cumplir»')
  }
  // el prompt nombra OTRO producto del cliente y no el del brief
  if (prompt.trim()) {
    var n = nombraProducto(prompt, ctx.catalogo, prot)
    if (n.otros.length && !n.propio) falla('prompt_nombra_otro_producto', 'el prompt de imagen nombra «' + n.otros.join(' + ') + '» y no el producto del brief («' + ctx.producto_del_brief + '»)', true)
  }
  return h
}

// ───────────────────────────── la pasada de VISIÓN · DISEÑADA Y APAGADA ─────────────────────────────
// 🔴 NO se construye con gasto (encargo Lenovo punto 3): requiere el GO de Emilio. Este módulo NO tiene red ni llamada a ningún modelo: sólo el CONTRATO y la regla de combinación,
// para que cuando haya GO la pasada sea enchufar un ejecutor y no rediseñar. Sin autorización explícita, `planDeVision` devuelve «apagada» y NO prepara ningún pedido.
//
// Diseño: una llamada pequeña por foto (UNA vez por huella: la misma imagen no se paga dos veces) que responde CONTRA EL CATÁLOGO del cliente (los productos de su plan), no contra una lista fija de platos:
//   entrada  → { foto: url del bucket, catalogo: [nombres de producto del cliente] }
//   salida   → { producto: <un nombre del catálogo> | 'ninguno' | 'no_se', seguridad: 0..1 }
// Combinación con el texto del post (`combinarFuentes`): el dueño GANA · texto y visión de acuerdo ⇒ 'caption' (con la visión de respaldo) · sólo uno habla ⇒ ése · chocan ⇒ 'conflicto' y NO se usa.
var VISION_ENCENDIDA = false
function planDeVision(filas, catalogo, autorizacion) {
  var pendientes = (filas || []).filter(function (f) { return f && !f.duplicado_de && !esLogo(f) && f.producto_fuente !== 'dueno' && f.producto_fuente !== 'vision' && !tieneProducto(f) })
  if (VISION_ENCENDIDA !== true || !autorizacion || autorizacion.go_emilio !== true) {
    return { estado: 'apagada', motivo: 'la pasada de visión requiere el GO de Emilio (gasto por foto) · no se prepara ningún pedido', pendientes: pendientes.length, pedidos: [] }
  }
  return { estado: 'autorizada_sin_ejecutor', pendientes: pendientes.length, pedidos: pendientes.map(function (f) { return { id: f.id, url: f.url, catalogo: (catalogo || []).map(function (e) { return e.nombre }) } }) }
}
/** { producto: [nombres], fuente } de lo que dicen el texto del post (`caption`), la visión (`vision`) y el dueño (`dueno`) · cada uno es { producto: [nombres] } o null */
function combinarFuentes(caption, vision, dueno) {
  var norm = function (v) { return v && Array.isArray(v.producto) ? v.producto.map(function (x) { return String(x).toLowerCase().trim() }).filter(Boolean).sort() : [] }
  var d = norm(dueno), c = norm(caption), v = norm(vision)
  if (d.length) return { producto: dueno.producto, fuente: 'dueno' }
  if (c.length && v.length) return c.join('|') === v.join('|') ? { producto: caption.producto, fuente: 'caption' } : { producto: [], fuente: 'conflicto' }
  if (c.length) return { producto: caption.producto, fuente: 'caption' }
  if (v.length) return { producto: vision.producto, fuente: 'vision' }
  return { producto: [], fuente: 'desconocido' }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    sinTildes: sinTildes, raicesDe: raicesDe, excluirDe: excluirDe, sinNegaciones: sinNegaciones,
    entradaDeProtagonista: entradaDeProtagonista, catalogoDeProtagonistas: catalogoDeProtagonistas, productoDelBrief: productoDelBrief, alternativasDelBrief: alternativasDelBrief, catalogoDelBrief: catalogoDelBrief, productoDeTexto: productoDeTexto,
    contextoDePost: contextoDePost, aMedio: aMedio, sha256Hex: sha256Hex,
    clasificarFotos: clasificarFotos, etiquetaDeFoto: etiquetaDeFoto, bloqueDeFotos: bloqueDeFotos, fotoDeclarada: fotoDeclarada, chequearFotoReferencia: chequearFotoReferencia, planDeVision: planDeVision, combinarFuentes: combinarFuentes,
  }
}
