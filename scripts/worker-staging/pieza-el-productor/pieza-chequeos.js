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

function palabraPresente(textoNorm, palabra) {
  var p = normalizar(palabra)
  if (!p) return false
  return (' ' + textoNorm + ' ').indexOf(' ' + p + ' ') !== -1
}

/** Lo que el llamado a la acción trae como dato verificable: enlaces, teléfonos, @usuarios. */
function datosDelLlamado(llamado) {
  var t = String(llamado || '')
  var out = []
  var re = /(https?:\/\/\S+|wa\.me\/\S+|www\.\S+|@[A-Za-z0-9_.]+|\+?\d[\d\s-]{7,}\d)/g
  var m
  while ((m = re.exec(t)) !== null) out.push(m[1].replace(/[),.;]+$/, ''))
  return out
}

var NEGACIONES = /\b(sin|no|nunca|ning[uú]n[oa]?|evita[rn]?|evitar|ni|jam[aá]s)\b/i

/**
 * Corre TODOS los chequeos. `brief` = el entregable del parte · `pieza` = lo que escribió el productor · `manual.forbidden_words` = prohibidas del manual.
 * Devuelve {ok, hallazgos[], por_chequeo{}, fatales[]}. NO modifica nada.
 */
function chequearPieza(brief, pieza, manual) {
  var hallazgos = []
  var falla = function (chequeo, detalle, fatal) { hallazgos.push({ chequeo: chequeo, detalle: detalle, fatal: fatal === true }) }
  var titular = String(pieza.titular || '')
  var texto = String(pieza.texto_principal || '')
  var prompt = String(pieza.prompt_imagen || '')
  var aire = normalizar(titular + ' . ' + texto)

  if (!titular.trim() && !texto.trim()) falla('pieza_vacia', 'la pieza no trae titular NI texto principal', true)

  // ── los límites de caracteres que el brief atribuye a un campo
  var lim = limitesDelBrief(brief && brief.limites)
  lim.atribuidos.forEach(function (l) {
    var n = (l.campo === 'titular' ? titular : texto).length
    if (n > l.max) falla('limite_de_caracteres', 'el ' + l.campo + ' mide ' + n + ' caracteres y el brief dice «' + l.etiqueta + '» ≤ ' + l.max)
  })
  lim.sin_campo.forEach(function (mx) { falla('limite_sin_campo', 'el brief menciona un máximo de ' + mx + ' caracteres sin decir de qué campo · NO se pudo comprobar') })

  // ── palabras prohibidas (las del brief y las del manual) · en lo que sale al público (titular y texto), no en el prompt de imagen
  var prohibidas = []
  ;((brief && brief.prohibido) || []).concat((manual && manual.forbidden_words) || []).forEach(function (w) { if (w && prohibidas.indexOf(w) === -1) prohibidas.push(w) })
  prohibidas.forEach(function (w) { if (palabraPresente(aire, w)) falla('palabra_prohibida', 'usa «' + w + '», prohibida (búsqueda literal · puede ser una mención y no un uso)') })

  // ── el vocabulario obligatorio del brief
  var faltan = []
  ;((brief && brief.vocabulario_obligatorio) || []).forEach(function (w) { if (w && !palabraPresente(aire, w)) faltan.push(w) })
  if (faltan.length) falla('termino_obligatorio_ausente', 'no aparece(n) en el titular ni en el texto: ' + faltan.map(function (w) { return '«' + w + '»' }).join(' · ') + ' (el brief no siempre exige TODOS en una misma pieza)')

  // ── el llamado a la acción: los datos verificables que trae (enlace, teléfono, @usuario) tienen que estar
  datosDelLlamado(brief && brief.llamado_a_la_accion).forEach(function (d) {
    var dn = normalizar(d).replace(/\s+/g, '')
    if (normalizar(titular + ' ' + texto).replace(/\s+/g, '').indexOf(dn) === -1) falla('llamado_ausente', 'el llamado a la acción del brief trae «' + d + '» y no aparece en la pieza')
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
  if (prompt.trim() && NEGACIONES.test(prompt)) falla('prompt_con_negaciones', 'el prompt de imagen trae una negación («' + (prompt.match(NEGACIONES) || [''])[0] + '») · los generadores la manejan mal · debe decir lo que SÍ aparece')

  // ── lo que no pudo y lo que miró se declaran (nunca en silencio)
  if (!Array.isArray(pieza.que_miro) || pieza.que_miro.length === 0) falla('no_declaro_lo_que_miro', 'la pieza no declara qué miró (brief · fotos · mirar afuera)')
  if (!Array.isArray(pieza.no_pude_cumplir)) falla('no_declaro_lo_que_no_pudo', 'la pieza no trae la lista «no_pude_cumplir» (aunque sea vacía)')

  var por = {}
  hallazgos.forEach(function (h) { por[h.chequeo] = (por[h.chequeo] || 0) + 1 })
  return { ok: hallazgos.length === 0, hallazgos: hallazgos, por_chequeo: por, fatales: hallazgos.filter(function (h) { return h.fatal }).map(function (h) { return h.chequeo }) }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { normalizar: normalizar, aTexto: aTexto, repararComillas: repararComillas, extraerPieza: extraerPieza, limitesDelBrief: limitesDelBrief, datosDelLlamado: datosDelLlamado, chequearPieza: chequearPieza, FUENTES_DE_IMAGEN: FUENTES_DE_IMAGEN }
}
