// LOS CHEQUEOS DE LA PIEZA · CC#1 · 2026-10-01 · lógica PURA (sin red, sin `this`, sin `URL`): se prueba a costo cero y se pega en el nodo ⑦.
// Por PRIMERA vez se compara lo PEDIDO (el brief) contra lo HECHO (la pieza). Son CANDIDATOS, no veredictos: «la palabra aparece» ≠ «la palabra se usa» · viajan con la pieza como aviso y decide quien aprueba.
// Sólo dos hallazgos son FATALES (la pieza queda marcada NO VÁLIDA): la respuesta ilegible y la pieza sin titular NI texto.

function normalizar(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9ñ@+.\/:_-]+/g, ' ').trim()
}
function aTexto(v) {
  if (v === null || v === undefined) return ''
  if (typeof v === 'string') return v
  if (Array.isArray(v)) return v.map(aTexto).join(' \n ')
  if (typeof v === 'object') return Object.keys(v).map(function (k) { return aTexto(v[k]) }).join(' \n ')
  return String(v)
}

/** Una comilla dentro de un texto sólo lo CIERRA si lo que sigue es estructura JSON; si no, es parte del texto y se escapa. Reparación de FORMATO, nunca de contenido · se DECLARA. */
function repararComillas(s) {
  var out = ''
  var dentro = false
  var reparadas = 0
  for (var i = 0; i < s.length; i++) {
    var ch = s[i]
    if (!dentro) { out += ch; if (ch === '"') dentro = true; continue }
    if (ch === '\\') { out += ch + (s[i + 1] === undefined ? '' : s[i + 1]); i++; continue }
    if (ch !== '"') { out += ch; continue }
    var j = i + 1
    while (j < s.length && /\s/.test(s[j])) j++
    var sig = s[j]
    var cierra = sig === ':' || sig === '}' || sig === ']' || sig === undefined
    if (sig === ',') {
      var k = j + 1
      while (k < s.length && /\s/.test(s[k])) k++
      cierra = s[k] === '"' || s[k] === '{' || s[k] === '[' || s[k] === '}' || s[k] === ']'
    }
    if (cierra) { out += ch; dentro = false } else { out += '\\"'; reparadas++ }
  }
  return { texto: out, reparadas: reparadas }
}

var FUENTES_DE_IMAGEN = ['cliente', 'generada', 'dueno', 'no_declarada']

/** Saca la pieza del texto del productor (bloque ```json o el primer objeto completo). Devuelve {legible, pieza?, reparado?, comillas_reparadas?, motivo?} */
function extraerPieza(texto) {
  var t = String(texto || '')
  if (!t.trim()) return { legible: false, motivo: 'el productor devolvió texto vacío' }
  var candidatos = []
  var abre = t.indexOf('```json')
  if (abre !== -1) {
    var ini = t.indexOf('\n', abre)
    var fin = t.indexOf('```', ini + 1)
    if (ini !== -1 && fin !== -1) candidatos.push(t.slice(ini + 1, fin))
  }
  var a = t.indexOf('{')
  var b = t.lastIndexOf('}')
  if (a !== -1 && b > a) candidatos.push(t.slice(a, b + 1))
  var esPieza = function (p) { return p && typeof p === 'object' && !Array.isArray(p) && (typeof p.texto_principal === 'string' || typeof p.titular === 'string' || typeof p.prompt_imagen === 'string') }
  for (var i = 0; i < candidatos.length; i++) {
    try {
      var j = JSON.parse(candidatos[i])
      var p = j && j.pieza ? j.pieza : j
      if (esPieza(p)) return { legible: true, pieza: p }
    } catch (e) { /* se prueba la reparación de comillas y luego el siguiente candidato */ }
    try {
      var rep = repararComillas(candidatos[i])
      if (rep.reparadas > 0) {
        var j2 = JSON.parse(rep.texto)
        var p2 = j2 && j2.pieza ? j2.pieza : j2
        if (esPieza(p2)) return { legible: true, pieza: p2, reparado: true, comillas_reparadas: rep.reparadas }
      }
    } catch (e2) { /* sigue ilegible */ }
  }
  return { legible: false, motivo: 'no hay un JSON con la pieza (titular · texto_principal · prompt_imagen) en la respuesta del productor' }
}

/** Los límites de caracteres que el brief ATRIBUYE a un campo: «Bio … 150 caracteres», «titular … 40 caracteres». Un límite sin campo claro NO se aplica (se declara aparte). */
function limitesDelBrief(textoLimites) {
  var t = String(textoLimites || '')
  var res = []
  var re = /(titular|texto principal|texto|bio|caption|descripci[oó]n|mensaje)\b[^.\n;]{0,60}?(\d{2,4})\s*caracteres/gi
  var m
  while ((m = re.exec(t)) !== null) {
    // «los primeros 125 caracteres son los visibles antes del ver más» NO es un máximo: dice cuánto se ve, no cuánto se puede escribir
    if (/primeros|visibles?/i.test(m[0])) continue
    var etq = normalizar(m[1])
    var campo = etq === 'titular' ? 'titular' : 'texto_principal'
    res.push({ campo: campo, etiqueta: m[1], max: Number(m[2]) })
  }
  var sueltos = []
  var re2 = /(?:m[aá]ximo|hasta)\s*(\d{2,4})\s*caracteres/gi
  while ((m = re2.exec(t)) !== null) {
    if (!res.some(function (r) { return r.max === Number(m[1]) })) sueltos.push(Number(m[1]))
  }
  return { atribuidos: res, sin_campo: sueltos }
}

/** Separa por palabras: `normalizar` conserva . / : _ - (sirven para enlaces y teléfonos) y una frase pegada a un punto («puerta.») no se encontraba entre espacios · certificación CC#3 02-oct (falso positivo de «directo a tu puerta») */
function porPalabras(s) {
  return ' ' + normalizar(s).replace(/[.\/:_-]+/g, ' ').replace(/\s+/g, ' ').trim() + ' '
}
function palabraPresente(textoNorm, palabra) {
  var p = porPalabras(palabra).trim()
  if (!p) return false
  return porPalabras(textoNorm).indexOf(' ' + p + ' ') !== -1
}

/** «Botón: «Enviar mensaje» → WhatsApp Business +593…»: la etiqueta es lo que se ve; lo que va tras la flecha es el DESTINO del botón (se configura en la plataforma, no es copy). null si el llamado no trae botón. */
function botonDelLlamado(llamado) {
  var m = /bot[oó]n\s*:?\s*[«"“']([^»"”']+)[»"”']\s*(?:(?:→|->|=>)\s*(.+))?/i.exec(String(llamado || ''))
  if (!m) return null
  return { etiqueta: m[1].trim(), destino: m[2] ? m[2].trim() : '' }
}

/** Lo que el llamado a la acción trae como dato verificable: enlaces, teléfonos, @usuarios. Si trae un botón, lo que va tras la flecha es su destino, no copy: no se exige en el texto. */
function datosDelLlamado(llamado) {
  var t = String(llamado || '')
  if (botonDelLlamado(t)) t = t.replace(/(?:→|->|=>)[\s\S]*$/, '')
  var out = []
  var re = /(https?:\/\/\S+|wa\.me\/\S+|www\.\S+|@[A-Za-z0-9_.]+|\+?\d[\d\s-]{7,}\d)/g
  var m
  while ((m = re.exec(t)) !== null) out.push(m[1].replace(/[),.;]+$/, ''))
  return out
}

// español Y inglés: el prompt de imagen va en inglés y la regla sólo miraba español (la corrida real tuvo 4 «no …» y el hallazgo no las nombraba)
/** Las negaciones del prompt con hasta 4 palabras de contexto cada una: «no logo», «no sauce bottles in». */
function negacionesDelPrompt(prompt) {
  var out = []
  var re = /\b(sin|no|nunca|ning[uú]n[oa]?|evita[rn]?|evitar|ni|jam[aá]s|without|not|never|avoid|nor|none)\b((?:\s+[\wáéíóúñÁÉÍÓÚÑ'’-]+){0,4})/gi
  var m
  while ((m = re.exec(String(prompt || ''))) !== null) out.push((m[1] + m[2]).trim())
  return out
}

/**
 * Corre TODOS los chequeos. `brief` = el entregable del parte · `pieza` = lo que escribió el productor · `manual.forbidden_words` = prohibidas del manual.
 * 03-oct · `extra` = { fotos_regla, trato, chequearFotoReferencia, chequearTrato } (las funciones se INYECTAN: en el nodo vienen de fotos-contexto-logica.js y trato-logica.js; sin `extra` estos chequeos no corren).
 * Devuelve {ok, hallazgos[], por_chequeo{}, fatales[]}. NO modifica nada.
 */
function chequearPieza(brief, pieza, manual, sedes, herr, extra) {
  var hallazgos = []
  var falla = function (chequeo, detalle, fatal) { hallazgos.push({ chequeo: chequeo, detalle: detalle, fatal: fatal === true }) }
  var titular = String(pieza.titular || '')
  var texto = String(pieza.texto_principal || '')
  var prompt = String(pieza.prompt_imagen || '')
  var aire = normalizar(titular + ' . ' + texto)

  // 03-oct · LAS VARIANTES VAN EN CAMPOS: `pieza.variantes = [{ id, titular, texto_principal }]` · cada una se revisa POR SEPARADO y el aviso dice cuál (antes la 3.ª pieza entregó «Variante A: … Variante B: …» dentro de un solo texto)
  // Sin `variantes`, `titular` y `texto_principal` son la pieza (o la variante A) como siempre.
  var variantes = []
  if (Array.isArray(pieza.variantes)) {
    pieza.variantes.forEach(function (v, i) {
      if (v && typeof v === 'object') variantes.push({ id: String(v.id || String.fromCharCode(65 + i)), titular: String(v.titular !== undefined && v.titular !== null ? v.titular : titular), texto: String(v.texto_principal || '') })
    })
  }
  var conVariantes = variantes.length > 0
  if (!conVariantes) variantes.push({ id: '', titular: titular, texto: texto })
  var recorrer = function (fn) {
    variantes.forEach(function (v) {
      var pre = v.id ? '[variante ' + v.id + '] ' : ''
      fn(v.titular, v.texto, normalizar(v.titular + ' . ' + v.texto), function (c, d, f) { falla(c, pre + d, f) }, v)
    })
  }

  if (!titular.trim() && !texto.trim()) falla('pieza_vacia', 'la pieza no trae titular NI texto principal', true)

  // ── los límites de caracteres que el brief atribuye a un campo
  var lim = limitesDelBrief(brief && brief.limites)
  recorrer(function (titular, texto, aire, falla) {
  lim.atribuidos.forEach(function (l) {
    var n = (l.campo === 'titular' ? titular : texto).length
    if (n > l.max) falla('limite_de_caracteres', 'el ' + l.campo + ' mide ' + n + ' caracteres y el brief dice «' + l.etiqueta + '» ≤ ' + l.max)
  })
  })

  lim.sin_campo.forEach(function (mx) { falla('limite_sin_campo', 'el brief menciona un máximo de ' + mx + ' caracteres sin decir de qué campo · NO se pudo comprobar') })

  // ── palabras prohibidas (las del brief y las del manual) · en lo que sale al público (titular y texto), no en el prompt de imagen
  var prohibidas = []
  ;((brief && brief.prohibido) || []).concat((manual && manual.forbidden_words) || []).forEach(function (w) { if (w && prohibidas.indexOf(w) === -1) prohibidas.push(w) })
  recorrer(function (titular, texto, aire, falla) {
  prohibidas.forEach(function (w) { if (palabraPresente(aire, w)) falla('palabra_prohibida', 'usa «' + w + '», prohibida (búsqueda literal · puede ser una mención y no un uso)') })
  })

  // ── el vocabulario obligatorio del brief
  recorrer(function (titular, texto, aire, falla) {
  var faltan = []
  ;((brief && brief.vocabulario_obligatorio) || []).forEach(function (w) { if (w && !palabraPresente(aire, w)) faltan.push(w) })
  if (faltan.length) falla('termino_obligatorio_ausente', 'no aparece(n) en el titular ni en el texto: ' + faltan.map(function (w) { return '«' + w + '»' }).join(' · ') + ' (el brief no siempre exige TODOS en una misma pieza)')
  })

  // ── el llamado a la acción: los datos verificables que trae (enlace, teléfono, @usuario) tienen que estar
  recorrer(function (titular, texto, aire, falla) {
  datosDelLlamado(brief && brief.llamado_a_la_accion).forEach(function (d) {
    var dn = normalizar(d).replace(/\s+/g, '')
    if (normalizar(titular + ' ' + texto).replace(/\s+/g, '').indexOf(dn) === -1) falla('llamado_ausente', 'el llamado a la acción del brief trae «' + d + '» y no aparece en la pieza')
  })
  // el BOTÓN del llamado: el rótulo se ve en el anuncio y la pieza tiene que invitar a tocarlo (candidato, no fatal) · el destino del botón no se exige en el texto
  var boton = botonDelLlamado(brief && brief.llamado_a_la_accion)
  if (boton && boton.etiqueta && !palabraPresente(aire, boton.etiqueta)) {
    falla('boton_sin_mencion', 'el brief declara el botón «' + boton.etiqueta + '» y la pieza no lo nombra (el destino del botón' + (boton.destino ? ' — ' + boton.destino.replace(/[.\s]+$/, '') : '') + ' lo configura la plataforma, no va en el texto)')
  }
  })

  // ── la fuente de la imagen · la decide el BRIEF; la pieza debe declarar cuál usó
  var tipo = normalizar(brief && brief.tipo_de_pieza)
  var esImagen = tipo === 'imagen' || tipo === 'carrusel'
  var fuente = String(pieza.fuente_imagen || '').trim()
  if (esImagen) {
    if (FUENTES_DE_IMAGEN.indexOf(fuente) === -1) falla('fuente_de_imagen_no_declarada', 'la pieza es de imagen y no declara una fuente válida (cliente · generada · dueno) · dijo «' + fuente + '»')
    else if (fuente === 'no_declarada') falla('fuente_de_imagen_no_declarada', 'la pieza es de imagen y la fuente quedó «no_declarada» (el brief no la decidió)')
    if (!prompt.trim()) falla('prompt_de_imagen_ausente', 'la pieza es de imagen y no trae prompt para el generador')
  }
  // ── el prompt va EN POSITIVO (los generadores manejan mal el negativo)
  var negs = prompt.trim() ? negacionesDelPrompt(prompt) : []
  if (negs.length) falla('prompt_con_negaciones', 'el prompt de imagen trae ' + negs.length + ' ' + (negs.length === 1 ? 'negación' : 'negaciones') + ' (' + negs.slice(0, 8).map(function (n) { return '«' + n + '»' }).join(' · ') + ') · los generadores las manejan mal · debe decir lo que SÍ aparece')

  // ── el HORARIO de la pieza contra lo que el SISTEMA vio de las sedes (sitio · Instagram · Mapas): si la pieza afirma un horario y ninguna sede lo tiene verificado, se declara
  // (`sedes` = la ficha resuelta · `herr` = las funciones de lectura de sedes-logica.js · sin ellas no se corre este chequeo: no se inventa una verificación)
  recorrer(function (titular, texto, aire, falla) {
  if (Array.isArray(sedes) && herr && typeof herr.horarioDeTexto === 'function') {
    var hp = herr.horarioDeTexto(titular + ' . ' + texto)
    if (hp) {
      var cp = herr.canonicoHorario(hp)
      var verificadas = sedes.filter(function (s) { return s && s.horario && (s.horario.estado === 'coincide' || s.horario.estado === 'una_fuente') && s.horario.norm })
      if (!verificadas.some(function (s) { return herr.canonicoHorario(s.horario.norm) === cp })) {
        var vistas = sedes.length
          ? sedes.map(function (s) { return s.ciudad + ': ' + (s.horario && s.horario.valor ? s.horario.valor : s.horario && s.horario.estado === 'conflicto' ? 'las fuentes no coinciden' : 'sin dato') }).join(' · ')
          : 'el sistema no tiene sedes registradas'
        falla('horario_sin_respaldo', 'la pieza afirma «' + herr.describirHorario(hp) + '» y ninguna sede lo tiene verificado (' + vistas + ') · lo decide quien aprueba con lo que el sistema vio, no el dueño')
      }
    }
  }
  })

  // ── 03-oct · COHERENCIA FOTO ↔ PIEZA (determinista · sin modelo): una pieza no puede usar de referencia la foto de OTRO producto ni armar el prompt sobre otro plato · tres hallazgos FATALES
  if (extra && extra.fotos_regla && typeof extra.chequearFotoReferencia === 'function') {
    extra.chequearFotoReferencia(pieza, extra.fotos_regla, brief).forEach(function (x) { falla(x.chequeo, x.detalle, x.fatal) })
  }
  // ── 03-oct · EL TRATO de la marca (tú · vos · usted): la pieza y el brief lo respetan · candidato, no fatal
  if (extra && extra.trato && typeof extra.chequearTrato === 'function') {
    recorrer(function (tit, tex, air, fal, v) { extra.chequearTrato(extra.trato, tit + ' . ' + tex, v.id ? 'la variante ' + v.id : 'la pieza').forEach(function (x) { falla(x.chequeo, x.detalle, x.fatal) }) })
    var deBrief = [brief && brief.mensaje, brief && brief.llamado_a_la_accion, brief && brief.sintaxis].filter(Boolean).join(' . ')
    extra.chequearTrato(extra.trato, deBrief, 'el brief').forEach(function (x) { falla('brief_en_otro_trato', x.detalle, false) })
  }

  // ── 03-oct · VARIANTES: separadas, completas y distintas · candidatos (no fatales)
  var pideN = /(\d+)\s*variantes?/i.exec(String((brief && brief.variantes) || ''))
  var nPedidas = pideN ? Number(pideN[1]) : 0
  if (!conVariantes && /(^|\n)\s*variante\s+[a-z0-9]\s*[:.)\-–—]/i.test(texto) && (texto.match(/variante\s+[a-z0-9]\s*[:.)\-–—]/gi) || []).length >= 2) {
    falla('variantes_concatenadas', 'el texto principal trae varias variantes pegadas («Variante A: … Variante B: …») en un solo campo: cada variante va en su propio objeto de «variantes» (el sistema que carga la creatividad necesita campos separados)')
  }
  if (nPedidas > 1 && variantes.length < nPedidas && !(!conVariantes && /variante\s+[a-z0-9]\s*[:.)\-–—]/i.test(texto))) {
    falla('variantes_incompletas', 'el brief pide ' + nPedidas + ' variantes y la pieza entrega ' + (conVariantes ? variantes.length : 1) + ' en campos separados')
  }
  if (conVariantes && variantes.length > 1) {
    var vistos = {}
    variantes.forEach(function (v) { var k = normalizar(v.titular + ' . ' + v.texto); if (vistos[k]) falla('variantes_iguales', 'la variante ' + v.id + ' es idéntica a la variante ' + vistos[k] + ' (titular y texto)'); else vistos[k] = v.id })
  }
  // ── 03-oct · EL PROMPT DE IMAGEN SALE DE LA FOTO: sin marcas ni contactos ajenos (fatales los claros) y lo que la foto no muestra se declara
  if (esImagen && extra && extra.prompt_permitido && typeof extra.chequearPromptDeImagen === 'function') {
    extra.chequearPromptDeImagen(pieza, { permitido: extra.prompt_permitido }).forEach(function (x) { falla(x.chequeo, x.detalle, x.fatal) })
  }

  // ── lo que no pudo y lo que miró se declaran (nunca en silencio)
  if (!Array.isArray(pieza.que_miro) || pieza.que_miro.length === 0) falla('no_declaro_lo_que_miro', 'la pieza no declara qué miró (brief · fotos · mirar afuera)')
  if (!Array.isArray(pieza.no_pude_cumplir)) falla('no_declaro_lo_que_no_pudo', 'la pieza no trae la lista «no_pude_cumplir» (aunque sea vacía)')

  var por = {}
  hallazgos.forEach(function (h) { por[h.chequeo] = (por[h.chequeo] || 0) + 1 })
  return { ok: hallazgos.length === 0, hallazgos: hallazgos, por_chequeo: por, fatales: hallazgos.filter(function (h) { return h.fatal }).map(function (h) { return h.chequeo }) }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { botonDelLlamado: botonDelLlamado, negacionesDelPrompt: negacionesDelPrompt, palabraPresente: palabraPresente, normalizar: normalizar, aTexto: aTexto, repararComillas: repararComillas, extraerPieza: extraerPieza, limitesDelBrief: limitesDelBrief, datosDelLlamado: datosDelLlamado, chequearPieza: chequearPieza, FUENTES_DE_IMAGEN: FUENTES_DE_IMAGEN }
}
