// 04-nov · QUE LA JEFATURA VEA DOS INCOHERENCIAS DEL PLAN (GO de Emilio 17:02Z, puntos 9 y 11). JS plano: se pega tal cual en los 3 nodos de los chequeos. Agnóstico: nada aquí sabe de un cliente, un lugar ni un rubro.
// Marcan, nunca bloquean: la marca le llega al jefe que revisa, que la comprueba y le pone su ficha. Si no encuentran con qué comparar, callan.
var _DIAS = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado']
function _cohSinTildes(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase() }
function _dia(s) { return _DIAS.indexOf(_cohSinTildes(s).replace(/(sabado|domingo)s$/, '$1')) }
var _NOMBRE_DE_DIA = 'lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bados?|domingos?'

/** los umbrales de la regla de pauta tienen que hablar de lo mismo que el costo estimado: misma unidad, mismo orden de magnitud */
function _umbralesContraElCosto(t, ctx) {
  var s = String(t || ''), costo = null
  var fin = ctx && ctx.finanzas && Array.isArray(ctx.finanzas.numeros) ? ctx.finanzas.numeros : []
  fin.forEach(function (n) { if (n && costo === null && /costo_por_resultado|cpr/i.test(String(n.clave)) && typeof n.valor === 'number' && n.valor > 0) costo = n.valor })
  if (costo === null) { var c = /costo por resultado[^|\n]{0,40}?\$\s?(\d[\d.,]*)/i.exec(s.replace(/^\|.*(?:debajo|sube|supera).*$/gim, '')); if (c) { var v = _numeroDe(c[1]); if (v) costo = v } }
  if (!costo) return []
  var techos = []
  s.split('\n').forEach(function (l) {
    if (l.trim().charAt(0) !== '|' || !/costo/i.test(l) || !/debajo|sube|supera|encima|m[aá]s de/i.test(l) || /costo por venta/i.test(l)) return
    var m = /\$\s?(\d[\d.,]*)/.exec(l); if (m) { var v = _numeroDe(m[1]); if (v) techos.push(v) }
  })
  if (!techos.length) return []
  var menor = Math.min.apply(null, techos), mayor = Math.max.apply(null, techos)
  return menor > costo * 3 || mayor < costo / 3 ? ['la regla de la pauta usa $' + menor + ' a $' + mayor + ' y el costo estimado por resultado es $' + costo + ': no pueden ser la misma unidad'] : []
}

/** los días que abre: primero lo que dice el manual, si no lo que dice el plan */
function _diasAbiertos(manual, plan) {
  var textos = [{ t: manual, pre: '' }, { t: plan, pre: '(?:opera|abre|atiende|abierto)[^.\\n]{0,15}?' }]
  for (var i = 0; i < textos.length; i++) {
    var m = new RegExp(textos[i].pre + '(' + _NOMBRE_DE_DIA + ')\\s+a\\s+(' + _NOMBRE_DE_DIA + ')', 'i').exec(textos[i].t || '')
    if (!m) continue
    var a = _dia(m[1]), b = _dia(m[2])
    if (a < 0 || b < 0) continue
    var dias = [], d = a
    for (var k = 0; k < 7; k++) { dias.push(d); if (d === b) break; d = (d + 1) % 7 }
    return dias
  }
  return null
}
/** «a las 11 pm del viernes, no hay respuesta hasta el jueves»: se compara con el siguiente día que abre */
function _horariosContraElManual(t, ctx) {
  var s = String(t || ''), lim = ctx && ctx.manual_limites ? ctx.manual_limites : null
  var dias = _diasAbiertos(lim && lim.horarios, s)
  if (!dias) return []
  var out = [], re = new RegExp('del?\\s+(' + _NOMBRE_DE_DIA + ')[^.\\n]{0,60}?hasta\\s+el\\s+(' + _NOMBRE_DE_DIA + ')', 'gi'), m
  while ((m = re.exec(s)) !== null) {
    var de = _dia(m[1]), a = _dia(m[2])
    if (de < 0 || a < 0) continue
    for (var k = 1; k <= 7; k++) { var d = (de + k) % 7; if (dias.indexOf(d) >= 0) { if (d !== a) out.push('«' + m[0].slice(0, 90) + '»: el negocio abre el ' + _DIAS[d]); break } }
  }
  return out
}

