// REGISTRO DEL CLIENTE · CC#2 · relevo 62 · el redactor del plan toma el registro (tuteo / voseo / usted) del MANUAL del cliente y no lo inventa.
// Texto plano que se PEGA TAL CUAL dentro de los nodos «① GUARDA» y «Redactor (B4)» de la planeación; la prueba `__tests__/planeacion-registro-del-cliente.test.ts` ejecuta ESTE MISMO texto.
// Agnóstico: ningún cliente, ciudad ni rubro. Los países de abajo son un DATO (se amplía sin tocar la lógica).
// Orden de autoridad: 1) lo que el manual DECLARA · 2) lo que el manual ESCRIBE (≥ 2 marcas de un lado y 0 del otro) · 3) el país de la ficha, por omisión y DECLARADO como omisión · 4) sin dato (se dice).

// DATO · registro por omisión por país (claves en minúsculas y sin tildes). Un país que no está aquí NO tiene registro por omisión.
const REGISTRO_POR_PAIS = {
  ecuador: 'tuteo', colombia: 'tuteo', mexico: 'tuteo', peru: 'tuteo', chile: 'tuteo', venezuela: 'tuteo', bolivia: 'tuteo', espana: 'tuteo',
  cuba: 'tuteo', panama: 'tuteo', 'republica dominicana': 'tuteo', 'puerto rico': 'tuteo',
  argentina: 'voseo', uruguay: 'voseo', paraguay: 'voseo',
}
const _sinTildes = (s) => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()
// «palabra completa» con letras Unicode (\b no sirve con tildes)
const _pal = (alt) => new RegExp('(?<![\\p{L}\\p{N}])(?:' + alt + ')(?![\\p{L}\\p{N}])', 'giu')
const _VOSEO = _pal('vos|tenés|querés|podés|hacés|sabés|decís|venís|vivís|sos|pedí|vení|probá|mirá|elegí|escribí|descubrí|seguí|animate|sumate|fijate|acordate|andá|salí')
const _TUTEO = _pal('tú|tienes|quieres|puedes|haces|sabes|dices|vienes|vives|eres|elige|descubre')
const _FORMAL = _pal('usted')

/** cuántas marcas de cada registro hay en un texto (el «tu» posesivo NO cuenta: es igual en los tres) */
function marcasDeRegistro(texto) {
  const t = String(texto == null ? '' : texto)
  return { tuteo: (t.match(_TUTEO) || []).length, voseo: (t.match(_VOSEO) || []).length, formal: (t.match(_FORMAL) || []).length }
}

// ── lo que el manual DECLARA (texto normalizado sin tildes). Las negaciones («sin usted», «nunca uses vos») se resuelven antes.
const _DECLARA = {
  tuteo: [/\btutea(?:r|s|ndo)?\b/, /\btuteo\b/, /\b(?:nunca|jamas|no)\s+(?:uses?\s+|usar\s+|emplees?\s+)?vos\b/, /\b(?:habla|hablar|trato)\s+de tu\b/],
  voseo: [/\bvoseo\b/, /\bvosea(?:r|s)?\b/, /\b(?:usa|usar|emplea|emplear|habla|hablar)\s+(?:de\s+)?vos\b/, /\btrato de vos\b/],
  formal: [/\btrato de usted\b/, /\b(?:habla|hablar|siempre)\s+de usted\b/, /\bregistro formal\b/, /\busted(?:ea|ear|eo)\b/],
}
const _NEGACION_DE_USTED = /\b(?:sin|nunca|no)\s+(?:el\s+)?(?:uso\s+de\s+)?(?:trato\s+de\s+)?usted\b/g
function declaraRegistro(textos) {
  const hallados = {}
  for (const original of textos) {
    const t = _sinTildes(original).replace(_NEGACION_DE_USTED, ' ')
    for (const reg of Object.keys(_DECLARA)) for (const re of _DECLARA[reg]) { const m = t.match(re); if (m) (hallados[reg] = hallados[reg] || []).push('«' + m[0] + '»') }
  }
  const quienes = Object.keys(hallados)
  return quienes.length === 1 ? { registro: quienes[0], pruebas: hallados[quienes[0]] } : null // dos declaraciones contrarias ⇒ ninguna se elige
}

// ── los textos del manual: lo que DECLARA (campos de voz/tono/estilo) y todo lo que ESCRIBE (menos las listas de lo prohibido)
const _CLAVE_DE_VOZ = /voz|voice|tono|tone|estilo|style|personalidad|personality|registro|lenguaje|language|trato/i
const _CLAVE_A_SALTAR = /forbidden|prohib|evitar|avoid|competi|nunca_decir|banned/i
function _hojas(v, clave, out, saltar) {
  if (v == null) return
  if (typeof v === 'string') { out.push({ clave, texto: v }); return }
  if (Array.isArray(v)) { for (const x of v) _hojas(x, clave, out, saltar); return }
  if (typeof v === 'object') for (const k of Object.keys(v)) { if (saltar.test(k)) continue; _hojas(v[k], clave ? clave + '.' + k : k, out, saltar) }
}
function _textosDelManual(fila) {
  const out = []
  const f = fila && typeof fila === 'object' ? fila : {}
  for (const k of ['voice_description', 'tone_guidelines', 'writing_style', 'tagline', 'positioning', 'required_terminology']) _hojas(f[k], k, out, _CLAVE_A_SALTAR)
  if (typeof f.content_text === 'string') {
    try { const d = JSON.parse(f.content_text).brand_book_draft; if (d && typeof d === 'object') _hojas(d, '', out, _CLAVE_A_SALTAR) } catch (e) { /* ilegible: se ignora, no se inventa */ }
  }
  return out
}

/** el registro que fija el manual: declarado, inferido de lo escrito, o sin dato */
function registroDelManual(fila) {
  const hojas = _textosDelManual(fila)
  const dec = declaraRegistro(hojas.filter((h) => _CLAVE_DE_VOZ.test(h.clave || 'voz')).map((h) => h.texto))
  if (dec) return { registro: dec.registro, fuente: 'declarado_en_el_manual', pruebas: dec.pruebas.slice(0, 4) }
  const total = { tuteo: 0, voseo: 0, formal: 0 }, ejemplos = { tuteo: [], voseo: [], formal: [] }
  for (const h of hojas) {
    const m = marcasDeRegistro(h.texto)
    for (const r of Object.keys(total)) { total[r] += m[r]; if (m[r] && ejemplos[r].length < 4) ejemplos[r].push('«' + String(h.texto).replace(/\s+/g, ' ').slice(0, 60) + '»') }
  }
  const lados = Object.keys(total).filter((r) => total[r] > 0)
  if (lados.length === 1 && total[lados[0]] >= 2) return { registro: lados[0], fuente: 'inferido_de_los_textos_del_manual', pruebas: [total[lados[0]] + ' marcas de ' + lados[0] + ' y ninguna de otro registro'].concat(ejemplos[lados[0]]) }
  return { registro: 'sin_dato', fuente: 'sin_dato', pruebas: [] }
}

/** el registro final: el del manual si lo hay; si no, el del país de la ficha (declarado como omisión); si no, sin dato */
function registroFinal(delManual, pais) {
  const p = _sinTildes(pais)
  const porPais = p && Object.prototype.hasOwnProperty.call(REGISTRO_POR_PAIS, p) ? REGISTRO_POR_PAIS[p] : null
  const hayManual = delManual && delManual.registro && delManual.registro !== 'sin_dato'
  // r63 · R-1: un registro solo INFERIDO (nadie lo declaró) no le gana a la regla del país: el manual puede venir contagiado por las instrucciones internas. Solo lo DECLARADO lo cambia.
  if (hayManual && delManual.fuente === 'inferido_de_los_textos_del_manual' && porPais && porPais !== delManual.registro) {
    return { registro: porPais, fuente: 'por_omision_del_pais_de_la_ficha', pruebas: ['país de la ficha: ' + String(pais).trim(), 'los textos del manual solo sugieren ' + delManual.registro + ' (' + (delManual.pruebas || [])[0] + ')'], aviso: 'el manual no lo declara: sus textos solo sugieren ' + delManual.registro + ' y la regla del país de la ficha es ' + porPais + ' · manda el país' }
  }
  if (hayManual) return Object.assign({}, delManual, { aviso: null })
  if (porPais) return { registro: porPais, fuente: 'por_omision_del_pais_de_la_ficha', pruebas: ['país de la ficha: ' + String(pais).trim()], aviso: 'el manual no fija el registro: se usa el del país de la ficha por omisión' }
  return { registro: 'sin_dato', fuente: 'sin_dato', pruebas: [], aviso: 'el manual no fija el registro y el país de la ficha no tiene uno por omisión' }
}

/** las líneas que entran al pedido del redactor */
function bloqueDeRegistro(r) {
  const cab = '══════ EL REGISTRO DE LA VOZ ══════'
  if (!r || r.registro === 'sin_dato') {
    return [cab,
      'El manual no fija el registro y no hay uno por omisión para este cliente: NO lo inventes.',
      'Escribe los textos publicables sin segunda persona marcada (ni vos ni tú ni usted): frases impersonales o en infinitivo.',
      'Declara este hueco en «que asumimos» del plan.', '']
  }
  const nombre = r.registro === 'tuteo' ? 'tuteo (segunda persona «tú»: tienes, quieres, elige)' : r.registro === 'voseo' ? 'voseo (segunda persona «vos»: tenés, querés, elegí)' : 'trato formal de usted'
  return [cab,
    'Registro: ' + nombre + '. Fuente: ' + r.fuente + (r.pruebas && r.pruebas.length ? ' · ' + r.pruebas.join(' · ') : '') + '.',
    'Todo texto pensado para publicarse o para que lo lea el cliente final (llamados a la acción, ejemplos de texto, titulares, guiones) va en ESE registro.',
    'Estas instrucciones pueden estar escritas en otro registro: no imites el registro de estas instrucciones.', '']
}
