// 04-nov · EL PLAN CONTRA EL ACTA DE LA MESA (punto 2 de la revisión de CC3 · GO de Lenovo 18:07Z). JS plano: se pega tal cual en los nodos de los chequeos, como los de coherencia. Agnóstico: nada aquí sabe de un cliente.
// Es una vara medible, no una opinión: canal del plan activo en el acta, peso dentro de la tolerancia, nada de «no se hace» como acción. Marca, nunca bloquea: la comprueba el jefe. Sin `ctx.acta` calla: con la mesa apagada el chequeo no existe.
// En `revisarPlan`: var _acta = _planContraElActa(t, ctx); if (_acta.length) marcas.push({ codigo: 'P21', que: 'el plan se aparta de lo que acordó la mesa de estrategia', ejemplos: _acta.slice(0, 6) })
var _ACTA_TOLERANCIA_PUNTOS = 5
var _ACTA_FAMILIAS = [
  ['whatsapp', /whats ?app/],
  ['meta', /\bmeta\b|meta_|instagram|facebook|\big\b/],
  ['tiktok', /tik ?tok/],
  ['linkedin', /linked ?in/],
  ['youtube', /you ?tube/],
  ['busqueda', /google|busqueda|\bseo\b|\bsem\b|\bppc\b|mapas|\bmaps\b/],
  ['correo', /correo|e-?mail/],
  ['organico', /organic/],
]
var _ACTA_NO_CUENTAN = ['sobre', 'desde', 'hasta', 'entre', 'antes', 'durante', 'todavia', 'ahora', 'porque', 'hacer', 'campana', 'canal', 'canales']
function _actaSinTildes(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase() }
function _actaFamilia(s) {
  var n = _actaSinTildes(s)
  for (var i = 0; i < _ACTA_FAMILIAS.length; i++) if (_ACTA_FAMILIAS[i][1].test(n)) return _ACTA_FAMILIAS[i][0]
  return null
}
/** el peso del canal en una fila de reparto: «$480 (60%)» o una celda que es solo «60 %». Un porcentaje suelto dentro de una frase no es un reparto */
function _actaPesoDeLaFila(celdas) {
  for (var i = 1; i < celdas.length; i++) {
    var m = /\$\s?[\d.,]+\s*\(\s*(\d+(?:[.,]\d+)?)\s*%\s*\)/.exec(celdas[i]) || /^\s*(\d+(?:[.,]\d+)?)\s*%\s*$/.exec(celdas[i])
    if (m) return parseFloat(m[1].replace(',', '.'))
  }
  return null
}
function _planContraElActa(t, ctx) {
  var acta = ctx && ctx.acta
  if (!acta || !Array.isArray(acta.canales)) return []
  var out = [], activos = {}, lineas = String(t || '').split('\n'), delPlan = {}, seccionDeNoHacer = false, hechos = {}
  acta.canales.forEach(function (c) {
    var f = c && _actaFamilia(c.canal)
    if (f && c.activo !== false && typeof c.peso === 'number') activos[f] = (activos[f] || 0) + c.peso * 100
  })
  var prohibidos = (Array.isArray(acta.no_se_hace) ? acta.no_se_hace : []).map(function (n) {
    var txt = _actaSinTildes(n && n.que)
    return { que: String(n && n.que), familia: _actaFamilia(txt), claves: txt.split(/[^a-z0-9ñ]+/).filter(function (w) { return w.length >= 5 && _ACTA_NO_CUENTAN.indexOf(w) < 0 }) }
  })
  lineas.forEach(function (l) {
    if (/^\s*#/.test(l)) { seccionDeNoHacer = /\bno\b.*\b(hacer|hace|hare|haremos|hacemos|hagamos|vamos)\b/.test(_actaSinTildes(l)); return }
    if (/^\s*\|/.test(l)) {
      var celdas = l.split('|').slice(1, -1), f = celdas.length > 1 ? _actaFamilia(celdas[0]) : null, peso = celdas.length > 1 ? _actaPesoDeLaFila(celdas) : null
      if (f && peso !== null) delPlan[f] = { peso: (delPlan[f] ? delPlan[f].peso : 0) + peso, fila: celdas[0].trim() }
    }
    var n = _actaSinTildes(l)
    if (seccionDeNoHacer || !/^\s*(\||[-*]\s|\d+[.)]\s)/.test(l) || /\b(no|sin|nunca|evitar|evitamos)\b/.test(n)) return
    prohibidos.forEach(function (p) {
      var esta = p.familia ? _actaFamilia(n) === p.familia : p.claves.length >= 2 && p.claves.every(function (w) { return n.indexOf(w) >= 0 })
      if (esta && !hechos[p.que]) { hechos[p.que] = 1; out.push('«' + p.que + '» está en lo que no se hace y el plan dice: «' + l.trim().slice(0, 90) + '»') }
    })
  })
  Object.keys(delPlan).forEach(function (f) {
    var d = delPlan[f]
    if (activos[f] === undefined) out.push('el plan reparte ' + d.peso + ' % a «' + d.fila + '» y ese canal no está activo en el acta')
    else if (Math.abs(activos[f] - d.peso) > _ACTA_TOLERANCIA_PUNTOS) out.push('el plan da ' + d.peso + ' % a «' + d.fila + '» y el acta acordó ' + Math.round(activos[f]) + ' %')
  })
  return out
}
