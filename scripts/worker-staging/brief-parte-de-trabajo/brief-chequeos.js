// LOS CHEQUEOS DEL PARTE DE TRABAJO · CC#1 · 2026-09-29 · encargo Lenovo §1.2 ④ · arquitectura §4.
// Lógica PURA (sin red, sin `this`, sin `require` fuera de este archivo): se prueba a costo cero y se pega
// tal cual dentro del nodo «④ Chequeos» del flujo `zero-risk/brief` (el constructor la antepone al nodo).
//
// REGLA DE LA CASA: lo que falle SE DECLARA en el parte · NO se corrige solo · NO se rellena.
// Por qué en código y no con un juez de pago: los chequeos que importan son CONTABLES y cazan lo que un
// agente pago no ve (medido: el manual prohibía «ghost kitchen», la usaba 3 veces y el juez lo aprobó 0,94).

var CAMPOS_OBLIGATORIOS = [
  'id', 'plataforma', 'tipo_de_pieza', 'que_es', 'de_que_parte_del_plan', 'objetivo', 'segmento', 'protagonista',
  'mensaje', 'hipotesis', 'limites', 'sintaxis', 'llamado_a_la_accion', 'variantes', 'aprueba_y_para_cuando',
]
var CAMPOS_LISTA = ['vocabulario_obligatorio', 'prohibido', 'negativos']
var TIPOS_SIN_VIDEO = ['imagen', 'texto', 'listado', 'configuracion', 'carrusel', 'documento', 'otro']
var TIPOS_QUE_NO_SE_BRIEFEAN = ['video', 'audio', 'reel']
var CENTINELA = /\d+[.,]77(?!\d)/

/** minúsculas, sin tildes, sin signos, espacios simples · para comparar textos. */
function normalizar(s) {
  return String(s === null || s === undefined ? '' : s)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9ñ ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Todos los textos de un valor (string, array, objeto) en una sola cadena. */
function aTexto(v) {
  if (v === null || v === undefined) return ''
  if (typeof v === 'string') return v
  if (Array.isArray(v)) return v.map(aTexto).join(' \n ')
  if (typeof v === 'object') return Object.keys(v).map(function (k) { return aTexto(v[k]) }).join(' \n ')
  return String(v)
}

/**
 * LECTOR TOLERANTE DE COMILLAS · CC#1 · 2026-10-01 · GO de Emilio. El redactor a veces escribe comillas dobles SIN ESCAPAR dentro de un texto del JSON
 * («... el mensaje "Hola, quiero hacer un pedido"» · pasó en las DOS corridas reales del 29 y el 30-sep) y eso invalidaba un parte completo.
 * Una comilla dentro de un texto sólo lo CIERRA si lo que sigue es estructura JSON (`:` `}` `]` o una coma seguida de `"` `{` `[` `}` `]`); si no, es parte del texto y se escapa.
 * Es una reparación de FORMATO, nunca de contenido: sólo se acepta si el resultado parsea Y trae la lista «entregables» · se DECLARA (reparado:true + cuántas) · lo que no parsea sigue siendo ilegible.
 */
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

/** Saca el JSON del texto del redactor (bloque ```json o el primer objeto completo). */
function extraerParte(texto) {
  var t = String(texto || '')
  if (!t.trim()) return { legible: false, motivo: 'el redactor devolvió texto vacío' }
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
  for (var i = 0; i < candidatos.length; i++) {
    try {
      var j = JSON.parse(candidatos[i])
      var p = j && j.parte ? j.parte : j
      if (p && Array.isArray(p.entregables)) return { legible: true, parte: p }
    } catch (e) { /* se prueba la reparación de comillas y luego el siguiente candidato */ }
    try {
      var rep = repararComillas(candidatos[i])
      if (rep.reparadas > 0) {
        var j2 = JSON.parse(rep.texto)
        var p2 = j2 && j2.parte ? j2.parte : j2
        if (p2 && Array.isArray(p2.entregables)) return { legible: true, parte: p2, reparado: true, comillas_reparadas: rep.reparadas }
      }
    } catch (e2) { /* sigue ilegible */ }
  }
  return { legible: false, motivo: 'no hay un JSON con la lista «entregables» en la respuesta del redactor' }
}

function palabraPresente(textoNorm, palabra) {
  var p = normalizar(palabra)
  if (!p) return false
  return (' ' + textoNorm + ' ').indexOf(' ' + p + ' ') !== -1
}

/**
 * Corre TODOS los chequeos. `manual.forbidden_words` = lista de palabras prohibidas del manual (array de strings).
 * `planTexto` = texto del plan vigente (para verificar que la cita a su parte existe).
 * Devuelve {ok, hallazgos[], por_chequeo{}, entregables_revisados}. NO modifica nada.
 */
function chequear(parte, manual, planTexto) {
  var hallazgos = []
  var falla = function (chequeo, entregable, detalle) { hallazgos.push({ chequeo: chequeo, entregable: entregable || null, detalle: detalle }) }
  var ents = parte && Array.isArray(parte.entregables) ? parte.entregables : []
  if (!ents.length) falla('sin_entregables', null, 'la lista de entregables está vacía · un parte sin entregables no es un parte')
  var prohibidas = (manual && Array.isArray(manual.forbidden_words) ? manual.forbidden_words : []).filter(Boolean)
  var planNorm = normalizar(planTexto)

  var ids = {}
  var mensajes = {}
  for (var i = 0; i < ents.length; i++) {
    var e = ents[i] || {}
    var idE = e.id ? String(e.id) : '(sin id · posición ' + (i + 1) + ')'

    // ── identificador + trazabilidad
    if (!e.id || !/^BRF-\d{4}$/.test(String(e.id))) falla('identificador', idE, 'el identificador falta o no tiene la forma BRF-0000')
    else if (ids[e.id]) falla('identificador', idE, 'el identificador está repetido (también en la posición ' + ids[e.id] + ')')
    else ids[e.id] = i + 1

    // ── campos completos
    for (var c = 0; c < CAMPOS_OBLIGATORIOS.length; c++) {
      var k = CAMPOS_OBLIGATORIOS[c]
      var v = e[k]
      if (v === undefined || v === null || (typeof v === 'string' && !v.trim())) falla('campo_faltante', idE, 'falta el campo «' + k + '» (si no se sabe, se declara como hueco · no se deja vacío)')
    }
    for (var d = 0; d < CAMPOS_LISTA.length; d++) {
      if (!Array.isArray(e[CAMPOS_LISTA[d]])) falla('campo_faltante', idE, 'el campo «' + CAMPOS_LISTA[d] + '» debe ser una lista (aunque esté vacía)')
    }

    // ── R1 · un solo mensaje
    var msg = e.mensaje
    if (msg !== undefined && msg !== null) {
      if (typeof msg !== 'string') falla('un_mensaje', idE, 'el mensaje no es UN texto (es ' + (Array.isArray(msg) ? 'una lista' : typeof msg) + ') · un brief = un mensaje')
      else {
        var frases = msg.split(/[.!?¡¿]+/).map(function (s) { return s.trim() }).filter(Boolean)
        if (frases.length > 2) falla('un_mensaje', idE, 'el mensaje tiene ' + frases.length + ' frases · sospecha de varios mensajes (máximo 2 frases, una idea)')
        if (msg.length > 260) falla('un_mensaje', idE, 'el mensaje mide ' + msg.length + ' caracteres · una idea cabe en 260')
      }
    }

    // ── R3 · el público no es «todos»
    var seg = normalizar(e.segmento)
    if (seg) {
      var cliches = ['todos', 'todo el mundo', 'toda la poblacion', 'publico general', 'cualquier persona', 'cualquiera', 'toda la gente', 'la gente']
      for (var q = 0; q < cliches.length; q++) {
        if (seg === cliches[q] || seg.indexOf(cliches[q] + ' ') === 0 || (seg.length < 40 && seg.indexOf(cliches[q]) !== -1)) {
          falla('publico_no_es_todos', idE, 'el segmento dice «' + e.segmento + '» · no es una audiencia declarada')
          break
        }
      }
      if (seg.length < 25) falla('publico_no_es_todos', idE, 'el segmento es demasiado corto (' + seg.length + ' caracteres) para ser una audiencia declarada')
    }

    // ── nada de videos con brief (el sistema no mira video)
    var tipo = normalizar(e.tipo_de_pieza)
    if (TIPOS_QUE_NO_SE_BRIEFEAN.indexOf(tipo) !== -1) falla('video_sin_pendiente', idE, 'es una pieza de «' + e.tipo_de_pieza + '» y trae brief · el sistema mira imágenes, no video ni audio · debía ir a «pendientes_declarados»')
    else if (tipo && TIPOS_SIN_VIDEO.indexOf(tipo) === -1 && TIPOS_QUE_NO_SE_BRIEFEAN.indexOf(tipo) === -1) falla('tipo_desconocido', idE, 'tipo_de_pieza «' + e.tipo_de_pieza + '» no está entre ' + TIPOS_SIN_VIDEO.join('/'))

    // ── R6 · toda regla visual trae su muestra
    var vis = e.visual
    if (vis && typeof vis === 'object' && !Array.isArray(vis)) {
      if (!vis.muestra || !String(vis.muestra).trim()) falla('visual_sin_muestra', idE, 'la regla visual no declara su muestra (cuántas piezas se miraron y qué no se pudo observar) · R6')
    } else if (typeof vis === 'string' && vis.trim() && normalizar(vis) !== 'n a' && normalizar(vis) !== 'no aplica') {
      falla('visual_sin_muestra', idE, 'el visual es solo texto sin muestra declarada · debe ser un objeto {capa_que_manda, descripcion, muestra} · R6')
    } else if (!vis) falla('campo_faltante', idE, 'falta el campo «visual» (si no aplica, se declara «no aplica»)')

    // ── procedencia: cada brief cita su parte del plan y la cita existe
    var cita = String(e.de_que_parte_del_plan || '')
    if (cita.trim()) {
      var citaNorm = normalizar(cita)
      var hayMarca = /§|seccion|semana|fase|paso|puerta|camino|ciclo|mes\s*\d/.test(citaNorm) || citaNorm.length >= 12
      var enPlan = citaNorm.length >= 12 && planNorm.indexOf(citaNorm) !== -1
      var comillas = cita.match(/[«"“]([^»"”]{12,})[»"”]/)
      var textoCitado = comillas ? normalizar(comillas[1]) : ''
      var citaVerificada = enPlan || (textoCitado && planNorm.indexOf(textoCitado) !== -1)
      if (!hayMarca) falla('cita_al_plan', idE, 'la cita al plan es demasiado vaga: «' + cita + '»')
      else if (planNorm && !citaVerificada && !/§/.test(cita)) falla('cita_al_plan', idE, 'la cita «' + cita.slice(0, 80) + '» no se encuentra en el plan · no se puede verificar la procedencia')
    }

    // ── centinelas: cifras que terminan en ,77 / .77 = copió el documento de referencia
    var todoElBrief = aTexto(e)
    var m77 = todoElBrief.match(CENTINELA)
    if (m77) falla('centinela', idE, 'aparece la cifra «' + m77[0] + '» (termina en ,77) · copió el ejemplo de la referencia en vez de pensar')

    // ── palabras prohibidas del manual, en lo que el brief PIDE (no en las listas de lo prohibido)
    var pedido = aTexto([e.que_es, e.objetivo, e.segmento, e.protagonista, e.mensaje, e.hipotesis, e.limites, e.sintaxis, e.llamado_a_la_accion, e.variantes, e.visual, e.vocabulario_obligatorio])
    var pedNorm = normalizar(pedido)
    for (var w = 0; w < prohibidas.length; w++) {
      if (palabraPresente(pedNorm, prohibidas[w])) falla('palabra_prohibida', idE, 'usa «' + prohibidas[w] + '», prohibida por el manual (búsqueda literal)')
    }

    // ── para el chequeo de repetidos
    var clave = normalizar(e.mensaje)
    if (clave) (mensajes[clave] = mensajes[clave] || []).push(idE)
  }

  // ── ningún brief repetido: dos con el mismo mensaje, uno sobra
  Object.keys(mensajes).forEach(function (m) {
    if (mensajes[m].length > 1) falla('brief_repetido', mensajes[m].join(' · '), 'comparten el mismo mensaje · «un brief = una estrategia»: uno sobra')
  })

  // ── centinelas también en lo que declara fuera de los briefs
  var fuera = aTexto([parte && parte.huecos, parte && parte.contradicciones_plan_vs_manual, parte && parte.pendientes_declarados])
  var f77 = fuera.match(CENTINELA)
  if (f77) falla('centinela', null, 'aparece la cifra «' + f77[0] + '» en los huecos/contradicciones/pendientes')

  var por = {}
  hallazgos.forEach(function (h) { por[h.chequeo] = (por[h.chequeo] || 0) + 1 })
  return { ok: hallazgos.length === 0, hallazgos: hallazgos, por_chequeo: por, entregables_revisados: ents.length }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    CAMPOS_OBLIGATORIOS: CAMPOS_OBLIGATORIOS,
    normalizar: normalizar,
    aTexto: aTexto,
    extraerParte: extraerParte,
    repararComillas: repararComillas,
    chequear: chequear,
  }
}
