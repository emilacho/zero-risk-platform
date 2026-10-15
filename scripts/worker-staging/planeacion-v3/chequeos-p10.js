// PLAN v3 · V5 · los chequeos P10a–m del plan contra la tabla `dato.v1` + el relleno de slots + el harness de calibración · CC#1 · 2026-10-15
// JS PLANO (se pega TAL CUAL en los nodos de código de n8n y se carga igual en las pruebas) · sin require, sin red, sin modelo. Mismo patrón que `chequeos-finanzas.js` (F4).
// Diseño §7: cada chequeo devuelve { codigo, severidad, que, ejemplos }; MARCAN, NUNCA BLOQUEAN (firma 12-sep). Alta ⇒ el plan sale `con_pendientes` + aviso; leve ⇒ UN aviso agregado.
// `datos` = el `dato.v1[]` del paquete (solo se leen: id, tipo_id, origen, estado, valor, identidad, frescura, periodo, alcance, derivado, contradice, marcas, medido_en).
// `op` = { lexico: { verificacion[], ausencia[], supuesto[], dominio[], periodo[] }, cifras_de_slots: number[], tolerancias: { tipo_id: número absoluto }, textos_con_imperativos: string[] }
// Sin sustituir a P1–P9 (P7 nombres de personas, P8/P9 dinero siguen en sus módulos). Un dato `medido` es una lectura real; P10 NO sabe si es verdadera (§7.4).

var _P10_SEVERIDAD = { P10a: 'alta', P10b: 'alta', P10c: 'alta', P10d: 'alta', P10e: 'leve', P10f: 'alta', P10g: 'alta', P10h: 'leve', P10i: 'alta', P10j: 'leve', P10k: 'leve', P10l: 'alta', P10m: 'leve' }
var _P10_MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'setiembre', 'octubre', 'noviembre', 'diciembre']
var _P10_NO_CIFRA_DETRAS = ['semana', 'semanas', 'mes', 'meses', 'fase', 'paso', 'punto', 'dia', 'dias', 'etapa', 'ronda', 'version', 'v', 'd', 's', 'p', 'seccion', 'tabla', 'figura']
var _P10_NO_CIFRA_DESPUES = ['semana', 'semanas', 'mes', 'meses', 'dia', 'dias', 'fase', 'fases', 'paso', 'pasos', 'etapa', 'etapas', 'ronda', 'rondas']
var _P10_IMPERATIVOS = /(ignora|ignore|ignorar|olvida|olvidate|forget|disregard|desestima)[^.]{0,40}(instrucciones|instructions|prompt|reglas|todo lo anterior|anterior|previous)|(a partir de ahora|from now on|eres ahora|you are now|system prompt|nuevas instrucciones|new instructions)/

function _p10Norm(s) {
  return String(s == null ? '' : s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

/** ¿el texto normalizado trae alguno de los términos (raíz o frase) al comienzo de palabra? */
function _p10Tiene(textoNorm, terminos) {
  for (var i = 0; i < (terminos || []).length; i++) {
    var t = _p10Norm(terminos[i]).trim()
    if (!t) continue
    var idx = textoNorm.indexOf(t)
    while (idx >= 0) {
      var antes = idx === 0 ? ' ' : textoNorm.charAt(idx - 1)
      if (!/[a-z0-9]/.test(antes)) return t
      idx = textoNorm.indexOf(t, idx + 1)
    }
  }
  return null
}

/** frases con su párrafo; no parte en un punto decimal («4.8») ni en «1.234,50» */
function _p10Frases(texto) {
  var out = []
  var lineas = String(texto || '').split('\n')
  for (var p = 0; p < lineas.length; p++) {
    var l = lineas[p].replace(/^\s*(?:[-*>•]|\d+[.)]|#{1,6})\s*/, '').trim()
    if (!l) continue
    var ini = 0
    for (var i = 0; i < l.length; i++) {
      var c = l.charAt(i)
      if (c !== '.' && c !== '!' && c !== '?') continue
      var sig = l.charAt(i + 1)
      if (c === '.' && /\d/.test(l.charAt(i - 1)) && /\d/.test(sig)) continue
      if (sig !== '' && sig !== ' ') continue
      var f = l.slice(ini, i + 1).trim()
      if (f) out.push({ texto: f, parrafo: p })
      ini = i + 1
    }
    var resto = l.slice(ini).trim()
    if (resto) out.push({ texto: resto, parrafo: p })
  }
  return out
}

function _p10Citas(frase) {
  var re = /\[D(\d+)\]/g, ids = [], m
  while ((m = re.exec(frase)) !== null) { var id = 'D' + m[1]; if (ids.indexOf(id) < 0) ids.push(id) }
  return ids
}

/** los valores posibles de un token numérico (el parser único en JS plano): con 1 solo separador y 3 dígitos detrás es ambiguo y se aceptan las dos lecturas */
function _p10Candidatos(tok) {
  var s = String(tok).replace(/[  ]/g, '')
  while (s.length && /[.,]/.test(s.charAt(s.length - 1))) s = s.slice(0, -1)
  if (!s) return []
  var puntos = (s.match(/\./g) || []).length, comas = (s.match(/,/g) || []).length
  var out = []
  var num = function (x) { var v = Number(x); if (isFinite(v)) out.push(v) }
  if (!puntos && !comas) num(s)
  else if (puntos && comas) {
    var uc = Math.max(s.lastIndexOf('.'), s.lastIndexOf(','))
    num(s.slice(0, uc).replace(/[.,]/g, '') + '.' + s.slice(uc + 1))
  } else {
    var sep = puntos ? '.' : ','
    var n = puntos + comas
    var partes = s.split(sep)
    if (n === 1) {
      num(partes[0] + '.' + partes[1])
      if (partes[1].length === 3) num(partes[0] + partes[1])
    } else num(partes.join(''))
  }
  return out
}

/** las cifras de una frase (sin las citas): [{ texto, candidatos[], pct }] */
function _p10Cifras(frase) {
  // las fechas («2026-10-12», «12 de octubre») no son cifras de hecho: las cubre P10b/P10h
  var t = String(frase).replace(/\[D\d+\]/g, ' ').replace(/\d{4}-\d{2}-\d{2}/g, ' ').replace(new RegExp('\\d{1,2} de (?:' + _P10_MESES.join('|') + ')', 'gi'), ' ')
  var re = /\d{1,3}(?:[  ]\d{3})+(?:[.,]\d{1,2})?|\d[\d.,]*\d|\d/g
  var out = [], m
  while ((m = re.exec(t)) !== null) {
    var tok = m[0], antes = t.slice(Math.max(0, m.index - 14), m.index), despues = t.charAt(m.index + tok.length)
    var previa = _p10Norm(antes).replace(/[^a-z ]/g, ' ').trim().split(/\s+/).pop()
    var cands = _p10Candidatos(tok)
    if (!cands.length) continue
    var pct = despues === '%' || /^\s*%/.test(t.slice(m.index + tok.length, m.index + tok.length + 2))
    var esAnio = /^(19|20)\d\d$/.test(tok)
    var siguiente = _p10Norm(t.slice(m.index + tok.length, m.index + tok.length + 14)).replace(/[^a-z ]/g, ' ').trim().split(/\s+/)[0]
    var esOrden = _P10_NO_CIFRA_DETRAS.indexOf(previa) >= 0 || _P10_NO_CIFRA_DESPUES.indexOf(siguiente) >= 0
    var pequena = cands[0] < 10 && tok.indexOf('.') < 0 && tok.indexOf(',') < 0 && !pct
    out.push({ texto: tok + (pct ? '%' : ''), candidatos: pct ? cands.concat(cands.map(function (c) { return c / 100 })) : cands, pct: pct, pequena: pequena, ignorable: esAnio || esOrden || pequena, estructural: esAnio || esOrden })
  }
  return out
}

function _p10Coincide(cifra, valor, tol) {
  for (var i = 0; i < cifra.candidatos.length; i++) if (Math.abs(cifra.candidatos[i] - valor) <= (tol || 0) + 1e-9) return true
  return false
}

/** ¿la frase trae una fecha? ISO («2026-10-12») o «12 de octubre» o un año */
function _p10TieneFecha(frase) {
  var n = _p10Norm(frase)
  if (/\d{4}-\d{2}-\d{2}/.test(n) || /\b(19|20)\d\d\b/.test(n)) return true
  for (var i = 0; i < _P10_MESES.length; i++) if (new RegExp('\\d{1,2} de ' + _P10_MESES[i]).test(n)) return true
  return false
}

function _p10FechasDe(frase) {
  var n = _p10Norm(frase), out = [], m
  var iso = /(\d{4}-\d{2}-\d{2})/g
  while ((m = iso.exec(n)) !== null) out.push(m[1])
  return out
}

function _p10Ficha(d) { return d && typeof d === 'object' ? d : null }

function _p10Marca(codigo, que, ejemplos) {
  return { codigo: codigo, severidad: _P10_SEVERIDAD[codigo], que: que, cuenta: (ejemplos || []).length, ejemplos: (ejemplos || []).slice(0, 4).map(function (e) { return String(e).slice(0, 140) }) }
}

/**
 * P10a–m · devuelve [{ codigo, severidad, que, ejemplos }] · con `datos` vacío o ausente NO marca nada (apagado = idéntico a hoy).
 * Cada código se declara UNA vez con hasta 4 ejemplos; el orden es el de los códigos.
 */
function p10Revisar(texto, datos, op) {
  var tabla = {}
  ;(Array.isArray(datos) ? datos : []).forEach(function (d) { if (d && d.id) tabla[d.id] = d })
  if (!Object.keys(tabla).length) return []
  op = op || {}
  var lex = op.lexico || {}
  var tol = op.tolerancias || {}
  var slots = Array.isArray(op.cifras_de_slots) ? op.cifras_de_slots : []
  var frases = _p10Frases(texto)
  var acc = { P10a: [], P10b: [], P10c: [], P10d: [], P10e: [], P10f: [], P10g: [], P10h: [], P10i: [], P10j: [], P10k: [], P10l: [], P10m: [] }
  var norm = function (f) { return _p10Norm(f.texto) }
  var esSupuesto = function (n) { return !!_p10Tiene(n, lex.supuesto) }

  // valores por origen, para P10c
  var medidos = [], noMedidos = []
  Object.keys(tabla).forEach(function (id) {
    var d = _p10Ficha(tabla[id]); if (!d || !d.valor || typeof d.valor.numero !== 'number') return
    var malo = d.origen === 'de_ensayo' || d.origen === 'hueco' || (d.identidad && d.identidad.estado === 'no_coincide')
    ;(malo ? noMedidos : medidos).push(d.valor.numero)
  })

  frases.forEach(function (f) {
    var n = norm(f)
    var citas = _p10Citas(f.texto)
    var supuesto = esSupuesto(n)
    var cifras = _p10Cifras(f.texto)
    var corta = f.texto.slice(0, 140)

    // P10a · cita a un D# inexistente, o a un dato que no es medido, afirmado como hecho
    citas.forEach(function (id) {
      var d = tabla[id]
      if (!d) { acc.P10a.push(corta + ' → [' + id + '] no existe'); return }
      if (d.origen !== 'medido' && d.origen !== 'cerebro' && !supuesto) acc.P10a.push(corta + ' → [' + id + '] es «' + d.origen + '»')
    })

    // P10b · «verificado/medido/confirmado/(Fuente: …)» sin [D#] en la frase, o con una fecha distinta a la del dato
    var verif = _p10Tiene(n, lex.verificacion)
    if (verif) {
      if (!citas.length) acc.P10b.push(corta + ' → «' + verif + '» sin [D#]')
      else {
        var fechas = _p10FechasDe(f.texto)
        citas.forEach(function (id) {
          var d = tabla[id]; var dia = d && d.medido_en ? String(d.medido_en).slice(0, 10) : null
          if (dia && fechas.length && fechas.indexOf(dia) < 0) acc.P10b.push(corta + ' → la fecha no es la de [' + id + '] (' + dia + ')')
        })
      }
    }

    // P10d · «no tiene / sin pauta / no hay» + cita a un D# que NO es vacío declarado, o sin cita
    var aus = _p10Tiene(n, lex.ausencia)
    if (aus) {
      if (!citas.length) acc.P10d.push(corta + ' → «' + aus + '» sin cita')
      else citas.forEach(function (id) { var d = tabla[id]; if (d && d.estado !== 'vacio_declarado') acc.P10d.push(corta + ' → [' + id + '] es «' + d.estado + '», no vacío declarado') })
    }

    citas.forEach(function (id) {
      var d = tabla[id]; if (!d) return
      // P10e · cifra de alcance dominio presentada como del cliente (sin «en el sitio»)
      if (d.alcance === 'dominio' && !_p10Tiene(n, lex.dominio)) acc.P10e.push(corta + ' → [' + id + '] es del dominio')
      // P10g · cita a un dato cuya identidad es no_coincide / no_comprobable, afirmado como hecho
      if (d.identidad && (d.identidad.estado === 'no_coincide' || d.identidad.estado === 'no_comprobable') && !supuesto) acc.P10g.push(corta + ' → [' + id + '] identidad ' + d.identidad.estado)
      // P10h · dato viejo / sin fecha citado como actual y sin fecha en la frase
      if (d.frescura && (d.frescura.estado === 'viejo' || d.frescura.estado === 'sin_fecha') && !_p10TieneFecha(f.texto)) acc.P10h.push(corta + ' → [' + id + '] está ' + d.frescura.estado)
      // P10k · derivado presentado como «según la ficha / el sitio»
      if (d.derivado && d.derivado.si && /segun (la|el|las|los)? ?(ficha|sitio|perfil|cuenta|pagina|web)/.test(n)) acc.P10k.push(corta + ' → [' + id + '] es calculado')
      // P10i · afirma uno de dos datos que se contradicen sin nombrar el otro (mismo párrafo)
      if (d.contradice && Array.isArray(d.contradice.con) && d.contradice.con.length) {
        var mismosParrafo = frases.filter(function (x) { return x.parrafo === f.parrafo }).map(function (x) { return _p10Citas(x.texto) }).reduce(function (a, b) { return a.concat(b) }, [])
        var nombraOtro = d.contradice.con.some(function (c) { return mismosParrafo.indexOf(c) >= 0 })
        if (!nombraOtro) acc.P10i.push(corta + ' → [' + id + '] contradice a ' + d.contradice.con.join(', '))
      }
    })

    // P10j · compara o suma cifras de periodo/unidad/moneda distintos (citas de la misma frase)
    if (citas.length >= 2 && /\b(vs|frente a|comparad|mas que|menos que|respecto|suma|sumad|total)\b/.test(n)) {
      var ds = citas.map(function (id) { return tabla[id] }).filter(Boolean)
      var distinto = function (g) { var vs = ds.map(g).filter(function (x) { return x !== undefined && x !== null }); return vs.some(function (x) { return x !== vs[0] }) }
      if (distinto(function (d) { return d.periodo && d.periodo.tipo }) || distinto(function (d) { return d.valor && d.valor.unidad }) || distinto(function (d) { return d.valor && d.valor.moneda })) acc.P10j.push(corta + ' → periodos, unidades o monedas distintos')
    }

    // P10l · cifra citada ≠ valor del D# de ESA frase (fuera de la tolerancia del tipo)
    var cit = citas.map(function (id) { return tabla[id] }).filter(function (d) { return d && d.valor && typeof d.valor.numero === 'number' })
    if (cit.length) {
      cifras.forEach(function (c) {
        if (c.estructural) return
        // un entero chico («3 pasos») solo se compara si es un REDONDEO del valor citado («casi 5» vs 4,8); si no, es prosa
        if (c.pequena && !cit.some(function (d) { return Math.abs(c.candidatos[0] - d.valor.numero) < 1 })) return
        var ok = cit.some(function (d) { return _p10Coincide(c, d.valor.numero, tol[d.tipo_id] || 0) })
        if (!ok && !_p10Slot(c, slots)) acc.P10l.push(corta + ' → «' + c.texto + '» no es el valor de ' + citas.join('/') + ' (' + cit.map(function (d) { return d.valor.numero }).join(', ') + ')')
      })
    }

    // P10f · cifra de hecho fuera de los slots, sin [D#] ni palabra de supuesto/estimación
    if (!citas.length && !supuesto) {
      cifras.forEach(function (c) {
        if (c.ignorable || _p10Slot(c, slots)) return
        acc.P10f.push(corta + ' → «' + c.texto + '» sin cita')
      })
    }

    // P10m · texto de fuente con imperativos reproducido
    if (_P10_IMPERATIVOS.test(n)) acc.P10m.push(corta)
    ;(op.textos_con_imperativos || []).forEach(function (t) {
      var tn = _p10Norm(t).replace(/\s+/g, ' ').trim()
      if (tn.length >= 30 && n.indexOf(tn.slice(0, 40)) >= 0) acc.P10m.push(corta)
    })
  })

  // P10c · cifra de un dato de ensayo / hueco / no_coincide que aparece en el plan y en ningún dato medido
  if (noMedidos.length) {
    var vistas = {}
    frases.forEach(function (f) {
      _p10Cifras(f.texto).forEach(function (c) {
        if (c.ignorable) return
        noMedidos.forEach(function (v) {
          if (vistas[v]) return
          if (_p10Coincide(c, v, 0) && !medidos.some(function (m) { return _p10Coincide(c, m, 0) }) && !_p10Slot(c, slots)) { vistas[v] = 1; acc.P10c.push(f.texto.slice(0, 140) + ' → «' + c.texto + '» solo existe en un dato de ensayo, hueco u otro negocio') }
        })
      })
    })
  }

  var QUE = {
    P10a: 'cita un [D#] que no existe o que no es una lectura medida, y la frase lo afirma como hecho',
    P10b: '«verificado/medido/confirmado/(Fuente: …)» sin cita [D#] en la frase, o con una fecha que no es la del dato',
    P10c: 'una cifra de un dato de ensayo, hueco u otro negocio aparece en el plan y en ningún dato medido',
    P10d: 'dice que algo no existe o no tiene sin un vacío declarado por la fuente',
    P10e: 'presenta como del cliente una cifra que es del dominio (sitio)',
    P10f: 'hay una cifra de hecho fuera de los slots, sin cita [D#] ni palabra de supuesto o estimación',
    P10g: 'afirma como hecho un dato cuya identidad no se pudo comprobar o es de otro negocio',
    P10h: 'cita como actual un dato viejo o sin fecha, sin poner la fecha',
    P10i: 'afirma uno de dos datos que se contradicen sin mencionar el otro',
    P10j: 'compara o suma cifras de periodo, unidad o moneda distintos',
    P10k: 'presenta una cifra calculada como «según la ficha» o «según el sitio»',
    P10l: 'una cifra no coincide con el valor del dato citado en esa frase (fuera de la tolerancia del tipo)',
    P10m: 'reproduce texto de una fuente que traía instrucciones',
  }
  var salida = []
  Object.keys(acc).forEach(function (c) { if (acc[c].length) salida.push(_p10Marca(c, QUE[c], acc[c])) })
  return salida
}

/** ¿la cifra es una de las que el código inserta en los slots? (tolerancia 0,5 %: la misma de F4) */
function _p10Slot(cifra, slots) {
  for (var i = 0; i < slots.length; i++) {
    var v = slots[i]
    for (var j = 0; j < cifra.candidatos.length; j++) if (Math.abs(cifra.candidatos[j] - v) <= Math.max(Math.abs(v) * 0.005, 0.005)) return true
  }
  return false
}

/**
 * Relleno de slots: `{{S7}}` y `{{S8}}` los rellena el CÓDIGO con el bloque firmado en CADA versión del plan (rev. 1 §2.2): lo que el redactor puso ahí se pisa.
 * Devuelve { texto, rellenados[], sin_slot[], residuales[] }: `sin_slot` = slots que el bloque trae y el plan no tiene; `residuales` = marcadores `{{…}}` que quedaron sin valor.
 */
function p10RellenarSlots(texto, slots) {
  var t = String(texto || ''), rellenados = [], sinSlot = []
  Object.keys(slots || {}).forEach(function (k) {
    var re = new RegExp('\\{\\{\\s*' + k.replace(/[^A-Za-z0-9_]/g, '') + '\\s*\\}\\}', 'g')
    if (re.test(t)) { rellenados.push(k); t = t.replace(re, function () { return String(slots[k]) }) } else sinSlot.push(k)
  })
  var res = t.match(/\{\{\s*[A-Za-z0-9_]+\s*\}\}/g) || []
  return { texto: t, rellenados: rellenados, sin_slot: sinSlot, residuales: res }
}

var _P10_UMBRAL_RUIDO_ALTAS = 15
/**
 * Harness de calibración (§7.3): corre P10 sobre casos { id, texto, datos, op } y cuenta por código. Un caso con ≥ 15 altas es RUIDO (se calibra en filas del catálogo, no en código).
 * Devuelve { casos: [{ id, por_codigo, altas, leves, ruido }], total_altas }.
 */
function p10Calibrar(casos) {
  var salida = [], total = 0
  ;(casos || []).forEach(function (c) {
    var marcas = p10Revisar(c.texto, c.datos, c.op)
    var por = {}, altas = 0, leves = 0
    marcas.forEach(function (m) {
      var n = m.cuenta || m.ejemplos.length || 1
      por[m.codigo] = n
      if (m.severidad === 'alta') altas += n; else leves += n
    })
    total += altas
    salida.push({ id: c.id, por_codigo: por, altas: altas, leves: leves, ruido: altas >= _P10_UMBRAL_RUIDO_ALTAS })
  })
  return { casos: salida, total_altas: total }
}
