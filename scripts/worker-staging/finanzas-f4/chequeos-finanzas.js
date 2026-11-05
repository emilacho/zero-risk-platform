// OFICINA FINANCIERA · F4 · los chequeos P8/P9 y el bloque del pedido · JS plano (se pega TAL CUAL en los nodos de código de n8n y se carga igual en las pruebas)
// `fin` = { finanzas_id, estado, huella, numeros: [{ clave, valor, minimo, maximo, tipo }], semanas, resumen } · sin él, NADA de esto cambia el plan (apagado = idéntico a hoy).
// P8 `cifras_firmadas`: todo monto de la sección de presupuesto del plan es una cifra firmada, o una derivada permitida (suma de partes, total ÷ semanas).
// P9 `supuestos_declarados`: toda cifra que la oficina marca «supuesto» y aparece en el plan lleva una palabra que la declare estimación o rango. Marcan como P4/P7: el plan sale `con_pendientes`.
var _FIN_CLAVES_DE_DINERO = ['costo_por_resultado_ref', 'costo_por_resultado_arranque', 'costo_por_venta', 'pauta_rendimiento_semana', 'pauta_rendimiento_mes', 'pauta_diaria', 'minimo_por_conjunto', 'techo_por_resultado', 'total_mes', 'meta_ig_mes', 'produccion_mes']
var _FIN_DECLARA = /(?:^|[^a-záéíóúñ])(?:supuest|estim|aproxim|rango|alrededor|cerca de|hipótesis|hipotesis|referencia|orientativ|tentativ|proyecci)|entre\s+[\d$]/i

function _finNumeroDe(texto) {
  var s = String(texto).replace(/[^\d.,]/g, '')
  // la puntuación que cierra la frase no es parte del número («US$ 375,56.» es 375,56, no 37.556)
  while (s.length && (s.charAt(s.length - 1) === '.' || s.charAt(s.length - 1) === ',')) s = s.slice(0, -1)
  if (!s) return null
  var uc = Math.max(s.lastIndexOf('.'), s.lastIndexOf(','))
  var n
  if (uc >= 0 && s.length - uc - 1 <= 2 && s.length - uc - 1 >= 1) n = s.slice(0, uc).replace(/[.,]/g, '') + '.' + s.slice(uc + 1)
  else n = s.replace(/[.,]/g, '')
  var v = Number(n)
  return isFinite(v) ? v : null
}

function _finSeccionDePresupuesto(texto) {
  var lineas = String(texto).split('\n'), ini = -1, nivel = 0
  for (var i = 0; i < lineas.length; i++) {
    var m = /^(#{1,4})\s+(.*)$/.exec(lineas[i])
    if (m && /presupuesto/i.test(m[2])) { ini = i; nivel = m[1].length; break }
  }
  if (ini < 0) return null
  var fin = lineas.length
  for (var j = ini + 1; j < lineas.length; j++) {
    var h = /^(#{1,4})\s+/.exec(lineas[j])
    if (h && h[1].length <= nivel) { fin = j; break }
  }
  return lineas.slice(ini, fin).join('\n')
}

function _finMontosDe(seccion) {
  // el número admite miles con espacio («1 234,50», también con espacio duro): primero el grupo con espacio, después el corriente
  var re = /(?:US\$|USD|\$|€|COP|MXN|PEN)\s?(?:\d{1,3}(?:[  ]\d{3})+(?![\d])(?:[.,]\d+)?|\d[\d.,]*)|(?:\d{1,3}(?:[  ]\d{3})+(?![\d])(?:[.,]\d+)?|\d[\d.,]*)\s?(?:US\$|USD|d[oó]lares|pesos|soles|COP|MXN|PEN)\b/gi
  var out = [], m
  while ((m = re.exec(seccion)) !== null) {
    var v = _finNumeroDe(m[0])
    if (v !== null && v > 0) out.push({ texto: m[0].trim(), valor: v })
  }
  return out
}

// v2 (hallazgo 1 de CC#1 · 15-oct): una cifra del presupuesto solo pasa si es una FIRMADA (valor, mínimo o máximo de una fila) o un monto que el bloque DECLARA de forma explícita
// (`fin.declaradas`: pauta por semana, prueba inicial, reparto por canal… lo calcula la ruta del tablero). Ya NO se admiten sumas de 2–3 cifras ni «total ÷ semanas» por su cuenta:
// una cifra inventada que casualmente cuadraba con una suma pasaba sin marca.
function _finValoresFirmados(fin) {
  var perm = []
  ;(fin.numeros || []).forEach(function (n) {
    ;[n.valor, n.minimo, n.maximo].forEach(function (x) { if (typeof x === 'number' && isFinite(x) && x > 0) perm.push(x) })
  })
  ;(fin.declaradas || []).forEach(function (x) { if (typeof x === 'number' && isFinite(x) && x > 0) perm.push(x) })
  return perm
}

// tolerancia: el redondeo a centavos (y a medio punto por ciento en cifras grandes); antes era 0,50 absoluto, que dejaba pasar 1,50 por 1,04
function _finCoincide(v, permitidos) {
  var tol = Math.max(v * 0.002, 0.011)
  for (var i = 0; i < permitidos.length; i++) if (Math.abs(permitidos[i] - v) <= tol) return true
  return false
}

function _finAgrupar(entero, sep) {
  var s = String(entero), out = ''
  for (var i = 0; i < s.length; i++) {
    if (i > 0 && (s.length - i) % 3 === 0) out += sep
    out += s.charAt(i)
  }
  return out
}

function _finFormas(v) {
  var f = []
  // 2 decimales, 1 decimal (solo si el valor lo tiene: «1,5», «12.345,6») y entero (solo si lo es)
  ;[2, 1, 0].forEach(function (d) {
    if (d === 0 && Math.abs(v - Math.round(v)) >= 0.005) return
    if (d === 1 && (Math.abs(v * 10 - Math.round(v * 10)) >= 0.005 || Math.abs(v - Math.round(v)) < 0.005)) return
    var s = (d === 0 ? Math.round(v) : d === 1 ? Math.round(v * 10) / 10 : Math.round(v * 100) / 100).toFixed(d)
    var p = s.split('.')
    f.push(s, s.replace('.', ','))
    // miles con punto («1.234,50»), con coma («1,234.50») y con ESPACIO («1 234,50»): se agrupa a mano, sin expresiones regulares (un desescape de herramientas ya se comió las barras una vez)
    f.push(_finAgrupar(p[0], '.') + (p[1] ? ',' + p[1] : ''))
    f.push(_finAgrupar(p[0], ',') + (p[1] ? '.' + p[1] : ''))
    f.push(_finAgrupar(p[0], ' ') + (p[1] ? ',' + p[1] : ''))
    f.push(_finAgrupar(p[0], ' ') + (p[1] ? '.' + p[1] : ''))
  })
  return f.filter(function (x, k) { return x && f.indexOf(x) === k })
}

/** P8 + P9 · devuelve [{ codigo, que, ejemplos }]; con `fin` ausente o sin números no marca nada */
var _FIN_DICE_SIN_FIRMA = /sin\s+firma|sin\s+firmar|no\s+(?:est[aá]n?\s+|fue(?:ron)?\s+|ha(?:n)?\s+sido\s+)?firm|no\s+(?:est[aá]n?|fue(?:ron)?|ha(?:n)?\s+sido)\s+(?:aprobad|acordad)|sin\s+acuerdo|pendiente\s+de\s+(?:firma|acuerdo|aprobaci)|sin\s+(?:la\s+)?aprobaci|no\s+(?:alcanz|hubo)\w*\s+(?:a\s+)?(?:un\s+)?acuerdo|a[uú]n\s+no\s+(?:firm|aprob)|vencid/i

function revisarCifrasFinanzas(texto, fin) {
  var marcas = []
  if (!fin) return marcas
  var t = String(texto || '')
  var sinFirma = fin.estado && fin.estado !== 'firmado'
  var sinBloque = !Array.isArray(fin.numeros) || !fin.numeros.length
  // forma antigua (sin estado ni motivo) y sin números: no hay nada que revisar (como en F4 v1)
  if (sinBloque && !fin.estado && !fin.motivo) return marcas
  // v2 (hallazgo 3): si la oficina NO firmó (o no entregó bloque), el plan lo DICE; los montos del presupuesto son estimaciones y se rotulan. Nunca bloquea: marca.
  if (sinFirma || sinBloque) {
    if (!_FIN_DICE_SIN_FIRMA.test(t)) marcas.push({ codigo: 'P9', que: 'la oficina financiera no firmó los números' + (fin.motivo ? ' (' + fin.motivo + ')' : '') + ' y el plan no lo dice: tiene que declararlo y presentar los montos como estimación o rango', ejemplos: [] })
  }
  if (sinBloque) {
    var sec0 = _finSeccionDePresupuesto(t)
    if (sec0) {
      var sinRotular = _finMontosDe(sec0).filter(function (m) {
        var i = sec0.indexOf(m.texto)
        return !_FIN_DECLARA.test(sec0.slice(Math.max(0, i - 120), Math.min(sec0.length, i + m.texto.length + 120)))
      })
      if (sinRotular.length) marcas.push({ codigo: 'P9', que: 'sin números firmados, el presupuesto del plan presenta como dato montos que son estimación: ' + sinRotular.slice(0, 4).map(function (s) { return s.texto }).join(', '), ejemplos: sinRotular.slice(0, 6).map(function (s) { return s.texto }) })
    }
    return marcas
  }
  var seccion = _finSeccionDePresupuesto(t)
  if (seccion) {
    var permitidos = _finValoresFirmados(fin)
    var sueltos = _finMontosDe(seccion).filter(function (m) { return !_finCoincide(m.valor, permitidos) })
    if (sueltos.length) marcas.push({ codigo: 'P8', que: 'el presupuesto del plan trae cifras que no son las firmadas por la oficina financiera: ' + sueltos.slice(0, 5).map(function (s) { return s.texto }).join(', '), ejemplos: sueltos.slice(0, 6).map(function (s) { return s.texto }) })
  }
  var sinDecir = []
  fin.numeros.forEach(function (n) {
    if (n.tipo !== 'supuesto' || typeof n.valor !== 'number' || !(n.valor >= 1) || _FIN_CLAVES_DE_DINERO.indexOf(n.clave) < 0) return
    var formas = _finFormas(n.valor)
    for (var i = 0; i < formas.length; i++) {
      var idx = t.indexOf(formas[i])
      while (idx >= 0) {
        var antes = t.charAt(idx - 1), despues = t.charAt(idx + formas[i].length)
        if (!/\d/.test(antes) && !/\d/.test(despues) && !(/[.,]/.test(despues) && /\d/.test(t.charAt(idx + formas[i].length + 1)))) {
          var ventana = t.slice(Math.max(0, idx - 120), Math.min(t.length, idx + formas[i].length + 120))
          if (!_FIN_DECLARA.test(ventana)) { sinDecir.push(formas[i] + ' (' + n.clave + ')'); return }
        }
        idx = t.indexOf(formas[i], idx + 1)
      }
    }
  })
  if (sinDecir.length) marcas.push({ codigo: 'P9', que: 'el plan presenta como dato cifras que la oficina financiera marca como supuesto, sin decir que son estimación: ' + sinDecir.slice(0, 4).join(', '), ejemplos: sinDecir.slice(0, 6) })
  return marcas
}

/** las líneas que se suman al pedido del redactor (vacío sin bloque: el pedido queda idéntico). `fin.resumen` lo arma el nodo «FIN · el bloque» con lo que devolvió la ruta. */
var _FIN_MOTIVOS = { sin_acuerdo: 'la oficina no llegó a un acuerdo', sin_firma: 'el jefe de finanzas no firmó', vencido: 'la oficina no terminó a tiempo', sin_bloque: 'la oficina no pudo calcular un bloque', sin_referencia: 'no hay referencia de costo por resultado', sin_pauta: 'el plan no paga medios' }

function lineasDeFinanzas(fin) {
  if (!fin) return []
  var motivo = fin.motivo ? (_FIN_MOTIVOS[fin.motivo] || fin.motivo) : null
  // v2 (hallazgo 3): sin bloque el plan igual recibe el AVISO: rangos supuestos, nada inventado, y lo dice en el plan
  if (!fin.resumen) {
    if (!motivo) return []
    return [
      '══════ OFICINA FINANCIERA: SIN NÚMEROS FIRMADOS (' + fin.motivo + ') ══════',
      'La oficina no entregó números firmados (' + motivo + '). No inventes cifras exactas: el presupuesto va como RANGO SUPUESTO, cada monto rotulado como estimación, y el plan DICE de forma visible que los números no están firmados por la oficina financiera.',
      '',
    ]
  }
  var r = fin.resumen, L = []
  var firmado = fin.estado === 'firmado'
  L.push('══════ NÚMEROS DE LA OFICINA FINANCIERA (' + (firmado ? 'firmados' : 'SIN FIRMA' + (fin.motivo ? ' · ' + fin.motivo : '')) + ') ══════')
  if (firmado) L.push('Úsalos TAL CUAL: no los recalcules ni los reemplaces. Todo número marcado «supuesto» se escribe como estimación o rango. La meta, el costo por resultado, el techo y el reparto del plan salen de aquí.')
  else L.push('Estos números NO están firmados' + (motivo ? ' (' + motivo + ')' : '') + ': úsalos TAL CUAL pero como RANGO SUPUESTO, cada monto rotulado como estimación, y el plan DICE de forma visible que no están firmados por la oficina financiera.')
  ;(r.lineas || []).forEach(function (l) { L.push('- ' + l) })
  if (r.alertas && r.alertas.length) { L.push('Avisos de la oficina (no bloquean; el plan los dice):'); r.alertas.forEach(function (a) { L.push('- ' + a) }) }
  L.push('')
  return L
}
