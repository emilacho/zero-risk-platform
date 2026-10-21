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

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// PISO VISUAL · TODAS LAS FUENTES (21-oct · ENCARGO «manual visual con todas las fuentes», firma Emilio 19:55 · T3)
// Principio: nada de rejas a UNA fuente. El piso trabaja con TODO lo real y propio que el cliente tenga
// (hoja de estilo del sitio · ficha · logo y fotos propias copiadas, de la red que sea) y cada cosa lleva su PROCEDENCIA:
//   · estado «declarado»  → lo declara el propio cliente (hoja de estilo, ficha).
//   · estado «propuesta»  → lo OBSERVA el modelo en el logo o las fotos propias; se marca, no se esconde ni se descarta.
// «No inventar» significa «solo material real y propio, con procedencia», no «solo el sitio».
// Se mantiene `derivarPisoVisual` (versión de una sola fuente) intacta; el nodo usa esta.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
/** La versión de la LÓGICA del piso: si cambia, lo ya probado vale volver a probarlo (el barrido la suma a la huella de entradas). */
var VERSION_DEL_PISO = 'piso-2026-10-21b'
var MAX_COLORES_OBSERVADOS = 5
var MAX_TIPOGRAFIAS_OBSERVADAS = 3
var RE_COLOR_HEX = /^#[0-9a-f]{6}$/

function colorHex(x) {
  var v = typeof x === 'string' ? x : x && typeof x === 'object' ? x.hex || x.color || x.valor : null
  v = typeof v === 'string' ? v.trim().toLowerCase() : ''
  return RE_COLOR_HEX.test(v) ? v : null
}
function nombreDeTipografia(x) {
  var v = typeof x === 'string' ? x : x && typeof x === 'object' ? x.family || x.nombre || x.name : null
  v = typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : ''
  return v && v.length <= 60 ? v : null
}
/**
 * Una tipografía OBSERVADA solo entra si es un NOMBRE de tipografía, no una descripción ni una duda del modelo
 * (caso real df7e47cc, 21-oct: «Impact o condensed sans-serif bold» y «no reconocida con claridad» entraron como propuestas y la oficina las habría usado como familia de letra).
 * Se rechaza lo que ofrece alternativas (« o », coma, punto y coma, barra), lo que dice que no se reconoce, y lo que no es solo letras/números/espacios/guiones (máx. 40).
 */
var RE_TIPOGRAFIA_DUDOSA = /\bo\b|[,;/]|no\s+(se\s+)?(reconoc|identific|pued|determin|lee|ve)|desconoc|ningun|n\/a|indefinid|sin\s+(tipograf|nombre)|gen[eé]ric|similar|parecid|tipo\s+/i
function nombreDeTipografiaObservada(x) {
  var n = nombreDeTipografia(x)
  if (!n || n.length > 40 || RE_TIPOGRAFIA_DUDOSA.test(n)) return null
  return /^[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ0-9 \-]*$/.test(n) ? n : null
}
/** «donde» del modelo → una procedencia CORTA y limpia: «observado en logo, foto 1, foto 3» (nunca texto de las imágenes, teléfonos ni correos). */
function procedenciaDeLoObservado(donde) {
  var t = String(donde || '').toLowerCase()
  var partes = []
  if (/logo/.test(t)) partes.push('logo')
  var re = /foto\s*(\d{1,2})/g
  var m
  var vistas = {}
  while ((m = re.exec(t)) && partes.length < 4) {
    if (!vistas[m[1]]) { vistas[m[1]] = true; partes.push('foto ' + m[1]) }
  }
  return 'observado en ' + (partes.length ? partes.join(', ') : 'el material propio')
}
/** Los números de foto que nombra un «donde» («foto 1», «foto2», «logo, foto 3»): sin repetir. */
function numerosDeFoto(donde) {
  var t = String(donde || '').toLowerCase()
  var re = /foto\s*(\d{1,2})/g
  var m
  var vistos = {}
  var out = []
  while ((m = re.exec(t))) { if (!vistos[m[1]]) { vistos[m[1]] = true; out.push(Number(m[1])) } }
  return out
}
function sinRepetidos(lista) {
  var visto = {}
  return lista.filter(function (x) { if (visto[x.valor]) return false; visto[x.valor] = true; return true })
}

/** Colores y tipografías DECLARADOS por el cliente: hoja de estilo del sitio primero, ficha después (sin repetir), cada uno con su procedencia. */
function declaradosDelCliente(filaSitio, ficha) {
  var sv = (filaSitio && filaSitio.respuesta && filaSitio.respuesta[0] && filaSitio.respuesta[0]._visual) || null
  var colores = []
  var tipos = []
  ;((sv && sv.colores) || []).forEach(function (c) { var h = colorHex(c); if (h) colores.push({ valor: h, procedencia: 'sitio:hoja_de_estilo' }) })
  ;((sv && sv.tipografias) || []).forEach(function (t) { var n = nombreDeTipografia(t); if (n) tipos.push({ valor: n, procedencia: 'sitio:hoja_de_estilo' }) })
  var f = ficha || {}
  ;(Array.isArray(f.brand_colors) ? f.brand_colors : []).forEach(function (c) { var h = colorHex(c); if (h) colores.push({ valor: h, procedencia: 'ficha' }) })
  ;(Array.isArray(f.brand_fonts) ? f.brand_fonts : []).forEach(function (t) { var n = nombreDeTipografia(t); if (n) tipos.push({ valor: n, procedencia: 'ficha' }) })
  return { colores: sinRepetidos(colores), tipografias: sinRepetidos(tipos) }
}

/**
 * Elige el material a mirar entre NUESTRAS copias de lo propio (cualquier red): el logo y hasta `tope` fotos (nunca video ni logo como foto),
 * las más recientes primero y repartidas entre las cuentas/fuentes (una por cuenta en cada vuelta) para que ninguna red se coma el cupo.
 */
function elegirMaterialPropio(copias, tope) {
  var ok = (copias || []).filter(function (c) { return c && c.estado === 'ok' && c.url && (c.owner_role === undefined || c.owner_role === 'propio') })
  var esLogoCopia = function (c) { return /^logo/.test(String(c.tipo || '')) || /^logo/.test(String(c.post_id || '')) }
  var logos = ok.filter(esLogoCopia)
  var logo = logos.filter(function (c) { return /hd/.test(String(c.post_id || '') + String(c.tipo || '')) })[0] || logos[0] || null
  var fotos = ok.filter(function (c) { return !esLogoCopia(c) && (!c.medio || c.medio === 'imagen') })
  fotos.sort(function (a, b) { return String(b.posted_at || '').localeCompare(String(a.posted_at || '')) })
  var porCuenta = {}
  var cuentas = []
  fotos.forEach(function (f) { var k = String(f.handle || ''); if (!porCuenta[k]) { porCuenta[k] = []; cuentas.push(k) } porCuenta[k].push(f) })
  var elegidas = []
  var ronda = 0
  while (elegidas.length < tope && ronda < tope) {
    for (var i = 0; i < cuentas.length && elegidas.length < tope; i++) {
      var f = porCuenta[cuentas[i]][ronda]
      if (f) elegidas.push(f)
    }
    ronda++
  }
  return { logo: logo, fotos: elegidas, fotos_disponibles: fotos.length, cuentas: cuentas }
}

/** El pedido (en tuteo): lo declarado va como TEXTO; lo observable se pide SOLO si el cliente no lo declaró. */
function armarPedidoTodasLasFuentes(declarados, material) {
  var pideColores = declarados.colores.length === 0
  var pideTipos = declarados.tipografias.length === 0
  var listaC = declarados.colores.map(function (c, i) { return (i + 1) + '. ' + c.valor }).join('\n') || '(el cliente no declara colores)'
  var listaT = declarados.tipografias.map(function (t, i) { return (i + 1) + '. ' + t.valor }).join('\n') || '(el cliente no declara tipografías)'
  var tieneLogo = !!material.logo
  var forma = [
    '{',
    '  "capa_grafica": {',
    '    "paleta": [ {"color": "<uno de los colores declarados, EXACTO>", "rol": "principal|secundario|acento"} ],',
    '    "tipografias": [ {"nombre": "<una de las tipografías declaradas, EXACTA>", "rol": "titulos|cuerpo"} ]' + (pideColores || pideTipos ? ',' : ''),
  ]
  if (pideColores) forma.push('    "colores_observados": [ {"color": "#rrggbb", "rol": "principal|secundario|acento", "donde": "logo|foto 1|foto 2|…"} ]' + (pideTipos ? ',' : ''))
  if (pideTipos) forma.push('    "tipografias_observadas": [ {"nombre": "<nombre solo si se lee con claridad>", "rol": "titulos|cuerpo", "donde": "logo|foto N"} ]')
  forma = forma.concat([
    '  },',
    '  "marcas_ajenas_vistas": [ {"donde": "foto N", "descripcion": "logo, marca o colores de un tercero que se ven en esa foto, en pocas palabras"} ],',
    '  "capa_producto": { "paleta_observada": ["..."], "luz": "...", "encuadre": "...", "que_aparece": ["..."], "que_no_aparece": ["..."] },',
    '  "reglas": { "debe": ["...", "...", "..."], "no_debe": ["...", "..."], "capa_que_manda": { "foto_de_producto": "producto", "placa_logo_o_titulo": "grafica", "anuncio_con_texto_encima": "declara cuál gobierna qué, en una frase" } }',
    '}',
  ])
  var task = [
    'Eres un director de arte de marca. Vas a mirar el material visual REAL y PROPIO del negocio (su logo y sus fotos) y vas a construir el piso visual de su manual de marca.',
    '',
    '## Lo que el cliente declara (colores y tipografías, con su procedencia)',
    'Colores:',
    listaC,
    '',
    'Tipografías:',
    listaT,
    '',
    (tieneLogo ? 'La primera imagen es el logo / la foto de perfil.' : 'No hay logo disponible.') + ' Las siguientes son fotos reales propias del negocio, en orden.',
    '',
    'Responde EXCLUSIVAMENTE con un bloque JSON (nada de texto antes ni después), con esta forma exacta:',
  ].concat(forma).concat([
    '',
    'Reglas para responder:',
    '- Describe SOLO lo que ves en las imágenes que te mando. Si algo no se puede saber con ese material, dilo en vez de generalizarlo como regla absoluta.',
    '- Los colores y tipografías DECLARADOS solo se pueden elegir de las listas de arriba, tal cual.',
    '- La paleta de marca sale sobre todo del LOGO propio. De las fotos toma solo colores y letras que sean de la propia marca (su producto, su rotulación, su ropa de trabajo).',
    '- Si en alguna foto ves un logo, una marca o colores de TERCEROS (colaboradores, competidores, proveedores, clientes, otras empresas), NO los incluyas en los colores ni en las tipografías observadas: decláralos en "marcas_ajenas_vistas" con el número de la foto donde los viste. Si no hay ninguno, deja esa lista vacía.',
    pideColores ? '- El cliente NO declara colores: propón hasta ' + MAX_COLORES_OBSERVADOS + ' colores de marca que SE VEAN en el logo o en las fotos (hex #rrggbb), diciendo en qué imagen los viste. Quedan marcados como PROPUESTA; no inventes colores que no se vean.' : '- El cliente ya declara sus colores: no propongas otros.',
    pideTipos ? '- El cliente NO declara tipografías: solo si el logo o una foto muestran un texto cuya tipografía reconoces con claridad, nómbrala (máximo ' + MAX_TIPOGRAFIAS_OBSERVADAS + ') y di dónde; si no se reconoce, deja la lista vacía. No adivines.' : '- El cliente ya declara sus tipografías: no propongas otras.',
  ]).join('\n')
  var images = []
  if (material.logo) images.push({ url: material.logo.url, label: 'logo / foto de perfil de la marca' })
  material.fotos.forEach(function (p, i) { images.push({ url: p.url, label: 'foto ' + (i + 1) + ' (' + (p.handle || 'propia') + ', ' + String(p.posted_at || 'fecha desconocida').slice(0, 10) + ')' }) })
  return { task: task, images: images, pide_colores: pideColores, pide_tipografias: pideTipos }
}

/** La muestra declarada · SIEMPRE por código (R3/R4): qué se miró, de qué cuentas, y lo que no se pudo observar. */
function armarMuestraTodasLasFuentes(material, declarados) {
  var no = []
  var sinMirar = material.fotos_disponibles - material.fotos.length
  if (sinMirar > 0) no.push(sinMirar + ' fotos propias disponibles no se miraron (tope de la corrida)')
  if (!material.logo) no.push('no hay un logo propio copiado')
  if (!material.fotos.length) no.push('no hay fotos propias copiadas')
  no.push('los videos solo cuentan por su cuadro de portada, si existe copia')
  no.push('material de competidores excluido a propósito (R6)')
  return {
    cuentas_con_fotos: material.cuentas,
    fotos_disponibles: material.fotos_disponibles,
    fotos_miradas: material.fotos.length,
    con_logo: !!material.logo,
    colores_declarados: declarados.colores.length,
    tipografias_declaradas: declarados.tipografias.length,
    no_observado: no,
  }
}

/** Lo que el manual necesita en sus columnas (`primary_colors` / `typography`), coherente con el bloque visual y con la procedencia a la vista. */
function paraElManual(capa) {
  return {
    primary_colors: (capa.paleta || []).map(function (p) { return { hex: p.color, rol: p.rol || null, procedencia: p.procedencia, estado: p.estado } }),
    typography: (capa.tipografias || []).map(function (t) { return { family: t.nombre, rol: t.rol || null, procedencia: t.procedencia, estado: t.estado } }),
  }
}

/**
 * Compone el piso visual con TODAS las fuentes propias. Nunca para la corrida y nunca calla un hueco:
 *   visual.estado = 'completo' | 'parcial' | 'ausente' y visual.motivo dice por qué (la compuerta lo declara; no pasa como «bueno»).
 * ctx: { filaSitio, ficha:{brand_colors,brand_fonts}, copias:[client_social_images propias], tope? }.  invocarModelo({task,images}) → {response, brain_hit}.
 */
function derivarPisoVisualTodasLasFuentes(ctx, invocarModelo) {
  var declarados = declaradosDelCliente(ctx.filaSitio, ctx.ficha)
  var material = elegirMaterialPropio(ctx.copias, ctx.tope || MAX_FOTOS_A_MIRAR)
  var visual = {
    version: 2,
    estado: null,
    motivo: null,
    capa_grafica: { paleta: [], tipografias: [], logo_url: material.logo ? material.logo.url : null, logo_procedencia: material.logo ? 'copia propia · ' + (material.logo.handle || 'cuenta propia') : null },
    capa_producto: null,
    reglas: null,
    muestra: armarMuestraTodasLasFuentes(material, declarados),
    marcas_ajenas: [],
    descartados_por_marca_ajena: [],
    brain_hit: null,
    legible: null,
    error: null,
    nota: null,
    para_el_manual: null,
  }
  // la capa gráfica DECLARADA entra siempre (no depende del modelo): es del cliente y tiene procedencia
  declarados.colores.slice(0, 6).forEach(function (c) { visual.capa_grafica.paleta.push({ color: c.valor, rol: null, procedencia: c.procedencia, estado: 'declarado' }) })
  declarados.tipografias.slice(0, 4).forEach(function (t) { visual.capa_grafica.tipografias.push({ nombre: t.valor, rol: null, procedencia: t.procedencia, estado: 'declarado' }) })

  function cerrar() {
    var hayColores = visual.capa_grafica.paleta.length > 0
    var hayMaterial = !!material.logo || material.fotos.length > 0
    var derivo = visual.legible === true && visual.capa_producto && visual.reglas
    if (hayColores && hayMaterial && derivo) { visual.estado = 'completo'; visual.motivo = null }
    else if (hayColores || (hayMaterial && derivo)) {
      visual.estado = 'parcial'
      var faltan = []
      if (!hayColores) faltan.push('sin colores (ni declarados ni observables)')
      if (!hayMaterial) faltan.push('sin logo ni fotos propias copiadas: la capa del producto y las reglas no se derivaron')
      else if (!derivo) faltan.push('el modelo no entregó la capa del producto y las reglas' + (visual.error ? ' (' + visual.error + ')' : ''))
      visual.motivo = faltan.join(' · ') || 'faltan datos visuales'
    } else {
      visual.estado = 'ausente'
      visual.motivo = 'visual ausente: sin colores, sin logo y sin fotos propias' + (visual.error ? ' · ' + visual.error : '')
    }
    visual.para_el_manual = paraElManual(visual.capa_grafica)
    return visual
  }

  if (!material.logo && material.fotos.length === 0) {
    visual.nota = 'sin material visual propio copiado (ni logo ni fotos) · capa del producto y reglas NO derivadas · R7'
    return Promise.resolve(cerrar())
  }
  var armado = armarPedidoTodasLasFuentes(declarados, material)
  return Promise.resolve(invocarModelo({ task: armado.task, images: armado.images })).then(function (resp) {
    visual.brain_hit = resp && resp.brain_hit === true
    if (visual.brain_hit) {
      visual.legible = false
      visual.error = agregar(visual.error, 'CEREBRO_ENCENDIDO_SIN_CLIENT_ID · corrida descartada (R5)')
      return cerrar()
    }
    var parsed = parseRespuesta(resp && resp.response)
    visual.legible = parsed.legible
    if (!parsed.legible) {
      visual.error = agregar(visual.error, 'RESPUESTA_NO_LEGIBLE · ' + parsed.motivo)
      return cerrar()
    }
    var cg = parsed.datos.capa_grafica || {}
    // roles de lo DECLARADO: solo si el modelo eligió uno de la lista declarada (exacto)
    ;(cg.paleta || []).forEach(function (p) {
      var h = colorHex(p && p.color)
      var i = visual.capa_grafica.paleta.map(function (x) { return x.color }).indexOf(h)
      if (i !== -1 && visual.capa_grafica.paleta[i].estado === 'declarado' && p.rol) visual.capa_grafica.paleta[i].rol = String(p.rol).slice(0, 20)
    })
    ;(cg.tipografias || []).forEach(function (t) {
      var n = nombreDeTipografia(t && t.nombre)
      var i = visual.capa_grafica.tipografias.map(function (x) { return x.nombre }).indexOf(n)
      if (i !== -1 && visual.capa_grafica.tipografias[i].estado === 'declarado' && t.rol) visual.capa_grafica.tipografias[i].rol = String(t.rol).slice(0, 20)
    })
    // MARCAS AJENAS (corrección de Emilio 21-oct 20:55): en las fotos propias pueden verse logos, marcas o colores de terceros (colaboradores, competidores, proveedores).
    // Se DECLARAN aparte y nada de lo que solo se vio en esas fotos entra a la paleta ni a las tipografías: lo que viene del LOGO propio sí; lo que no se puede atribuir a la marca, no.
    var ajenasCrudas = Array.isArray(parsed.datos.marcas_ajenas_vistas) ? parsed.datos.marcas_ajenas_vistas : Array.isArray(cg.marcas_ajenas_vistas) ? cg.marcas_ajenas_vistas : []
    var fotosAjenas = {}
    visual.marcas_ajenas = ajenasCrudas
      .filter(function (a) { return a && typeof a === 'object' })
      .slice(0, 6)
      .map(function (a) {
        numerosDeFoto(a.donde).forEach(function (n) { fotosAjenas[n] = true })
        return { donde: procedenciaDeLoObservado(a.donde).replace('observado en ', ''), descripcion: String(a.descripcion || '').replace(/\s+/g, ' ').trim().slice(0, 120) }
      })
    visual.marcas_ajenas.forEach(function (a) { visual.muestra.no_observado.push('marca ajena vista en ' + a.donde + (a.descripcion ? ': ' + a.descripcion : '')) })
    function esDeTercero(donde) {
      if (/logo/i.test(String(donde || ''))) return false
      var nums = numerosDeFoto(donde)
      if (!nums.length) return visual.marcas_ajenas.length > 0
      return nums.some(function (n) { return fotosAjenas[n] === true })
    }
    // lo OBSERVADO entra marcado PROPUESTA y solo si el cliente no declaró ese tipo de cosa
    if (armado.pide_colores) {
      var vistos = {}
      ;(cg.colores_observados || []).forEach(function (o) {
        var h = colorHex(o && o.color)
        if (h && esDeTercero(o && o.donde)) { visual.descartados_por_marca_ajena.push({ tipo: 'color', valor: h, donde: procedenciaDeLoObservado(o && o.donde).replace('observado en ', '') }); return }
        if (!h || vistos[h] || visual.capa_grafica.paleta.length >= MAX_COLORES_OBSERVADOS) return
        vistos[h] = true
        visual.capa_grafica.paleta.push({ color: h, rol: o.rol ? String(o.rol).slice(0, 20) : null, procedencia: procedenciaDeLoObservado(o && o.donde), estado: 'propuesta' })
      })
    }
    if (armado.pide_tipografias) {
      var vistas = {}
      ;(cg.tipografias_observadas || []).forEach(function (o) {
        var n = nombreDeTipografiaObservada(o && o.nombre)
        if (n && esDeTercero(o && o.donde)) { visual.descartados_por_marca_ajena.push({ tipo: 'tipografia', valor: n, donde: procedenciaDeLoObservado(o && o.donde).replace('observado en ', '') }); return }
        if (!n || vistas[n.toLowerCase()] || visual.capa_grafica.tipografias.length >= MAX_TIPOGRAFIAS_OBSERVADAS) return
        vistas[n.toLowerCase()] = true
        visual.capa_grafica.tipografias.push({ nombre: n, rol: o.rol ? String(o.rol).slice(0, 20) : null, procedencia: procedenciaDeLoObservado(o && o.donde), estado: 'propuesta' })
      })
    }
    visual.capa_producto = parsed.datos.capa_producto || null
    visual.reglas = parsed.datos.reglas || null
    return cerrar()
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
    derivarPisoVisualTodasLasFuentes: derivarPisoVisualTodasLasFuentes,
    declaradosDelCliente: declaradosDelCliente,
    elegirMaterialPropio: elegirMaterialPropio,
    armarPedidoTodasLasFuentes: armarPedidoTodasLasFuentes,
    armarMuestraTodasLasFuentes: armarMuestraTodasLasFuentes,
    paraElManual: paraElManual,
    nombreDeTipografiaObservada: nombreDeTipografiaObservada,
    numerosDeFoto: numerosDeFoto,
    VERSION_DEL_PISO: VERSION_DEL_PISO,
    procedenciaDeLoObservado: procedenciaDeLoObservado,
    colorHex: colorHex,
    nombreDeTipografia: nombreDeTipografia,
  }
}
