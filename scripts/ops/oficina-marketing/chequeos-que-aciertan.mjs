/**
 * 04-nov · «dale» de Emilio 14:23Z · QUE LOS CHEQUEOS DEL PLAN ACIERTEN SOLOS (base: la revisión de CC3 del plan del 4-nov). Agnóstico: nada aquí sabe de un cliente, un lugar ni un rubro.
 * Sin rejas: nada de esto frena un plan. Lo incoherente lo marca; lo dudoso va como aviso. El módulo está pegado en 3 nodos («Redactor (B4)», «¿Llegó la vuelta?», «JEF · plan · evaluar»): el mismo parche en los 3.
 *
 * Falsas alarmas que quita:
 *  · P4 · una tabla de texto («si pasa esto → hago aquello») no tiene «celdas sin cifra»: solo cuenta una columna que de verdad es de cifras.
 *  · P5 · «Inter para cuerpo» es la tipografía Inter: se compara el nombre, no el resto de la frase.
 *  · P7 · «los datos, pero el dueño debe confirmar» no dice quién dio el dato.
 *  · P10a y P10d · lo declarado por el dueño o por una moneda sin declarar se puede citar, y «no tiene X» dicho por la fuente es un vacío declarado.
 *  · P8 · lo que declaró el dueño, y su mes si lo dijo por semana, no es una cifra suelta.
 *  · P10b, P10d y P10f pasan a aviso: en un plan real, la mayoría son números del propio plan. Sigue marcando lo que cita mal.
 *  · P10b · «a medida que» no es «medido». · P10f · «2026 – 1 de febrero» no deja un «20» suelto. · P10l · «[D9, D55]» son dos citas y una cita de texto puede traer la cifra.
 * Texto limpio (Emilio, 04-nov 15:37Z, misma regla que el manual): el plan no lleva rótulos internos. Lo no firmado o no respondido vive en la oficina, no en el plan.
 *  · P9 ya no exige que el plan diga «sin firma» ni que rotule cifras: era lo contrario de lo que se quiere. Al redactor tampoco se le pide.
 *  · P15 · marca el rótulo que se escape. Las citas [D#] no cuentan: el redactor las necesita y se quitan al mostrar el plan.
 * Lo que agrega:
 *  · P11 · marca · los adicionales no pueden ser iguales a la meta total.
 *  · Avisos · un mismo indicador con varios valores · lo que el manual dice que nunca se promete · una palabra prohibida del manual.
 */
import { cambiarCodigo, nodo } from './lib.mjs'

export const NODOS_DEL_MODULO = ['Redactor (B4)', '¿Llegó la vuelta?', 'JEF · plan · evaluar']

const CELDAS_VIEJO = [
  "    if (resto.some(function (c) { return c === '' || /^[\\-–—−·.…?]+$/.test(c) })) out.push('«' + rotulo.slice(0, 50) + '»: celda vacía')",
  "    else if (!resto.some(function (c) { return /\\d/.test(c) })) out.push('«' + rotulo.slice(0, 50) + '»: ' + resto.join(' | ').slice(0, 50))",
].join('\n')
const CELDAS_NUEVO = [
  "    if (resto.some(function (c) { return c === '' || /^[\\-–—−·.…?]+$/.test(c) })) out.push('«' + rotulo.slice(0, 50) + '»: celda vacía')",
  "    // 04-nov · una tabla de texto («si pasa esto → hago aquello») no tiene celdas sin cifra, y una explicación larga tampoco: solo cuenta una fila corta de una tabla que es de cifras",
  "    else if (!resto.some(function (c) { return /\\d/.test(c) }) && _tablaConCifras(ls, i) && !resto.some(function (c) { return c.length >= 25 })) out.push('«' + rotulo.slice(0, 50) + '»: ' + resto.join(' | ').slice(0, 50))",
].join('\n')

const AUX_CELDAS = [
  "/** ¿la tabla de la fila i tiene al menos la mitad de sus filas de datos con una cifra fuera del rótulo? */",
  "function _tablaConCifras(ls, i) {",
  "  var ini = i; while (ini > 0 && ls[ini - 1].charAt(0) === '|') ini--",
  "  var fin = i; while (fin + 1 < ls.length && ls[fin + 1].charAt(0) === '|') fin++",
  "  var total = 0, conCifra = 0",
  "  for (var k = ini; k <= fin; k++) {",
  "    var x = ls[k]; if (/^\\|?[\\s:|\\-–—]+\\|?$/.test(x) && /-/.test(x)) continue",
  "    if (k + 1 <= fin && /^\\|?[\\s:|\\-–—]+\\|?$/.test(ls[k + 1]) && /-/.test(ls[k + 1])) continue",
  "    var p = x.split('|').map(function (c) { return c.trim() }); if (p[0] === '') p.shift(); if (p.length && p[p.length - 1] === '') p.pop()",
  "    total++; if (p.slice(1).some(function (c) { return /\\d/.test(c) })) conCifra++",
  "  }",
  "  return total > 0 && conCifra * 2 >= total",
  "}",
  "",
].join('\n')

const NUEVO_ANTES_DE_REVISAR = [
  "// 04-nov · lo que es de la oficina y no del documento del cliente. «sin responder» a secas no cuenta: un plan puede hablar de mensajes de clientes sin responder",
  "var _ROTULO_INTERNO = /\\bsin\\s+firma\\b|\\bsin\\s+firmar\\b|\\bno\\s+(?:est[aá]n?\\s+)?firmad|\\boficina\\s+financiera\\b|\\bla\\s+oficina\\b(?=[^.\\n]{0,40}(?:estim|propon|propus|calcul|supuest))|\\bsupuesto\\s+de\\s+la\\s+oficina\\b|\\bpendientes?\\s+de\\s+(?:confirmaci[oó]n|firma|respuesta)\\b|\\bsin\\s+respuesta\\s+del\\s+(?:due[nñ]o|negocio)\\b|\\bno\\s+tiene\\s+respuesta\\b|\\bpreguntas?\\s+sin\\s+(?:responder|respuesta)\\b/i",
  "function _rotulosInternos(t) {",
  "  return String(t || '').split('\\n').filter(function (l) { return _ROTULO_INTERNO.test(l) }).map(function (l) { var i = l.search(_ROTULO_INTERNO); return l.slice(Math.max(0, i - 30), i + 90).trim() })",
  "}",
  "",
  "// 04-nov · lo que un plan no puede decir de sí mismo, para cualquier cliente: agnóstico (los límites salen del manual de cada uno)",
  "var _INDICADORES = [['ticket promedio', /ticket(?!s)(?:\\s+promedio)?[^.\\n|]{0,45}?\\$\\s?(\\d[\\d.,]*\\d|\\d)/gi], ['costo por venta', /costo por venta[^.\\n|]{0,30}?\\$\\s?(\\d[\\d.,]*\\d|\\d)/gi], ['costo por resultado', /costo por resultado[^.\\n|]{0,30}?\\$\\s?(\\d[\\d.,]*\\d|\\d)/gi]]",
  "function _numeroDe(s) { var c = _p10Candidatos(s); return c.length ? c[0] : null }",
  "/** los montos que el dueño declaró en la tabla de datos; «por semana» también vale por mes */",
  "function _montosDelDueno(ctx) {",
  "  var datos = ctx && ctx.plan_v3 && Array.isArray(ctx.plan_v3.datos) ? ctx.plan_v3.datos : [], out = []",
  "  datos.forEach(function (d) {",
  "    var x = d && d.tipo_id === 'dato_del_dueno' && d.valor && typeof d.valor.texto_corto === 'string' ? d.valor.texto_corto : ''",
  "    var m = /(\\d[\\d.,]*)\\s+por\\s+(semana|mes|d[ií]a)/i.exec(x); if (!m) return",
  "    var v = _numeroDe(m[1]); if (!v) return",
  "    out.push(v); if (/semana/i.test(m[2])) out.push(v * 4)",
  "  })",
  "  return out",
  "}",
  "/** la meta total y los «adicionales»: si los adicionales valen lo mismo que la meta, una de las dos cifras está mal nombrada */",
  "function _adicionalesComoMeta(t, ctx) {",
  "  var metas = [], m",
  "  var fin = ctx && ctx.finanzas && Array.isArray(ctx.finanzas.numeros) ? ctx.finanzas.numeros : []",
  "  fin.forEach(function (n) { if (n && /meta_por_semana/.test(String(n.clave)) && typeof n.valor === 'number' && n.valor > 0) metas.push(n.valor) })",
  "  var reMeta = /meta[^.\\n|]{0,30}?(\\d[\\d.,]*)\\s+[a-záéíóúñ]/gi",
  "  while ((m = reMeta.exec(t)) !== null) { var v = _numeroDe(m[1]); if (v) metas.push(v) }",
  "  var out = []",
  "  t.split('\\n').forEach(function (l) {",
  "    if (!/adicional/i.test(l)) return",
  "    var celdas = l.split('|').map(function (c) { return c.trim() }).filter(Boolean)",
  "    var nums = l.charAt(0) === '|' || l.trim().charAt(0) === '|' ? (/adicional/i.test(celdas[0] || '') ? celdas.slice(1).join(' ').match(/\\d[\\d.,]*/g) || [] : []) : (l.match(/\\d[\\d.,]*(?=\\s+(?:\\w+\\s+)?adicional)/gi) || [])",
  "    if (nums.some(function (x) { var n = _numeroDe(x); return n && metas.indexOf(n) >= 0 })) out.push(l.trim().slice(0, 160))",
  "  })",
  "  return out",
  "}",
  "/** un mismo indicador con valores distintos en el plan: a veces es legítimo (otro periodo), por eso es aviso */",
  "function _indicadoresConVariosValores(t) {",
  "  var out = []",
  "  _INDICADORES.forEach(function (ind) {",
  "    var vistos = [], m, re = new RegExp(ind[1].source, ind[1].flags)",
  "    while ((m = re.exec(t)) !== null) { if (/debajo|encima|supera|hasta|menos de|m[aá]s de|techo|m[aá]ximo|m[ií]nimo/i.test(m[0])) continue; var v = _numeroDe(m[1]); if (v !== null && vistos.indexOf(v) < 0) vistos.push(v) }",
  "    if (vistos.length >= 2) out.push(ind[0] + ': ' + vistos.join(' · '))",
  "  })",
  "  return out",
  "}",
  "/** lo que el manual pide no hacer: palabras prohibidas y los nombres propios de lo que «nunca promete». Una línea que lo niega no cuenta */",
  "function _contraLosLimitesDelManual(t, limites) {",
  "  var lim = limites || {}, palabras = [], promesas = []",
  "  var lineas = t.split('\\n')",
  "  ;(Array.isArray(lim.prohibidas) ? lim.prohibidas : []).forEach(function (p) {",
  "    var w = String(p || '').trim(); if (w.length < 3) return",
  "    var re = new RegExp('(^|[^' + _L + '])' + w.replace(/[\\\\^$.|?*+()[\\]{}]/g, '\\\\$&') + '(?![' + _L + '])', 'i')",
  "    if (lineas.some(function (l) { return re.test(l) && !/\\b(?:no|sin|evitar|nunca|prohibid)/i.test(l) })) palabras.push(w)",
  "  })",
  "  ;(Array.isArray(lim.nunca_promete) ? lim.nunca_promete : []).forEach(function (n) {",
  "    var w = String(n || '').trim(); if (w.length < 3) return",
  "    var re = new RegExp('(^|[^' + _L + '])' + w.replace(/[\\\\^$.|?*+()[\\]{}]/g, '\\\\$&') + '(?![' + _L + '])', 'i')",
  "    lineas.forEach(function (l) { if (re.test(l) && !/\\b(?:no|sin|ni|nunca)\\b|compet/i.test(l) && promesas.length < 4) promesas.push(w + ' → ' + l.trim().slice(0, 130)) })",
  "  })",
  "  return { palabras: palabras, promesas: promesas }",
  "}",
  "",
].join('\n')

/** lo que la plataforma del plan le pasa al chequeo desde el manual · va en «Redactor (B4)» */
const LIMITES_DEL_MANUAL = [
  "// 04-nov · los límites del manual, para que el chequeo los lea: palabras prohibidas y los nombres propios de lo que «nunca promete». Nada de esto sabe de un cliente",
  "function limitesDelManual(manual) {",
  "  var d = {}; try { var c = typeof manual.content_text === 'string' ? JSON.parse(manual.content_text) : (manual.content_text || {}); d = (c && c.brand_book_draft) || c || {} } catch (e) { d = {} }",
  "  var prohibidas = Array.isArray(d.forbidden_words) ? d.forbidden_words.filter(function (w) { return typeof w === 'string' }) : []",
  "  var nunca = []",
  "  ;(Array.isArray(d.nunca_hace) ? d.nunca_hace : []).forEach(function (f) {",
  "    if (typeof f !== 'string' || !/\\b(?:promete|ofrece|garantiza)\\b/i.test(f)) return",
  "    ;(f.replace(/^\\s*\\S+/, '').match(/[A-ZÁÉÍÓÚÑ][\\wÁÉÍÓÚÑáéíóúñ]+(?:\\s+[A-ZÁÉÍÓÚÑ][\\wÁÉÍÓÚÑáéíóúñ]+)*/g) || []).forEach(function (n) { if (nunca.indexOf(n) < 0) nunca.push(n) })",
  "  })",
  "  return { prohibidas: prohibidas, nunca_promete: nunca }",
  "}",
  "",
].join('\n')

/** los parches del módulo, con el texto VIVO de hoy: si el vivo cambió, `cambiarCodigo` se detiene */
export const PARCHES = [
  // P4
  [CELDAS_VIEJO, CELDAS_NUEVO],
  ["/** las celdas de las tablas del presupuesto que no llevan cifra:", AUX_CELDAS + "/** las celdas de las tablas del presupuesto que no llevan cifra:"],
  // P5
  ["      var nombre = n.replace(/[()«»\"*_]/g, '').trim()\n", "      // 04-nov · «Inter para cuerpo» es la tipografía Inter: se compara el nombre, no el resto de la frase\n      var nombre = n.replace(/[()«»\"*_]/g, '').trim().replace(/^([A-ZÁÉÍÓÚÑ][\\w'’]*(?:\\s+[A-ZÁÉÍÓÚÑ0-9][\\w'’]*){0,3}).*$/, '$1')\n"],
  // P7
  ["|(?:fuente|dato)[^.\\n]{0,25}(?:due[ñn]o|propietari[oa])|", "|(?:fuente|dato)[^.,;\\n]{0,25}(?:due[ñn]o|propietari[oa])|"],
  // P10 · las citas agrupadas
  ["  var re = /\\[D(\\d+)\\]/g, ids = [], m\n  while ((m = re.exec(frase)) !== null) { var id = 'D' + m[1]; if (ids.indexOf(id) < 0) ids.push(id) }\n", "  // 04-nov · «[D9, D55]» son dos citas\n  var re = /\\[(D\\d+(?:\\s*,\\s*D\\d+)*)\\]/g, ids = [], m\n  while ((m = re.exec(frase)) !== null) m[1].split(/\\s*,\\s*/).forEach(function (id) { if (ids.indexOf(id) < 0) ids.push(id) })\n"],
  ["var t = String(frase).replace(/\\[D\\d+\\]/g, ' ')", "var t = String(frase).replace(/\\[D\\d+(?:\\s*,\\s*D\\d+)*\\]/g, ' ')"],
  // P10f · el año pegado a un rango de fechas
  [".replace(/\\d{1,2}(?:\\s?[-–]\\s?\\d{1,2})?\\s+(?:de\\s+)?(?:ene|feb|mar|abr|may|jun|jul|ago|sep|set|oct|nov|dic)[a-z]*/gi, ' ')", ".replace(/(?<!\\d)\\d{1,2}(?:\\s?[-–]\\s?\\d{1,2})?\\s+(?:de\\s+)?(?:ene|feb|mar|abr|may|jun|jul|ago|sep|set|oct|nov|dic)[a-z]*/gi, ' ')"],
  ["new RegExp('\\\\d{1,2}(?:\\\\s?[-–]\\\\s?\\\\d{1,2})?(?:(?:\\\\s*,\\\\s*|\\\\s+y\\\\s+)(?:el\\\\s+)?\\\\d{1,2})* de (?:'", "new RegExp('(?<!\\\\d)\\\\d{1,2}(?:\\\\s?[-–]\\\\s?\\\\d{1,2})?(?:(?:\\\\s*,\\\\s*|\\\\s+y\\\\s+)(?:el\\\\s+)?\\\\d{1,2})* de (?:'"],
  // P10f · un número con «~» ya dice que es aproximado, y la meta del plan no es un hecho del cliente
  ["    if (!citas.length && !supuesto) {\n      cifras.forEach(function (c) {\n        if (c.ignorable || _p10Slot(c, slots)) return\n", "    if (!citas.length && !supuesto) {\n      cifras.forEach(function (c) {\n        if (c.ignorable || _p10Slot(c, slots)) return\n        if (/~\\s?\\$?\\s?$/.test(f.texto.slice(0, Math.max(0, f.texto.indexOf(c.texto)))) || /\\b(?:meta|objetivo|perseguimos|proyecci)/.test(n)) return\n"],
  // P10a · «supuesto» en la tabla es lo que declaró el dueño, el manual o una moneda sin declarar: se puede citar. Lo que no es lectura: hueco o ensayo
  ["if (d.origen !== 'medido' && d.origen !== 'cerebro' && !supuesto) acc.P10a.push(", "if (d.origen !== 'medido' && d.origen !== 'cerebro' && d.origen !== 'supuesto' && d.origen !== 'dueno' && !supuesto) acc.P10a.push("],
  // P10b · «a medida que» no es «medido»
  ["    var nVer = n\n", "    var nVer = n.replace(/\\b(?:a|en la|sin|una|cada|de)\\s+medidas?\\b|\\bmedidas?\\s+que\\b|\\buna vez (?:confirmad|verificad|medid|validad)\\w*|\\bhallazgo confirmad\\w*/g, ' ')\n"],
  // P10d · «no tiene X» dicho por la fuente es un vacío declarado
  ["var d = tabla[id]; if (d && d.estado !== 'vacio_declarado') acc.P10d.push(", "var d = tabla[id]; if (d && d.estado !== 'vacio_declarado' && !(d.valor && typeof d.valor.texto_corto === 'string' && _p10Tiene(_p10Norm(d.valor.texto_corto), ['no ', 'sin ']))) acc.P10d.push("],
  // P10d · sin cita: si la tabla ya declara ese vacío («no tiene píxel»), la frase tiene respaldo
  ["      if (!citas.length) acc.P10d.push(corta + ' → «' + aus + '» sin cita')\n", "      if (!citas.length) { if (!_vacioEnLaTabla(nAus, aus, tabla)) acc.P10d.push(corta + ' → «' + aus + '» sin cita') }\n"],
  ["function p10Revisar(texto, datos, op) {", "/** ¿algún dato de la tabla dice que no hay lo mismo que esta frase? Se compara la palabra de contenido que sigue a «no hay» */\nfunction _vacioEnLaTabla(n, aus, tabla) {\n  var i = n.indexOf(_p10Norm(aus).trim()); if (i < 0) return false\n  var cola = n.slice(i + _p10Norm(aus).trim().length).split(/\\s+/).filter(function (w) { return w.length >= 4 })\n  var obj = cola[0]; if (!obj) return false\n  obj = obj.replace(/[^a-z0-9]/g, '')\n  return Object.keys(tabla).some(function (id) { var d = tabla[id], x = d && d.valor && typeof d.valor.texto_corto === 'string' ? _p10Norm(d.valor.texto_corto) : ''; return x.indexOf(obj) >= 0 && /(^|\\s)(no|sin)\\s/.test(x) })\n}\n\nfunction p10Revisar(texto, datos, op) {"],
  // P10l · en una fila de tabla, se compara solo la celda que trae la cita
  ["    if (cit.length) {\n      cifras.forEach(function (c) {\n        if (c.estructural) return\n", "    if (cit.length) {\n      var cifrasDeLaCita = f.texto.charAt(0) === '|' ? _p10Cifras(f.texto.split('|').filter(function (x) { return /\\[D\\d/.test(x) }).join(' ')) : cifras\n      cifrasDeLaCita.forEach(function (c) {\n        if (c.estructural) return\n"],
  // P10l · una cita de texto puede traer la cifra
  ["        var ok = cit.some(function (d) { return _p10Coincide(c, d.valor.numero, tol[d.tipo_id] || 0) })\n", "        var ok = cit.some(function (d) { return _p10Coincide(c, d.valor.numero, tol[d.tipo_id] || 0) }) || citas.some(function (id) { var d = tabla[id]; return !!(d && d.valor && typeof d.valor.texto_corto === 'string' && _p10Norm(d.valor.texto_corto).replace(/[.,]/g, ' ').indexOf(c.texto.replace(/%$/, '').replace(/[.,]/g, ' ')) >= 0) })\n"],
  // Severidad · lo que afirma sin cita va como aviso: en un plan real, la mayoría son números del propio plan (presupuesto, metas, condiciones). Sigue marcando lo que cita mal: dato inexistente, hueco, otro negocio, cifra distinta
  ["var _P10_SEVERIDAD = { P10a: 'alta', P10b: 'alta', P10c: 'alta', P10d: 'alta', P10e: 'leve', P10f: 'alta',", "var _P10_SEVERIDAD = { P10a: 'alta', P10b: 'leve', P10c: 'alta', P10d: 'leve', P10e: 'leve', P10f: 'leve',"],
  // P8 · lo que declaró el dueño no es una cifra suelta: el monto y su mes (por semana × 4)
  ["  if (ctx && ctx.finanzas) { marcas = marcas.concat(revisarCifrasFinanzas(texto, ctx.finanzas)) }\n", "  if (ctx && ctx.finanzas) { marcas = marcas.concat(revisarCifrasFinanzas(texto, Object.assign({}, ctx.finanzas, { declaradas: (ctx.finanzas.declaradas || []).concat(_montosDelDueno(ctx)) }))) }\n"],
  // la bandeja dice también los avisos que el dueño debe leer: los de las cifras sin cita quedan en el registro del chequeo, porque casi siempre son números del propio plan
  ["    return m.codigo + ' · ' + t\n  }).join(' · ')\n", "    return m.codigo + ' · ' + t\n  }).concat((r.avisos_p10 || []).filter(function (a) { return /^P1[234]$/.test(a.codigo) }).map(function (a) { return 'Aviso ' + a.codigo + ' · ' + a.que })).join(' · ')\n"],
  // etiquetas de la bandeja
  ["P7: 'nombra a una persona o dice quién dio un dato' }", "P7: 'nombra a una persona o dice quién dio un dato', P11: 'cifras del plan que no cuadran entre sí', P15: 'lleva rótulos internos que el cliente no debe ver' }"],
  // P11 y avisos
  ["function revisarPlan(texto, ctx) {", NUEVO_ANTES_DE_REVISAR + "function revisarPlan(texto, ctx) {"],
  ["  var _r = { ok: marcas.length === 0, marcas: marcas }\n  if (_avisosP10.length) _r.avisos_p10 = _avisosP10\n", [
    "  var _rot = _rotulosInternos(t)",
    "  if (_rot.length) marcas.push({ codigo: 'P15', que: 'el plan lleva rótulos internos que el cliente no debe ver: la oficina, firmas o lo que falta responder', ejemplos: _rot.slice(0, 4) })",
    "  var _adic = _adicionalesComoMeta(t, ctx)",
    "  if (_adic.length) marcas.push({ codigo: 'P11', que: 'los adicionales valen lo mismo que la meta total: una de las dos cifras está mal nombrada', ejemplos: _adic.slice(0, 3) })",
    "  var _varios = _indicadoresConVariosValores(t)",
    "  if (_varios.length) _avisosP10.push({ codigo: 'P12', que: 'un mismo indicador aparece con valores distintos: revisa que cada uno diga su periodo', ejemplos: _varios })",
    "  var _lim = _contraLosLimitesDelManual(t, ctx && ctx.manual_limites)",
    "  if (_lim.palabras.length) _avisosP10.push({ codigo: 'P13', que: 'usa palabras que el manual prohíbe', ejemplos: _lim.palabras })",
    "  if (_lim.promesas.length) _avisosP10.push({ codigo: 'P14', que: 'nombra algo que el manual dice que nunca promete: confirma que esté activo', ejemplos: _lim.promesas })",
    "  var _r = { ok: marcas.length === 0, marcas: marcas }",
    "  if (_avisosP10.length) _r.avisos_p10 = _avisosP10",
    "",
  ].join('\n')],
]

/** cada regla del texto limpio reemplaza una línea entera: si el vivo cambió, se detiene */
const LIMPIO = 'El plan es un documento para el cliente: NUNCA menciones a la oficina financiera, firmas, ni lo que falta responder o confirmar. Lo abierto vive en la oficina, no en el plan.'
const LINEAS_LIMPIAS = [
  // P9: lo que exigía decir «sin firma» o rotular cifras
  [/^ *if \(!_FIN_DICE_SIN_FIRMA\.test\(t\)\) marcas\.push\(.*$/m, ''],
  [/^ *if \(sinRotular\.length\) marcas\.push\(.*$/m, ''],
  [/^ *if \(sinDecir\.length\) marcas\.push\(.*$/m, ''],
]
const LINEAS_DEL_PEDIDO = [
  [/^ *'══════ OFICINA FINANCIERA: SIN NÚMEROS FIRMADOS.*$/m, "      '══════ NÚMEROS DEL PLAN ══════',"],
  [/^ *'La oficina no entregó números firmados.*$/m, "      'Todavía no hay un cálculo cerrado. No inventes cifras exactas: el presupuesto va como rango, y lo que estimes va en «qué asumimos». ' + " + JSON.stringify(LIMPIO) + ","],
  [/^ *L\.push\('══════ NÚMEROS DE LA OFICINA FINANCIERA.*$/m, "  L.push('══════ NÚMEROS DEL PLAN ══════')"],
  [/^ *if \(firmado\) L\.push\('Úsalos TAL CUAL.*$/m, "  L.push('Úsalos TAL CUAL: no los recalcules ni los reemplaces, y escríbelos como las cifras del plan. La meta, el costo por resultado, el techo y el reparto salen de aquí. ' + " + JSON.stringify(LIMPIO) + ")"],
  [/^ *else L\.push\('Estos números NO están firmados.*$/m, ''],
  [/if \(r\.alertas && r\.alertas\.length\) \{ L\.push\('Avisos de la oficina \(no bloquean; el plan los dice\):'\)/, "if (r.alertas && r.alertas.length) { L.push('Tenlos en cuenta al escribir, sin copiarlos como avisos:')"],
]
const cambiarLinea = (c, [re, nuevo]) => {
  const m = c.match(new RegExp(re.source, re.flags + 'g'))
  if (!m || m.length !== 1) throw new Error('la línea no aparece exactamente una vez: ' + re.source.slice(0, 60))
  return c.replace(re, () => nuevo)
}

/** aplica los parches a un texto suelto (lo usa la prueba con el código vivo) */
export function parcharModulo(js) {
  let c = js.split('\r\n').join('\n')
  for (const [viejo, nuevo] of PARCHES) {
    const i = c.indexOf(viejo)
    if (i < 0 || c.indexOf(viejo, i + 1) >= 0) throw new Error(`el fragmento no aparece exactamente una vez: ${viejo.slice(0, 80)}`)
    c = c.replace(viejo, () => nuevo)
  }
  for (const l of LINEAS_LIMPIAS) c = cambiarLinea(c, l)
  // el pedido del redactor solo está en «Redactor (B4)»; los otros dos nodos no lo arman
  if (c.includes('function lineasDeFinanzas(')) for (const l of LINEAS_DEL_PEDIDO) c = cambiarLinea(c, l)
  return c
}

export function construirChequeosQueAciertan(f) {
  for (const nombre of NODOS_DEL_MODULO) {
    nodo(f, nombre).parameters.jsCode = parcharModulo(nodo(f, nombre).parameters.jsCode)
  }
  cambiarCodigo(f, 'Redactor (B4)', 'const manual = ent.manual || {};', LIMITES_DEL_MANUAL + 'const manual = ent.manual || {};')
  cambiarCodigo(f, 'Redactor (B4)', 'Object.assign({}, ctxPN, { personas: PROTEGIDAS, nombre_cliente: ficha.name || null }', 'Object.assign({}, ctxPN, { personas: PROTEGIDAS, nombre_cliente: ficha.name || null, manual_limites: limitesDelManual(manual) }')
  return f
}
