// OFICINA FINANCIERA · F4 · los chequeos P8/P9 y el bloque del pedido · JS plano (se pega TAL CUAL en los nodos de código de n8n y se carga igual en las pruebas)
// `fin` = { finanzas_id, estado, huella, numeros: [{ clave, valor, minimo, maximo, tipo }], semanas, resumen } · sin él, NADA de esto cambia el plan (apagado = idéntico a hoy).
// P8 `cifras_firmadas`: todo monto de la sección de presupuesto del plan es una cifra firmada, o una derivada permitida (suma de partes, total ÷ semanas).
// P9 `supuestos_declarados`: toda cifra que la oficina marca «supuesto» y aparece en el plan lleva una palabra que la declare estimación o rango. Marcan como P4/P7: el plan sale `con_pendientes`.
var _FIN_CLAVES_DE_DINERO = ['costo_por_resultado_ref', 'costo_por_resultado_arranque', 'costo_por_venta', 'pauta_rendimiento_semana', 'pauta_rendimiento_mes', 'pauta_diaria', 'minimo_por_conjunto', 'techo_por_resultado', 'total_mes', 'meta_ig_mes', 'produccion_mes']
var _FIN_DECLARA = /(?:^|[^a-záéíóúñ])(?:supuest|estim|aproxim|rango|alrededor|cerca de|hipótesis|hipotesis|referencia|orientativ|tentativ|proyecci)|entre\s+[\d$]/i

function _finNumeroDe(texto) {
  var s = String(texto).replace(/[^\d.,]/g, '')
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
  var re = /(?:US\$|USD|\$|€|COP|MXN|PEN)\s?\d[\d.,]*|\d[\d.,]*\s?(?:US\$|USD|d[oó]lares|pesos|soles|COP|MXN|PEN)\b/gi
  var out = [], m
  while ((m = re.exec(seccion)) !== null) {
    var v = _finNumeroDe(m[0])
    if (v !== null && v > 0) out.push({ texto: m[0].trim(), valor: v })
  }
  return out
}

function _finValoresFirmados(fin) {
  var base = []
  ;(fin.numeros || []).forEach(function (n) {
    ;[n.valor, n.minimo, n.maximo].forEach(function (x) { if (typeof x === 'number' && isFinite(x) && x > 0) base.push(x) })
  })
  var sem = fin.semanas > 0 ? fin.semanas : 12
  var u = base.filter(function (x, i) { return base.indexOf(x) === i }).slice(0, 60)
  var perm = u.slice()
  for (var i = 0; i < u.length; i++) {
    perm.push(u[i] / sem)
    for (var j = i + 1; j < u.length; j++) {
      perm.push(u[i] + u[j])
      for (var k = j + 1; k < u.length && u.length <= 24; k++) perm.push(u[i] + u[j] + u[k])
    }
  }
  return perm
}

function _finCoincide(v, permitidos) {
  var tol = Math.max(v * 0.005, 0.5)
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
  ;[2, 0].forEach(function (d) {
    if (d === 0 && Math.abs(v - Math.round(v)) >= 0.005) return
    var s = (d === 0 ? Math.round(v) : Math.round(v * 100) / 100).toFixed(d)
    var p = s.split('.')
    f.push(s, s.replace('.', ','))
    // miles con punto («1.234,50») y con coma («1,234.50»): se agrupa a mano, sin expresiones regulares (un desescape de herramientas ya se comió las barras una vez)
    f.push(_finAgrupar(p[0], '.') + (p[1] ? ',' + p[1] : ''))
    f.push(_finAgrupar(p[0], ',') + (p[1] ? '.' + p[1] : ''))
  })
  return f.filter(function (x, k) { return x && f.indexOf(x) === k })
}

/** P8 + P9 · devuelve [{ codigo, que, ejemplos }]; con `fin` ausente o sin números no marca nada */
function revisarCifrasFinanzas(texto, fin) {
  var marcas = []
  if (!fin || !Array.isArray(fin.numeros) || !fin.numeros.length) return marcas
  var t = String(texto || '')
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
function lineasDeFinanzas(fin) {
  if (!fin || !fin.resumen) return []
  var r = fin.resumen, L = []
  L.push('══════ NÚMEROS DE LA OFICINA FINANCIERA (' + (fin.estado === 'firmado' ? 'firmados' : 'sin firma') + ') ══════')
  L.push('Úsalos TAL CUAL: no los recalcules ni los reemplaces. Todo número marcado «supuesto» se escribe como estimación o rango. La meta, el costo por resultado, el techo y el reparto del plan salen de aquí.')
  ;(r.lineas || []).forEach(function (l) { L.push('- ' + l) })
  if (r.alertas && r.alertas.length) { L.push('Avisos de la oficina (no bloquean; el plan los dice):'); r.alertas.forEach(function (a) { L.push('- ' + a) }) }
  L.push('')
  return L
}
