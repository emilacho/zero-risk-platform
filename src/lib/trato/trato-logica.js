/**
 * EL TRATO (tú · vos · usted) ES DE LA MARCA, NO UNA REGLA FIJA · CC#1 · 2026-10-03 · encargo Lenovo «cada foto viaja con todo su contexto» punto 5.
 *
 * Lógica PURA (sin red, sin `this`, sin `require`): la usan el flujo del brief, el flujo de la pieza y las pruebas · se pega entera en los nodos Code de n8n (estilo `var` + `function`).
 *
 * 🔴 ESTRUCTURAL, NUNCA POR CLIENTE: el trato se LEE del manual de marca (campo explícito o lo que dice su descripción de voz) o de la ficha del cliente; sólo si ninguno lo dice se usa, DECLARADO
 * y de baja confianza, el trato habitual del país de la ficha. Si no hay nada, queda «no_definido» y NO se comprueba nada (no se inventa una regla).
 * El detector reconoce las FORMAS del español (conjugación regular del voseo y del tuteo sobre verbos de uso comercial), no frases ni clientes.
 */
function sinTildes(s) {
  return String(s === undefined || s === null ? '' : s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

var TRATOS = ['tu', 'vos', 'usted']

/** valor explícito → 'tu' | 'vos' | 'usted' | null */
function tratoDeValor(v) {
  var t = sinTildes(v).trim()
  if (!t) return null
  if (/^(tu|tuteo|tutear)$/.test(t)) return 'tu'
  if (/^(vos|voseo|vosear)$/.test(t)) return 'vos'
  if (/^(usted|ustedeo|formal)$/.test(t)) return 'usted'
  return null
}

// lo que dice un TEXTO de voz sobre el trato, respetando las negaciones: «Tutea siempre (tú/sabes/pides — nunca vos)» ⇒ tú, y vos queda NEGADO
var MENCION = {
  tu: /\b(tutea\w*|tuteo|tutear|tu)\b/g,
  vos: /\b(vos|voseo|vosea\w*|vosear)\b/g,
  usted: /\b(usted|ustedeo|ustedea\w*|trato formal)\b/g,
}
function mencionesDelTexto(texto) {
  var t = sinTildes(texto)
  var out = { tu: 0, vos: 0, usted: 0, negados: [] }
  TRATOS.forEach(function (k) {
    var re = new RegExp(MENCION[k].source, 'g')
    var m
    while ((m = re.exec(t)) !== null) {
      // «tu» a secas es un posesivo muy común («tu puerta»): sólo cuenta si va pegado a una indicación de trato (tú/sabes/pides …) o es tuteo/tutea
      if (m[1] === 'tu' && !/tu\s*[\/·,]\s*(sabes|pides|tienes|quieres|puedes|eres|vienes)/.test(t.slice(m.index, m.index + 30))) continue
      var antes = t.slice(Math.max(0, m.index - 24), m.index)
      if (/\b(nunca|jamas|no|ni|sin|evita|evitar|evites)\s+(\w+\s+){0,2}$/.test(antes)) out.negados.push(k)
      else out[k] += 1
    }
  })
  return out
}

// el trato habitual del país SÓLO cuando nadie lo dijo (baja confianza · se declara) · sin país conocido no hay default
var POR_PAIS = { argentina: 'vos', uruguay: 'vos', paraguay: 'vos', ecuador: 'tu', mexico: 'tu', peru: 'tu', chile: 'tu', espana: 'tu', bolivia: 'tu', venezuela: 'tu', panama: 'tu', 'costa rica': 'usted' }

/**
 * `manual` = { voice_description, writing_style, tone_guidelines } · `ficha` = { config, country, market }
 * → { trato: 'tu'|'vos'|'usted'|'no_definido'|'conflicto', fuente, evidencia }
 */
function resolverTrato(manual, ficha) {
  var m = manual || {}
  var f = ficha || {}
  var tg = m.tone_guidelines && typeof m.tone_guidelines === 'object' ? m.tone_guidelines : {}
  var cfg = f.config && typeof f.config === 'object' ? f.config : {}
  var voz = cfg.voz && typeof cfg.voz === 'object' ? cfg.voz : {}
  var explicitos = [
    ['manual.tone_guidelines.trato', tg.trato], ['manual.tone_guidelines.tratamiento', tg.tratamiento], ['manual.tone_guidelines.address_form', tg.address_form],
    ['ficha.config.voz.trato', voz.trato], ['ficha.config.trato', cfg.trato],
  ]
  for (var i = 0; i < explicitos.length; i++) {
    var v = tratoDeValor(explicitos[i][1])
    if (v) return { trato: v, fuente: explicitos[i][0].indexOf('manual') === 0 ? 'manual' : 'ficha', evidencia: explicitos[i][0] + ' = «' + explicitos[i][1] + '»' }
  }
  var texto = [m.voice_description, m.writing_style, m.tone_guidelines && Object.keys(tg).length ? JSON.stringify(tg) : ''].filter(Boolean).join(' · ')
  if (texto) {
    var me = mencionesDelTexto(texto)
    var pos = TRATOS.filter(function (k) { return me[k] > 0 })
    if (pos.length === 1) return { trato: pos[0], fuente: 'manual', evidencia: 'la descripción de voz del manual lo dice (' + pos[0] + (me.negados.length ? ' · niega ' + me.negados.join(', ') : '') + ')' }
    if (pos.length > 1) return { trato: 'conflicto', fuente: 'manual', evidencia: 'la descripción de voz menciona más de un trato (' + pos.join(' y ') + ') sin negar ninguno · no se puede elegir' }
  }
  var pais = sinTildes(f.country).trim() || sinTildes(String(f.market || '').split(/[·|,;\/]/).pop()).trim()
  if (pais && POR_PAIS[pais]) return { trato: POR_PAIS[pais], fuente: 'default_por_pais', evidencia: 'ni el manual ni la ficha lo dicen: se usa el trato habitual de «' + pais + '» (BAJA confianza · conviene ponerlo en el manual)' }
  return { trato: 'no_definido', fuente: 'ninguna', evidencia: 'ni el manual ni la ficha dicen el trato y no hay país conocido · NO se comprueba' }
}

// ───────────────────────────── las formas ─────────────────────────────
// verbos de uso comercial/llamado a la acción (infinitivos regulares en la conjugación del voseo) · es LENGUA, no clientes
var VERBOS = ('pedir mandar escribir enviar llamar contar avisar venir hacer comprar probar reservar consultar mirar seguir sumar unir descubrir elegir disfrutar compartir ordenar encargar contactar visitar ' +
  'decir tener querer poder saber vivir sentir pasar dejar traer llevar buscar conocer escuchar preguntar responder recibir pagar cambiar usar armar crear ahorrar aprovechar animar inscribir registrar ' +
  'suscribir invitar acompañar agendar cotizar solicitar averiguar entrar ingresar escoger pensar imaginar atreverse quedar poner salir').split(' ')
var CLITICOS = ['', 'lo', 'la', 'los', 'las', 'le', 'les', 'me', 'nos', 'te', 'se']

function radical(inf) { return inf.replace(/se$/, '').slice(0, -2) }
function vocalTematica(inf) { var f = inf.replace(/se$/, ''); return f.slice(-2, -1) === 'a' || /ar$/.test(f) ? 'a' : /er$/.test(f) ? 'e' : 'i' }
var ACENTO = { a: 'á', e: 'é', i: 'í' }

function formasVoseo() {
  var s = {}
  VERBOS.forEach(function (inf) {
    var r = radical(inf), v = vocalTematica(inf)
    s[r + ACENTO[v]] = true // pedí · mandá · escribí
    CLITICOS.slice(1).forEach(function (c) { s[r + v + c] = true }) // pedilo · mandalo · escribinos
    s[r + ACENTO[v] + 's'] = true // pedís · mandás · tenés (voseo presente)
    if (v === 'e') s[r + 'és'] = true
  })
  ;['sos', 'tenés', 'querés', 'podés', 'sabés', 'venís', 'hacés', 'decís', 'ponés', 'salís', 'vení', 'poné', 'hacé', 'decí', 'tené', 'salí'].forEach(function (w) { s[w] = true })
  return s
}
// el tuteo: pronombre, presente 2.ª persona regular y el imperativo con clítico acentuado («pídelo», «mándanos»)
function acentuarUltimaVocal(stem) {
  var i = stem.length - 1
  while (i >= 0 && !/[aeiou]/.test(stem[i])) i--
  if (i < 0) return stem
  return stem.slice(0, i) + ({ a: 'á', e: 'é', i: 'í', o: 'ó', u: 'ú' })[stem[i]] + stem.slice(i + 1)
}
function formasTuteo() {
  var s = {}
  VERBOS.forEach(function (inf) {
    var r = radical(inf), v = vocalTematica(inf)
    s[r + (v === 'a' ? 'as' : 'es')] = true // mandas · escribes · tienes(irregular: ver abajo)
    var imp = r + (v === 'a' ? 'a' : 'e')
    CLITICOS.slice(1).forEach(function (c) { s[acentuarUltimaVocal(imp) + c] = true }) // mándalo · escríbenos
  })
  ;['eres', 'tienes', 'quieres', 'puedes', 'sabes', 'vienes', 'haces', 'dices', 'pides', 'pídelo', 'pídela', 'pídenos', 'ven', 'haz', 'dime', 'cuéntanos', 'escríbenos', 'avísanos', 'llámanos', 'mándanos', 'tú'].forEach(function (w) { s[w] = true })
  return s
}
// formas de usted: pronombre (no «ustedes», que es plural neutro) y el imperativo/presente formal regular
function formasUsted() {
  var s = { usted: true }
  VERBOS.forEach(function (inf) {
    var r = radical(inf), v = vocalTematica(inf)
    s[r + (v === 'a' ? 'e' : 'a')] = true // mande · escriba
    CLITICOS.slice(1).forEach(function (c) { s[acentuarUltimaVocal(r + (v === 'a' ? 'e' : 'a')) + c] = true })
  })
  return s
}
var VOSEO = formasVoseo(), TUTEO = formasTuteo(), USTED = formasUsted()
// palabras que coinciden por casualidad con una forma generada y NO son esa forma (sustantivos y adverbios comunes)
var FALSOS = { mas: 1, pase: 1, deje: 1, cree: 1, vea: 1, sienta: 1, nos: 1 }

/** las palabras (con tilde) de un texto, en minúscula */
function palabras(texto) { return String(texto || '').toLowerCase().match(/[a-záéíóúüñ]+/g) || [] }

/** las formas de cada trato que aparecen en el texto: { vos: [palabras], tu: [...], usted: [...] } */
function formasDeTrato(texto) {
  var out = { vos: [], tu: [], usted: [] }
  var add = function (k, w) { if (out[k].indexOf(w) === -1) out[k].push(w) }
  palabras(texto).forEach(function (w) {
    if (w === 'vos') add('vos', w)
    else if (VOSEO[w]) add('vos', w)
    else if (TUTEO[w]) add('tu', w)
    else if (USTED[w] && !FALSOS[w]) add('usted', w)
  })
  return out
}

/**
 * ¿el texto respeta el trato de la marca? → [{ chequeo, detalle, fatal:false }]
 * `donde` = «la pieza» · «el brief». Sin trato definido (o en conflicto) NO se comprueba y se dice.
 */
function chequearTrato(resolucion, texto, donde) {
  var r = resolucion || { trato: 'no_definido' }
  var d = donde || 'el texto'
  if (r.trato === 'no_definido' || r.trato === 'conflicto') return []
  var formas = formasDeTrato(texto)
  var otros = TRATOS.filter(function (k) { return k !== r.trato })
  var hallados = []
  otros.forEach(function (k) { formas[k].forEach(function (w) { hallados.push({ w: w, k: k }) }) })
  // el usted «mande/llame» coincide con presentes de 3.ª persona: sólo se avisa si el trato de la marca NO es usted y no hay forma más clara
  if (!hallados.length) return []
  var nombre = { tu: 'tuteo', vos: 'voseo', usted: 'usted' }
  return [{
    chequeo: 'trato_distinto_al_del_cliente',
    detalle: d + ' trae formas de otro trato: ' + hallados.slice(0, 6).map(function (x) { return '«' + x.w + '» (' + nombre[x.k] + ')' }).join(' · ') + ' y el trato de la marca es ' + nombre[r.trato] + ' (' + r.fuente + ': ' + r.evidencia + ')',
    fatal: false,
  }]
}

/** el bloque para el pedido/brief: el trato y de dónde sale · y qué hacer si otro texto (el brief) trae otro */
function bloqueDeTrato(resolucion) {
  var r = resolucion || { trato: 'no_definido', fuente: 'ninguna', evidencia: '' }
  var nombre = { tu: 'TÚ (tuteo)', vos: 'VOS (voseo)', usted: 'USTED' }
  if (r.trato === 'no_definido') return 'F) EL TRATO. El sistema NO sabe qué trato (tú · vos · usted) usa esta marca: ni el manual ni la ficha lo dicen. Escribe con el trato que use el manual en sus ejemplos y DECLÁRALO en «no_pude_cumplir» («trato no definido»).'
  if (r.trato === 'conflicto') return 'F) EL TRATO. El manual menciona más de un trato sin elegir (' + r.evidencia + '). No adivines: declara «trato en conflicto» en «no_pude_cumplir» y evita las formas de segunda persona cuando puedas.'
  return ['F) EL TRATO de esta marca es ' + nombre[r.trato] + ' (fuente: ' + r.fuente + ' · ' + r.evidencia + ').',
    '   Todo lo que se lee en la pieza (titular, texto, llamado) va en ese trato, sin mezclar. Si el brief trae formas de OTRO trato (por ejemplo una frase copiada de una conversación), NO las copies:',
    '   conviértelas al trato de la marca y dilo en «que_miro». El manual de marca manda sobre el brief.'].join('\n')
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { resolverTrato: resolverTrato, formasDeTrato: formasDeTrato, chequearTrato: chequearTrato, bloqueDeTrato: bloqueDeTrato, tratoDeValor: tratoDeValor, mencionesDelTexto: mencionesDelTexto }
}
