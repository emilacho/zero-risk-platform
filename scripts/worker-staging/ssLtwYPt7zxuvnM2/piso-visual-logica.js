// EL NODO VISUAL, DENTRO DEL CIMIENTO, ANTES DEL PROMOTE · CC#1 · 2026-09-26 · §144 Emilio.
// Lógica PURA (sin `this`, sin red, sin `require` fuera de este archivo): las decisiones que
// se pueden probar a costo cero. El pegamento que llama a la base y al modelo vive en
// `nodo-visual-piso.js`; el constructor los junta letra por letra en `construir-nodo-visual.mjs`.
//
// Qué resuelve, y por qué (medido, no supuesto):
//  · R6 (el material de competidores nunca sale en una pieza) · MEDIDO el 26-sep: `apify_raw` guarda
//    el Instagram PROPIO y el de los COMPETIDORES bajo el MISMO `apify_function: instagram_scraper` —
//    a diferencia del sitio, que sí tiene un rótulo aparte (`website_content_scraper` vs
//    `competitor_website_scraper`). Tomar «la fila más reciente» sin filtrar trae, en la corrida real
//    de este cliente, la del competidor «lacasadelencebollado» (más nueva que la propia). Por eso
//    `esInstagramPropio` compara `params` contra `clients.config.apify.own_handles.instagram`.
//  · R3/R4 (declarar la muestra · lo no observado se declara, no se rellena) · MEDIDO por CC#2 el
//    26-sep: dos corridas idénticas **nunca** escribieron «desconocido», aunque el pedido lo permitía.
//    Por eso la muestra la arma ESTE código, siempre, con los números reales — nunca el modelo.
//  · No inventar la capa gráfica · las respuestas del modelo se filtran contra la lista de colores y
//    tipografías que el sitio declaró de verdad (cable ②): un color o una tipografía que el modelo
//    proponga y no esté en esa lista se descarta, no se guarda.
//  · R5 (ninguna prueba de percepción lleva `client_id`) · si el recibo delata `brain_hit:true`, la
//    corrida se descarta (no se guardan capa_producto ni reglas), tal como pide el diseño.

var MAX_FOTOS_A_MIRAR = 6

/** «@naufrago.ec» · «https://instagram.com/naufrago.ec/» · «naufrago.ec» → todo a "naufrago.ec". */
function normalizarHandle(h) {
  return String(h || '')
    .trim()
    .toLowerCase()
    .replace(/^@/, '')
    .replace(/^https?:\/\/(www\.)?instagram\.com\//, '')
    .replace(/\/.*$/, '')
}

/**
 * ¿Esta fila de `apify_raw` (apify_function = instagram_scraper) es del PROPIO cliente?
 * `params` trae `directUrls` · `usernames` · `startUrls`, según qué llamador armó el cuerpo.
 */
function esInstagramPropio(params, ownHandleRaw) {
  var own = normalizarHandle(ownHandleRaw)
  if (!own) return { propio: false, motivo: 'la ficha no declara config.apify.own_handles.instagram' }
  var p = params || {}
  var candidatos = []
    .concat(p.directUrls || [])
    .concat(p.usernames || [])
    .concat((p.startUrls || []).map(function (u) { return typeof u === 'string' ? u : u && u.url }))
    .filter(Boolean)
    .map(normalizarHandle)
  if (!candidatos.length) return { propio: false, motivo: 'la fila no declara directUrls/usernames/startUrls legibles' }
  var propio = candidatos.indexOf(own) !== -1
  return { propio: propio, motivo: propio ? null : 'apunta a ' + candidatos.join(',') + ' · no a ' + own }
}

/** Clasifica los posts de una fila de instagram_scraper en foto (sin video) y video, con su rango de fechas. */
function clasificarPosts(latestPosts) {
  var posts = Array.isArray(latestPosts) ? latestPosts : []
  var foto = posts.filter(function (p) { return p && !p.videoUrl })
  var video = posts.filter(function (p) { return p && p.videoUrl })
  var fechas = posts.map(function (p) { return p && p.timestamp }).filter(Boolean).sort()
  return {
    total: posts.length,
    foto: foto,
    video: video,
    fecha_mas_vieja: fechas[0] || null,
    fecha_mas_nueva: fechas[fechas.length - 1] || null,
  }
}

/** Elige hasta `tope` fotos (nunca video) para mirar · las más recientes primero. */
function elegirFotos(fotos, tope) {
  return (fotos || [])
    .slice()
    .sort(function (a, b) { return String((b && b.timestamp) || '').localeCompare(String((a && a.timestamp) || '')) })
    .slice(0, tope)
}

/** La muestra declarada · SIEMPRE por código, nunca por el modelo (R3 · R4). */
function armarMuestra(clasif, fotosElegidas, tieneLogo) {
  var no_observado = []
  if (clasif.video.length) no_observado.push(clasif.video.length + ' publicaciones de video no se analizaron (el modelo sólo ve imágenes)')
  var noMiradas = clasif.foto.length - fotosElegidas.length
  if (noMiradas > 0) no_observado.push(noMiradas + ' fotos disponibles no se miraron (tope de la corrida)')
  no_observado.push('otras redes del cliente (TikTok, Facebook, YouTube) no se incluyeron en esta derivación')
  no_observado.push('material de competidores excluido a propósito (R6): no se mira, no puede salir en una pieza')
  if (!tieneLogo) no_observado.push('no se encontró una foto de perfil propia para usar como logo')
  return {
    piezas_totales_en_el_feed: clasif.total,
    fotos_totales: clasif.foto.length,
    videos_totales: clasif.video.length,
    fotos_miradas: fotosElegidas.length,
    fecha_mas_vieja: clasif.fecha_mas_vieja,
    fecha_mas_nueva: clasif.fecha_mas_nueva,
    no_observado: no_observado,
  }
}

/** El pedido al empleado · capa gráfica declarada como TEXTO (nunca imagen) + las fotos como IMÁGENES. */
function armarPedido(capaGraficaCruda, fotosElegidas, logoUrl) {
  var colores = (capaGraficaCruda.colores || []).map(function (c, i) { return (i + 1) + '. ' + c }).join('\n') || '(el sitio no declara colores)'
  var tipografias = (capaGraficaCruda.tipografias || []).map(function (t, i) { return (i + 1) + '. ' + t }).join('\n') || '(el sitio no declara tipografías)'
  var task = [
    'Sos un director de arte de marca. Vas a mirar fotos reales del negocio y vas a construir el piso visual de su manual de marca.',
    '',
    '## Capa gráfica que el sitio declara (colores y tipografías, por frecuencia de aparición)',
    'Colores:',
    colores,
    '',
    'Tipografías:',
    tipografias,
    '',
    (logoUrl ? 'La primera imagen es la foto de perfil / el logo.' : 'No hay foto de perfil disponible.') +
      ' Las siguientes son fotos reales del producto o del negocio, en orden.',
    '',
    'Respondé EXCLUSIVAMENTE con un bloque JSON (nada de texto antes ni después), con esta forma exacta:',
    '{',
    '  "capa_grafica": {',
    '    "paleta": [ {"color": "<uno de los colores de arriba, EXACTO>", "rol": "principal|secundario|acento"} ],',
    '    "tipografias": [ {"nombre": "<una de las tipografías de arriba, EXACTA>", "rol": "titulos|cuerpo"} ]',
    '  },',
    '  "capa_producto": {',
    '    "paleta_observada": ["..."],',
    '    "luz": "...",',
    '    "encuadre": "...",',
    '    "que_aparece": ["..."],',
    '    "que_no_aparece": ["..."]',
    '  },',
    '  "reglas": {',
    '    "debe": ["...", "...", "..."],',
    '    "no_debe": ["...", "..."],',
    '    "capa_que_manda": {',
    '      "foto_de_producto": "producto",',
    '      "placa_logo_o_titulo": "grafica",',
    '      "anuncio_con_texto_encima": "declará cuál gobierna qué, en una frase"',
    '    }',
    '  }',
    '}',
    '',
    'Reglas para responder: describí SOLO lo que ves en las fotos que te mando — si algo no se puede saber con estas fotos (por ejemplo si la luz es SIEMPRE así en todo el feed), no lo generalices como regla absoluta de la marca: describí lo que ves en ESTAS fotos. Para capa_grafica, elegí SOLO colores y tipografías de las listas de arriba — nunca inventes uno nuevo.',
  ].join('\n')
  var images = []
  if (logoUrl) images.push({ url: logoUrl, label: 'foto de perfil / logo de la marca' })
  for (var i = 0; i < fotosElegidas.length; i++) {
    var p = fotosElegidas[i]
    images.push({ url: p.displayUrl, label: 'post de ' + String(p.timestamp || 'fecha desconocida').slice(0, 10) })
  }
  return { task: task, images: images }
}

/** Extrae el bloque JSON de la respuesta · sin bloque o sin las dos claves esenciales ⇒ no legible (nunca se inventa). */
function parseRespuesta(texto) {
  var s = String(texto || '')
  var m = s.match(/\{[\s\S]*\}/)
  if (!m) return { legible: false, motivo: 'sin bloque JSON en la respuesta' }
  var j
  try {
    j = JSON.parse(m[0])
  } catch (e) {
    return { legible: false, motivo: 'JSON inválido: ' + e.message }
  }
  if (!j || typeof j !== 'object' || !j.capa_producto || !j.reglas) {
    return { legible: false, motivo: 'faltan capa_producto o reglas en el JSON' }
  }
  return { legible: true, datos: j }
}

/**
 * PLAN DE COPIA PROPIA (29-sep): las fotos que mira el modelo son NUESTRAS copias (bucket público
 * client-social-images, tabla client_social_images), no el enlace de Instagram (caduca y el borde de
 * Instagram le corta la conexión al corredor de Railway). NUNCA se cae al enlace de Instagram: si falta la
 * copia de algo que se iba a mirar, se DECLARA con su causa exacta y no se llama al modelo.
 */
function resolverCopias(copias, tieneLogo, fotosElegidas) {
  var porPost = {}
  ;(copias || []).forEach(function (c) { if (c && c.post_id) porPost[c.post_id] = c })
  var faltan = []
  function buscar(id, etiqueta) {
    var c = porPost[id]
    if (c && c.estado === 'ok' && c.url) return c.url
    faltan.push(etiqueta + ' → ' + (c ? 'no se pudo copiar · ' + (c.causa || 'sin causa registrada') : 'sin copia guardada'))
    return null
  }
  var logoUrl = tieneLogo ? buscar('logo-hd', 'logo') : null
  var fotos = []
  for (var i = 0; i < fotosElegidas.length; i++) {
    var p = fotosElegidas[i]
    var url = buscar(String(p.shortCode || p.id), 'post ' + (p.shortCode || p.id))
    if (url) fotos.push(Object.assign({}, p, { displayUrl: url }))
  }
  return { logoUrl: logoUrl, fotos: fotos, faltan: faltan }
}

/**
 * Compone el piso visual completo. `invocarModelo({task,images}) => Promise<{response, brain_hit}>`
 * se inyecta para que esta función sea pura y testeable a costo cero (sin red real).
 */
function derivarPisoVisual(ctx, invocarModelo) {
  var visual = {
    version: 1,
    capa_grafica: { paleta: [], tipografias: [], logo_url: null },
    capa_producto: null,
    reglas: null,
    muestra: null,
    brain_hit: null,
    legible: null,
    error: null,
    nota: null,
  }
  var siteVisual = (ctx.filaSitio && ctx.filaSitio.respuesta && ctx.filaSitio.respuesta[0] && ctx.filaSitio.respuesta[0]._visual) || null
  var coloresCrudos = (siteVisual && siteVisual.colores) || []
  var tipografiasCrudas = (siteVisual && siteVisual.tipografias) || []
  if (!ctx.filaSitio) visual.error = agregar(visual.error, 'sin fila de website_content_scraper para este cliente')

  var post0 = null
  if (ctx.filaInstagram) {
    var chequeo = esInstagramPropio(ctx.filaInstagram.params, ctx.ownInstagramHandle)
    if (chequeo.propio) post0 = (ctx.filaInstagram.respuesta || [])[0] || null
    else visual.error = agregar(visual.error, 'INSTAGRAM_NO_ES_PROPIO · ' + chequeo.motivo)
  } else {
    visual.error = agregar(visual.error, 'sin fila de instagram_scraper propia para este cliente')
  }

  var logoOriginal = post0 ? post0.profilePicUrlHD || post0.profilePicUrl || null : null
  var logoUrl = logoOriginal

  var clasif = post0 ? clasificarPosts(post0.latestPosts) : { total: 0, foto: [], video: [], fecha_mas_vieja: null, fecha_mas_nueva: null }
  var fotosElegidas = elegirFotos(clasif.foto, MAX_FOTOS_A_MIRAR)
  visual.muestra = armarMuestra(clasif, fotosElegidas, !!logoOriginal)

  if (!logoOriginal && fotosElegidas.length === 0) {
    visual.nota = 'sin material visual propio (ni logo ni fotos de producto) · capa del producto y reglas NO derivadas · R7'
    return Promise.resolve(visual)
  }

  var copiasOk = resolverCopias(ctx.copias, !!logoOriginal, fotosElegidas)
  if (copiasOk.faltan.length) {
    visual.error = agregar(visual.error, 'FOTOS_SIN_COPIA · ' + copiasOk.faltan.join(' | ') + ' · no se llamó al modelo (no se usa el enlace de Instagram)')
    return Promise.resolve(visual)
  }
  logoUrl = copiasOk.logoUrl
  visual.capa_grafica.logo_url = logoUrl

  var armado = armarPedido({ colores: coloresCrudos, tipografias: tipografiasCrudas }, copiasOk.fotos, logoUrl)
  return Promise.resolve(invocarModelo({ task: armado.task, images: armado.images })).then(function (resp) {
    visual.brain_hit = resp && resp.brain_hit === true
    if (visual.brain_hit) {
      visual.legible = false
      visual.error = agregar(visual.error, 'CEREBRO_ENCENDIDO_SIN_CLIENT_ID · corrida descartada (R5)')
      return visual
    }
    var parsed = parseRespuesta(resp && resp.response)
    visual.legible = parsed.legible
    if (!parsed.legible) {
      visual.error = agregar(visual.error, 'RESPUESTA_NO_LEGIBLE · ' + parsed.motivo)
      return visual
    }
    var paleta = (parsed.datos.capa_grafica && parsed.datos.capa_grafica.paleta) || []
    var tipos = (parsed.datos.capa_grafica && parsed.datos.capa_grafica.tipografias) || []
    visual.capa_grafica.paleta = paleta.filter(function (p) { return p && coloresCrudos.indexOf(p.color) !== -1 })
    visual.capa_grafica.tipografias = tipos.filter(function (t) { return t && tipografiasCrudas.indexOf(t.nombre) !== -1 })
    visual.capa_producto = parsed.datos.capa_producto || null
    visual.reglas = parsed.datos.reglas || null
    return visual
  })
}

function agregar(previo, s) {
  return previo ? previo + ' · ' + s : s
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    MAX_FOTOS_A_MIRAR: MAX_FOTOS_A_MIRAR,
    normalizarHandle: normalizarHandle,
    esInstagramPropio: esInstagramPropio,
    clasificarPosts: clasificarPosts,
    elegirFotos: elegirFotos,
    armarMuestra: armarMuestra,
    armarPedido: armarPedido,
    parseRespuesta: parseRespuesta,
    resolverCopias: resolverCopias,
    derivarPisoVisual: derivarPisoVisual,
  }
}
