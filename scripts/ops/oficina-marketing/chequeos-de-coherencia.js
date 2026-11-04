// 04-nov · QUE LA JEFATURA VEA LAS INCOHERENCIAS DEL PLAN (encargo de Lenovo 16:47Z). JS plano: se pega tal cual en los 3 nodos de los chequeos. Agnóstico: nada aquí sabe de un cliente, un lugar ni un rubro.
// Marcan, nunca bloquean: el plan sale con pendientes y la jefatura los corrige. Si no encuentran con qué comparar, callan.
var _MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
var _DIAS = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado']
function _sinTildes(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase() }
function _mes(s) { return _MESES.indexOf(_sinTildes(s).slice(0, 3)) }
function _dia(s) { return _DIAS.indexOf(_sinTildes(s).replace(/(sabado|domingo)s$/, '$1')) }
var _NOMBRE_DE_DIA = 'lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bados?|domingos?'
function _ms(y, m, d) { return Date.UTC(y, m, d) }
var _UN_DIA = 86400000
function _fechaCorta(ms) { var f = new Date(ms); return f.getUTCDate() + ' ' + _MESES[f.getUTCMonth()] }

/** «4 de noviembre de 2026 – 1 de febrero de 2027» o «4–17 de noviembre de 2026» → { ini, fin } en ms. Sin año lo toma de la pista. */
function _rangoDeFechas(s, anio) {
  var m = /(\d{1,2})\s+de\s+([a-záéíóú]+)(?:\s+de\s+(\d{4}))?\s*[–—-]\s*(\d{1,2})\s+de\s+([a-záéíóú]+)(?:\s+de\s+(\d{4}))?/i.exec(s)
  if (m && _mes(m[2]) >= 0 && _mes(m[5]) >= 0) {
    var yf = Number(m[6] || m[3] || anio), mi = _mes(m[2]), mf = _mes(m[5])
    var yi = Number(m[3] || (mi > mf ? yf - 1 : yf))
    return { ini: _ms(yi, mi, Number(m[1])), fin: _ms(yf, mf, Number(m[4])) }
  }
  m = /(\d{1,2})\s*[–—-]\s*(\d{1,2})\s+de\s+([a-záéíóú]+)(?:\s+de\s+(\d{4}))?/i.exec(s)
  if (m && _mes(m[3]) >= 0) { var y = Number(m[4] || anio); return { ini: _ms(y, _mes(m[3]), Number(m[1])), fin: _ms(y, _mes(m[3]), Number(m[2])) } }
  return null
}

/** las secciones «semanas a–b · fechas» contra el rango del plan; y los informes «cada 14 días» sin saltos */
function _calendarioDelPlan(t) {
  var out = [], lineas = String(t || '').split('\n')
  var rango = null
  for (var i = 0; i < Math.min(lineas.length, 8) && !rango; i++) rango = _rangoDeFechas(lineas[i], null)
  if (!rango || !Number.isFinite(rango.ini) || !Number.isFinite(rango.fin)) return out
  var anio = new Date(rango.fin).getUTCFullYear(), ultima = null, numero = 0
  lineas.forEach(function (l) {
    var m = /^\s*#{1,5}.*?\bsemanas?\s+(\d{1,2})(?:\s*[–—-]\s*(\d{1,2}))?\s*[·:—-]\s*(.+)$/i.exec(l)
    if (!m) return
    var a = Number(m[1]), b = Number(m[2] || m[1]), r = _rangoDeFechas(m[3], anio)
    if (!r || !Number.isFinite(r.ini) || !Number.isFinite(r.fin)) return
    var espIni = rango.ini + (a - 1) * 7 * _UN_DIA, espFin = rango.ini + b * 7 * _UN_DIA - _UN_DIA
    if (r.ini !== espIni || r.fin !== espFin) out.push('semanas ' + a + '–' + b + ' dicen ' + _fechaCorta(r.ini) + ' a ' + _fechaCorta(r.fin) + ': por calendario son ' + _fechaCorta(espIni) + ' a ' + _fechaCorta(espFin))
    if (b > numero) { numero = b; ultima = r }
  })
  if (ultima && ultima.fin !== rango.fin) out.push('el plan dice que termina el ' + _fechaCorta(rango.fin) + ' y su última semana termina el ' + _fechaCorta(ultima.fin))
  if (numero >= 12 && rango.fin !== rango.ini + numero * 7 * _UN_DIA - _UN_DIA) out.push('el rango del plan no son ' + numero + ' semanas: ' + Math.round((rango.fin - rango.ini + _UN_DIA) / _UN_DIA) + ' días')
  // los informes con fecha, si el plan dice que son periódicos
  var periodo = /(?:informes?[^|\n]{0,20}\b|cada\s+(?:\d{1,2}\s*[–—-]\s*)?)(\d{1,2})\s+d[ií]as/i.exec(t)
  if (periodo) {
    var cada = Number(periodo[1]), fechas = [], base = new Date(rango.ini)
    lineas.forEach(function (l) {
      if (!/informe/i.test(l) || l.trim().charAt(0) !== '|') return
      var f = /\|\s*(\d{1,2})\s+(?:de\s+)?(ene|feb|mar|abr|may|jun|jul|ago|sep|oct|nov|dic)[a-z]*\.?\s*\|?\s*$/i.exec(l)
      if (!f) return
      var mes = _mes(f[2]), y = base.getUTCFullYear() + (mes < base.getUTCMonth() ? 1 : 0)
      fechas.push(_ms(y, mes, Number(f[1])))
    })
    fechas.sort(function (a, b) { return a - b })
    for (var k = 1; k < fechas.length; k++) {
      var dias = Math.round((fechas[k] - fechas[k - 1]) / _UN_DIA)
      if (dias > cada + 3) out.push('los informes son cada ' + cada + ' días y saltan del ' + _fechaCorta(fechas[k - 1]) + ' al ' + _fechaCorta(fechas[k]) + ' (' + dias + ' días)')
    }
  }
  return out
}

var _PLATAFORMAS = ['google', 'meta', 'instagram', 'facebook', 'tiktok', 'linkedin', 'youtube', 'whatsapp']
var _ES_PAGADO = /\bpauta\b|\bads\b|anuncio|patrocin|pagad/i
var _PALABRAS_COMUNES = ['pauta', 'canal', 'canales', 'marketing', 'contenido', 'local', 'propio', 'propia', 'produccion', 'campana', 'campanas', 'masivo', 'pagados', 'pagadas', 'desde', 'adquisicion', 'busqueda']
function _palabrasDe(s) { return _sinTildes(s).split(/[^a-z0-9]+/).filter(function (p) { return p.length >= 5 && _PALABRAS_COMUNES.indexOf(p) < 0 && _PLATAFORMAS.indexOf(p) < 0 }) }
function _seccionNoHacer(t) {
  var m = /^#{1,5}[^\n]*\bno\s+(?:vamos\s+a\s+hacer|haremos|hacemos)\b[^\n]*\n([\s\S]*?)(?=^#{1,5}\s|$(?![\s\S]))/im.exec(t)
  return m ? m[1] : ''
}
function _primeraCelda(l) { var c = l.split('|'); return (c[1] || '').trim() }
/** lo que el plan dice que no hará y le pone plata igual */
function _presupuestoContraNoHacer(t) {
  var out = [], seccion = _seccionNoHacer(String(t || ''))
  if (!seccion) return out
  var noHacer = seccion.split('\n').filter(function (l) { return l.trim().charAt(0) === '|' && !/^\s*\|[\s:|-]+$/.test(l) }).slice(1).map(_primeraCelda).filter(Boolean)
  var fuera = String(t).replace(seccion, '')
  fuera.split('\n').forEach(function (l) {
    if (l.trim().charAt(0) !== '|' || !/\d\s?%/.test(l)) return
    var renglon = _primeraCelda(l), bajo = _sinTildes(renglon)
    noHacer.forEach(function (n) {
      var nb = _sinTildes(n)
      var misma = _PLATAFORMAS.some(function (p) { return bajo.indexOf(p) >= 0 && nb.indexOf(p) >= 0 }) && _ES_PAGADO.test(renglon) && _ES_PAGADO.test(n)
      var palabra = _palabrasDe(n).some(function (p) { return _palabrasDe(renglon).indexOf(p) >= 0 })
      if (misma || palabra) out.push('reparte plata a «' + renglon.slice(0, 60) + '» y dice que no hará «' + n.slice(0, 60) + '»')
    })
  })
  return out
}

/** «con píxel activo» cuando el mismo plan dice que no hay píxel */
function _afirmaLoQueFalta(t) {
  var out = [], s = String(t || ''), lineas = s.split('\n')
  lineas.forEach(function (l) {
    var re = /([a-záéíóúñ]{4,})\s+activ[oa]s?\b/gi, m
    while ((m = re.exec(l)) !== null) {
      var antes = l.slice(Math.max(0, m.index - 40), m.index)
      if (/\b(?:sin|no|cuando|una vez|despu[eé]s|hasta|si|tras)\b[^.|]*$/i.test(antes)) continue
      var cosa = m[1]
      if (new RegExp('(?:^|[^a-záéíóúñ])(?:sin|no\\s+hay|no\\s+tiene|falta)\\s+(?:[a-záéíóúñ]+\\s+)?' + cosa + '(?![a-záéíóúñ])', 'i').test(s)) { out.push(l.slice(Math.max(0, m.index - 40), m.index + 40).trim()); break }
    }
  })
  return out
}

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

/** el plan está en tuteo y le habla de usted al cliente. Solo lo que está dicho al cliente: «le enviamos al proveedor» no cuenta */
function _tratoDeUsted(t, ctx) {
  var reg = ctx && ctx.manual_limites && typeof ctx.manual_limites.registro === 'string' ? _sinTildes(ctx.manual_limites.registro) : ''
  if (/usted/.test(reg)) return []
  var out = [], re = /[«"“¿]\s*¿?\s*(?:le|lo|la)\s+[a-záéíóúñ]+(?:amos|emos|imos)\b[^»"”?\n]{0,50}|\busted(?:es)?\b[^.\n]{0,40}/gi, m
  while ((m = re.exec(String(t || ''))) !== null && out.length < 4) out.push(m[0].trim())
  return out
}

/** los «adicionales» por semana: una sola cifra, o el plan se contradice */
function _adicionalesDistintos(t) {
  var vistos = []
  String(t || '').split('\n').forEach(function (l) {
    if (!/adicional/i.test(l)) return
    var celdas = l.trim().charAt(0) === '|' ? l.split('|').map(function (c) { return c.trim() }).filter(Boolean) : null
    var nums = celdas ? (/adicional/i.test(celdas[0] || '') && /semana/i.test(celdas[0] || '') ? celdas.slice(1).join(' ').match(/\d[\d.,]*/g) || [] : []) : (l.match(/\d[\d.,]*(?=\s+(?:tickets?|ventas?|pedidos?)\s+adicional)/gi) || [])
    nums.forEach(function (x) { var v = _numeroDe(x); if (v !== null && vistos.indexOf(v) < 0) vistos.push(v) })
  })
  return vistos.length >= 2 ? ['adicionales por semana: ' + vistos.join(' · ')] : []
}

