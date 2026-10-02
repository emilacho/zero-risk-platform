// LAS SEDES DE UN CLIENTE · lógica PURA (sin red, sin `this`, sin `URL`) · CC#1 · 2026-10-02 · encargo Lenovo «sedes, mapas, cerebro y voz» puntos 1, 2, 3 y 6 (firma de Emilio 02-oct).
// La usan: el recolector (`/api/clients/sedes/recolectar`), el nodo del flujo de la pieza (se pega entero, por eso va sin `import`) y las pruebas.
//
// 🔴 PRINCIPIO (Emilio): «el horario NO lo confirma el dueño: tiene que verlo el sistema». Cada dato de una sede se OBSERVA en una fuente (sitio propio · Instagram · Mapas) y se guarda CON su fuente y su fecha.
// Si las fuentes chocan o falta, se DECLARA («conflicto» · «sin dato»): NUNCA se rellena y NUNCA se le pregunta al dueño.
// 🔴 Mapas NUNCA crea una sede: sólo observa sobre sedes que el cliente ya declaró en sus propias fuentes (sitio · Instagram). Un resultado de Mapas cuya ciudad no es una sede se DESCARTA con su motivo
// (caso real 01-oct: la ficha de un negocio homónimo de OTRA ciudad entró al cerebro del cliente como si fuera suya).
// Agnóstico: nada de este archivo nombra a un cliente.

var DIAS_NOMBRE = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo']
var DIAS_BONITO = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo']
var DIAS_EN = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
var DIAS_CORTO = ['lun', 'mar', 'mie', 'jue', 'vie', 'sab', 'dom']

function sinTildes(s) {
  return String(s === undefined || s === null ? '' : s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}
/** una ciudad con y sin tilde es la misma · y las mayúsculas no cuentan */
function clave(s) {
  return sinTildes(s).replace(/[^a-z0-9ñ]+/g, ' ').trim().replace(/\s+/g, '-')
}

// ───────────────────────────── HORARIOS ─────────────────────────────
// Un horario es un OBJETO { '1': '07:00-15:00', … } con SÓLO los días abiertos (1 = lunes … 7 = domingo). Dos horarios son iguales si tienen el mismo objeto.

function hhmm(h, m) {
  var hh = Number(h)
  var mm = Number(m || 0)
  if (!(hh >= 0 && hh <= 24) || !(mm >= 0 && mm < 60)) return null
  return (hh < 10 ? '0' : '') + hh + ':' + (mm < 10 ? '0' : '') + mm
}

/** Un instante suelto: «7am» · «3 pm» · «08:00» · «9» · «15h» · «7:30 a. m.» → {h, m, suf} */
var RE_HORA = '(\\d{1,2})(?::(\\d{2}))?\\s*(a\\.?\\s?m\\.?|p\\.?\\s?m\\.?|hrs?\\.?|h)?'

function aHora24(h, m, suf, sufOtro) {
  var hh = Number(h)
  var s = suf ? (suf.charAt(0) === 'p' ? 'pm' : suf.charAt(0) === 'a' ? 'am' : '') : ''
  if (!s && sufOtro) s = sufOtro // «9-6 pm»: el sufijo de un extremo vale para el otro
  if (s === 'pm' && hh < 12) hh += 12
  if (s === 'am' && hh === 12) hh = 0
  return hhmm(hh, m)
}

/** El primer rango de horas del texto: «07:00-15:00» · «7am a 3pm» · «de 8 a 16» · «9 AM to 9 PM». null si no hay. */
function leerRangoDeHoras(texto) {
  var t = sinTildes(texto).replace(/[–—]/g, '-')
  var re = new RegExp(RE_HORA + '\\s*(?:-|a|al|to|hasta)\\s*' + RE_HORA, 'g')
  var m
  while ((m = re.exec(t)) !== null) {
    // un número suelto sin minutos ni sufijo (p. ej. «de 2 a 3 platos») no es una hora: se exige ':' , sufijo o «h»
    var cierto1 = m[2] !== undefined || m[3] !== undefined
    var cierto2 = m[5] !== undefined || m[6] !== undefined
    var hayDias = /(lun|mar|mie|jue|vie|sab|dom|dias|diario|horario|abierto|atendemos|abrimos)/.test(t)
    if (!(cierto1 || cierto2 || hayDias)) continue
    var sufUno = m[3] ? (m[3].charAt(0) === 'p' ? 'pm' : m[3].charAt(0) === 'a' ? 'am' : '') : ''
    var sufDos = m[6] ? (m[6].charAt(0) === 'p' ? 'pm' : m[6].charAt(0) === 'a' ? 'am' : '') : ''
    var d = aHora24(m[1], m[2], m[3], sufDos)
    var h = aHora24(m[4], m[5], m[6], sufUno)
    if (!d || !h) continue
    return d + '-' + h
  }
  return null
}

/** Los días del texto: «Jueves-Lunes» · «jueves a lunes» · «Lun-Vie» · «lunes, martes y sábado» · «todos los días». Devuelve [1..7] o null. */
function leerDias(texto) {
  var t = sinTildes(texto).replace(/[–—]/g, '-')
  if (/todos los dias|a diario|diario|7 dias|siete dias|24\/7/.test(t)) return [1, 2, 3, 4, 5, 6, 7]
  var re = /\b(lunes|martes|miercoles|jueves|viernes|sabado|domingo|lun|mar|mie|jue|vie|sab|dom|monday|tuesday|wednesday|thursday|friday|saturday|sunday)s?\b\.?/g
  var toks = []
  var m
  while ((m = re.exec(t)) !== null) {
    var w = m[1]
    var idx = DIAS_NOMBRE.indexOf(w)
    if (idx === -1) idx = DIAS_EN.indexOf(w)
    var debil = false
    if (idx === -1) { idx = DIAS_CORTO.indexOf(w); debil = true }
    if (idx === -1) continue
    toks.push({ dia: idx + 1, debil: debil, ini: m.index, fin: m.index + m[0].length })
  }
  if (!toks.length) return null
  var out = {}
  var usado = {}
  for (var i = 0; i < toks.length - 1; i++) {
    var entre = t.slice(toks[i].fin, toks[i + 1].ini).trim()
    if (/^(-|a|al|hasta|to|a la|-a-)$/.test(entre)) {
      var d = toks[i].dia
      var guard = 0
      while (guard++ < 8) { out[d] = true; if (d === toks[i + 1].dia) break; d = d === 7 ? 1 : d + 1 }
      usado[i] = true; usado[i + 1] = true
    }
  }
  for (var j = 0; j < toks.length; j++) {
    if (usado[j]) continue
    if (toks[j].debil) continue // «mar» suelto es el mar, no el martes: una abreviatura sólo vale como extremo de un rango
    out[toks[j].dia] = true
  }
  var dias = Object.keys(out).map(Number).sort(function (a, b) { return a - b })
  return dias.length ? dias : null
}

/** Un horario desde TEXTO LIBRE («Jueves-Lunes 08:00-16:00»). null si no se puede interpretar sin adivinar (sin días o sin horas). */
function horarioDeTexto(texto) {
  var dias = leerDias(texto)
  var rango = leerRangoDeHoras(texto)
  if (!dias || !rango) return null
  var h = {}
  dias.forEach(function (d) { h[d] = rango })
  return h
}

/** Un horario desde schema.org (`openingHoursSpecification`) */
function horarioDeJsonLd(spec) {
  var lista = Array.isArray(spec) ? spec : spec ? [spec] : []
  var h = {}
  var hay = false
  lista.forEach(function (s) {
    if (!s || !s.opens || !s.closes) return
    var dias = Array.isArray(s.dayOfWeek) ? s.dayOfWeek : s.dayOfWeek ? [s.dayOfWeek] : []
    var ab = /(\d{1,2}):(\d{2})/.exec(String(s.opens))
    var ce = /(\d{1,2}):(\d{2})/.exec(String(s.closes))
    if (!ab || !ce) return
    var rango = hhmm(ab[1], ab[2]) + '-' + hhmm(ce[1], ce[2])
    dias.forEach(function (dn) {
      var idx = DIAS_EN.indexOf(sinTildes(String(dn).split('/').pop()))
      if (idx === -1) return
      h[idx + 1] = h[idx + 1] ? h[idx + 1] + ',' + rango : rango
      hay = true
    })
  })
  return hay ? h : null
}

/** Un horario desde Google Maps (`openingHours: [{day, hours}]`) · «Cerrado» no aporta un día abierto · «Abierto las 24 horas» = 00:00-24:00 */
function horarioDeMaps(lista) {
  if (!Array.isArray(lista) || !lista.length) return null
  var h = {}
  var hay = false
  lista.forEach(function (x) {
    if (!x) return
    var idx = DIAS_NOMBRE.indexOf(sinTildes(x.day))
    if (idx === -1) idx = DIAS_EN.indexOf(sinTildes(x.day))
    if (idx === -1) return
    var txt = sinTildes(x.hours)
    if (/cerrado|closed/.test(txt)) return
    var r = /24 horas|24 hours|open 24/.test(txt) ? '00:00-24:00' : leerRangoDeHoras(txt)
    if (!r) return
    h[idx + 1] = h[idx + 1] ? h[idx + 1] + ',' + r : r
    hay = true
  })
  return hay ? h : null
}

function canonicoHorario(h) {
  if (!h) return null
  return Object.keys(h).map(Number).sort(function (a, b) { return a - b }).map(function (d) { return d + '=' + h[d] }).join('|')
}

/** «jueves a lunes 07:00–15:00» · agrupa días corridos con las mismas horas (la semana es un círculo: jueves a lunes cruza el domingo) */
function describirHorario(h) {
  if (!h) return null
  var porHoras = {}
  Object.keys(h).forEach(function (d) { (porHoras[h[d]] = porHoras[h[d]] || []).push(Number(d)) })
  var partes = Object.keys(porHoras).map(function (horas) {
    var dias = porHoras[horas].slice().sort(function (a, b) { return a - b })
    // rotar para que la corrida empiece justo después de un hueco (si no hay hueco son los 7 días)
    var inicio = dias[0]
    for (var i = 0; i < dias.length; i++) {
      var prev = dias[i] === 1 ? 7 : dias[i] - 1
      if (dias.indexOf(prev) === -1) { inicio = dias[i]; break }
    }
    var corridas = []
    var visto = {}
    for (var k = 0; k < 7; k++) {
      var d0 = ((inicio - 1 + k) % 7) + 1
      var arranca = dias.indexOf(d0) !== -1
      if (!arranca || visto[d0]) continue
      var run = [d0]
      visto[d0] = true
      var nx = d0 === 7 ? 1 : d0 + 1
      while (dias.indexOf(nx) !== -1 && !visto[nx]) { run.push(nx); visto[nx] = true; nx = nx === 7 ? 1 : nx + 1 }
      corridas.push(run)
    }
    var etiquetas = corridas.map(function (r) { return r.length === 1 ? DIAS_BONITO[r[0] - 1] : r.length === 7 ? 'todos los días' : DIAS_BONITO[r[0] - 1] + ' a ' + DIAS_BONITO[r[r.length - 1] - 1] })
    return { orden: dias[0], texto: etiquetas.join(' y ') + ' ' + horas.replace(/-/g, '–').replace(/,/g, ' y ') }
  })
  partes.sort(function (a, b) { return a.orden - b.orden })
  return partes.map(function (p) { return p.texto }).join('; ')
}

// ───────────────────────────── EXTRACTORES (una fuente → observaciones) ─────────────────────────────
// Observación: { sede: clave|null, ciudad, campo: 'horario'|'direccion'|'canal_pedido', valor_texto, valor_norm, fuente: 'sitio'|'instagram'|'mapas', fuente_ref, observado_en, alcance: 'sede'|'cuenta' }

function digitos(s) { return String(s || '').replace(/\D+/g, '') }
function telefonoNorm(s) {
  var d = digitos(s)
  return d.length >= 9 ? d.slice(-9) : null // 0997744288 y +593997744288 son el mismo número (los últimos 9 dígitos)
}

/** Saca los objetos JSON-LD del texto crudo de una página (el raspador deja el JSON en el texto) · llaves balanceadas, respetando las comillas */
function extraerJsonLd(texto) {
  var t = String(texto || '')
  var out = []
  var desde = 0
  var guard = 0
  while (guard++ < 200) {
    var i = t.indexOf('{"@context"', desde)
    if (i === -1) break
    var prof = 0
    var enTexto = false
    var esc = false
    var fin = -1
    for (var k = i; k < t.length; k++) {
      var c = t.charAt(k)
      if (enTexto) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') enTexto = false; continue }
      if (c === '"') enTexto = true
      else if (c === '{') prof++
      else if (c === '}') { prof--; if (prof === 0) { fin = k; break } }
    }
    if (fin === -1) break
    try { out.push(JSON.parse(t.slice(i, fin + 1))) } catch (e) { /* un bloque ilegible no tumba a los demás */ }
    desde = fin + 1
  }
  return out
}

/** Todos los objetos con dirección dentro de un JSON-LD (el negocio y sus sucursales anidadas) */
function negociosDeJsonLd(nodo, acc) {
  acc = acc || []
  if (!nodo || typeof nodo !== 'object') return acc
  if (Array.isArray(nodo)) { nodo.forEach(function (x) { negociosDeJsonLd(x, acc) }); return acc }
  if (nodo.address && typeof nodo.address === 'object' && (nodo.address.addressLocality || nodo.address.streetAddress)) acc.push(nodo)
  Object.keys(nodo).forEach(function (k) { if (k !== 'address' && k !== 'hasMenu' && typeof nodo[k] === 'object') negociosDeJsonLd(nodo[k], acc) })
  return acc
}

function dirTexto(a) {
  var calle = a.streetAddress ? String(a.streetAddress).trim() : ''
  return calle || null
}

/** El sitio propio (texto crudo de la página): sedes y datos desde sus datos estructurados (schema.org) */
function observacionesDelSitio(contenido, ctx) {
  ctx = ctx || {}
  var ref = ctx.url || null
  var cuando = ctx.crawled_at || null
  var obs = []
  var vistos = {}
  extraerJsonLd(contenido).forEach(function (j) {
    negociosDeJsonLd(j, []).forEach(function (n) {
      var ciudad = n.address.addressLocality ? String(n.address.addressLocality).trim() : null
      if (!ciudad) return
      var empuja = function (campo, texto, norm) {
        var llave = clave(ciudad) + '|' + campo + '|' + (typeof norm === 'string' ? norm : canonicoHorario(norm))
        if (vistos[llave]) return
        vistos[llave] = true
        obs.push({ sede: clave(ciudad), ciudad: ciudad, campo: campo, valor_texto: texto, valor_norm: norm, fuente: 'sitio', fuente_ref: ref, observado_en: cuando, alcance: 'sede' })
      }
      var dir = dirTexto(n.address)
      empuja('ciudad', ciudad, clave(ciudad)) // la sola existencia de la sede en el sitio
      if (dir) empuja('direccion', dir + ', ' + ciudad, clave(dir))
      var h = horarioDeJsonLd(n.openingHoursSpecification)
      if (h) empuja('horario', describirHorario(h), h)
      var tel = telefonoNorm(n.telephone)
      if (tel) empuja('canal_pedido', 'teléfono ' + String(n.telephone).trim(), tel)
    })
  })
  return obs
}

/** La biografía de Instagram: «📍Olon 🕓Jueves-Lunes 08:00-16:00» ata un horario a una sede · un teléfono suelto es de la CUENTA (aplica a todas) */
function observacionesDeInstagram(perfil, ctx) {
  ctx = ctx || {}
  var bio = perfil && perfil.biography ? String(perfil.biography) : ''
  var ref = ctx.url || (perfil && perfil.username ? 'instagram.com/' + perfil.username : null)
  var cuando = ctx.observado_en || null
  var obs = []
  bio.split(/\r?\n/).forEach(function (linea) {
    var pin = /(?:📍|📌)\s*([^🕓🕐🕑🕒🕔🕕⏰⌚☎📞\n]+?)\s*(?=(?:🕓|🕐|🕑|🕒|🕔|🕕|⏰|⌚|☎|📞)|$)/u.exec(linea)
    var resto = pin ? linea.slice(pin.index + pin[0].length) : linea
    var ciudad = pin ? pin[1].replace(/[\s·|,;-]+$/g, '').trim() : null
    var h = horarioDeTexto(resto) || horarioDeTexto(linea)
    if (h) {
      obs.push({ sede: ciudad ? clave(ciudad) : null, ciudad: ciudad, campo: 'horario', valor_texto: describirHorario(h) + ' (bio: «' + linea.trim() + '»)', valor_norm: h, fuente: 'instagram', fuente_ref: ref, observado_en: cuando, alcance: ciudad ? 'sede' : 'cuenta' })
    } else if (ciudad) {
      obs.push({ sede: clave(ciudad), ciudad: ciudad, campo: 'ciudad', valor_texto: ciudad, valor_norm: clave(ciudad), fuente: 'instagram', fuente_ref: ref, observado_en: cuando, alcance: 'sede' })
    }
    var tel = /(?:☎️?|📞|tel[eé]fono|pedidos|whatsapp|wa)\D{0,6}(\+?\d[\d\s-]{7,}\d)/iu.exec(linea)
    if (tel && telefonoNorm(tel[1])) {
      obs.push({ sede: ciudad ? clave(ciudad) : null, ciudad: ciudad, campo: 'canal_pedido', valor_texto: 'teléfono ' + tel[1].trim() + ' (bio de Instagram)', valor_norm: telefonoNorm(tel[1]), fuente: 'instagram', fuente_ref: ref, observado_en: cuando, alcance: ciudad ? 'sede' : 'cuenta' })
    }
  })
  return obs
}

function palabras(s) { return clave(s).split('-').filter(function (x) { return x.length > 2 }) }

/** ¿Este nombre de negocio de Mapas es el del cliente? (comparten una palabra del nombre: «El Mar Marisquería» ~ «Mar») */
function mismoNegocio(tituloMapas, nombreCliente) {
  var a = palabras(tituloMapas)
  var b = palabras(nombreCliente)
  if (!a.length || !b.length) return false
  return b.some(function (p) { return a.indexOf(p) !== -1 })
}

/**
 * Un resultado de Mapas. Sólo observa sobre las sedes YA declaradas por el cliente (`sedes` = [{clave, ciudad}]).
 * Devuelve { observaciones[], descartado: null | {motivo} }. Si la ciudad no es una sede (o el nombre no es el del cliente) se DESCARTA con su motivo: nunca se guarda como dato del cliente.
 */
function observacionesDeMaps(item, sedes, nombreCliente, ctx) {
  ctx = ctx || {}
  if (!item || typeof item !== 'object') return { observaciones: [], descartado: { motivo: 'Mapas no devolvió ninguna ficha' } }
  var ciudadItem = item.city || (item.address ? String(item.address).split(',').slice(-2)[0] : '')
  var cuando = ctx.observado_en || item.scrapedAt || null
  var ref = item.url || ctx.url || null
  if (nombreCliente && !mismoNegocio(item.title, nombreCliente)) {
    return { observaciones: [], descartado: { motivo: 'el nombre de la ficha («' + item.title + '») no es el del cliente («' + nombreCliente + '»)', ciudad: ciudadItem || null } }
  }
  var cc = clave(ciudadItem)
  var sede = (sedes || []).filter(function (s) { return s.clave === cc || (cc && clave(item.address || '').indexOf(s.clave) !== -1) })[0]
  if (!sede) {
    return { observaciones: [], descartado: { motivo: 'la ficha «' + item.title + '» es de «' + (ciudadItem || 'ciudad desconocida') + '», que no es una sede de este cliente (sedes: ' + ((sedes || []).map(function (s) { return s.ciudad }).join(', ') || 'ninguna') + ') · es otro negocio y NO se guarda', ciudad: ciudadItem || null } }
  }
  var obs = []
  var base = { sede: sede.clave, ciudad: sede.ciudad, fuente: 'mapas', fuente_ref: ref, observado_en: cuando, alcance: 'sede' }
  var h = horarioDeMaps(item.openingHours)
  if (h) obs.push(Object.assign({}, base, { campo: 'horario', valor_texto: describirHorario(h), valor_norm: h }))
  var dir = item.street || item.address
  if (dir) obs.push(Object.assign({}, base, { campo: 'direccion', valor_texto: String(dir) + (item.street && ciudadItem ? ', ' + ciudadItem : ''), valor_norm: clave(item.street || item.address) }))
  var tel = telefonoNorm(item.phone)
  if (tel) obs.push(Object.assign({}, base, { campo: 'canal_pedido', valor_texto: 'teléfono ' + item.phone, valor_norm: tel }))
  return { observaciones: obs, descartado: null }
}

// ───────────────────────────── LA FICHA (resolver) ─────────────────────────────

/** ¿dos direcciones son la misma? una contiene a la otra (por palabras) */
function direccionesIguales(a, b) {
  var pa = String(a).split('-').filter(Boolean)
  var pb = String(b).split('-').filter(Boolean)
  if (!pa.length || !pb.length) return false
  var corta = pa.length <= pb.length ? pa : pb
  var larga = pa.length <= pb.length ? pb : pa
  return corta.every(function (p) { return larga.indexOf(p) !== -1 })
}

function normDe(o) { return typeof o.valor_norm === 'string' ? o.valor_norm : canonicoHorario(o.valor_norm) }

/**
 * Por cada campo de una sede: ¿coinciden las fuentes? Estados:
 *   coincide        ≥2 fuentes DISTINTAS dicen lo mismo
 *   una_fuente      una sola fuente lo dice (se usa, declarando de dónde salió)
 *   conflicto       las fuentes dicen cosas DISTINTAS (no se usa ningún valor: se declara)
 *   sin_dato        ninguna fuente lo trae
 *   sin_interpretar hay texto pero no se pudo leer como horario sin adivinar
 */
function resolverCampo(campo, obsDelCampo) {
  var utiles = obsDelCampo.filter(function (o) { return o.valor_norm !== null && o.valor_norm !== undefined })
  var fuentesDe = function (lista) { return lista.map(function (o) { return { fuente: o.fuente, valor: o.valor_texto, fuente_ref: o.fuente_ref || null, observado_en: o.observado_en || null, alcance: o.alcance || 'sede' } }) }
  if (!obsDelCampo.length) return { estado: 'sin_dato', valor: null, fuentes: [] }
  if (!utiles.length) return { estado: 'sin_interpretar', valor: null, fuentes: fuentesDe(obsDelCampo) }
  var grupos = []
  utiles.forEach(function (o) {
    var n = normDe(o)
    var g = grupos.filter(function (x) { return x.n === n || (campo === 'direccion' && direccionesIguales(x.n, n)) })[0]
    if (!g) { g = { n: n, obs: [] }; grupos.push(g) }
    g.obs.push(o)
  })
  if (grupos.length > 1) return { estado: 'conflicto', valor: null, fuentes: fuentesDe(utiles), versiones: grupos.map(function (g) { return { valor: g.obs[0].valor_texto, fuentes: g.obs.map(function (o) { return o.fuente }).filter(function (f, i, a) { return a.indexOf(f) === i } ) } }) }
  var distintas = grupos[0].obs.map(function (o) { return o.fuente }).filter(function (f, i, a) { return a.indexOf(f) === i })
  return { estado: distintas.length >= 2 ? 'coincide' : 'una_fuente', valor: grupos[0].obs[0].valor_texto, norm: grupos[0].obs[0].valor_norm, fuentes: fuentesDe(grupos[0].obs) }
}

/** Una fuente que se volvió a raspar REEMPLAZA a su versión vieja: para decidir se usa lo MÁS RECIENTE de cada (sede · campo · fuente · alcance). El historial queda en la tabla; sólo se decide con lo último. */
function ultimasPorFuente(observaciones) {
  var mejor = {}
  observaciones.forEach(function (o) {
    var k = (o.sede || '') + '|' + o.campo + '|' + o.fuente + '|' + (o.alcance || 'sede')
    var f = String(o.observado_en || '')
    if (mejor[k] === undefined || f > mejor[k]) mejor[k] = f
  })
  return observaciones.filter(function (o) {
    var k = (o.sede || '') + '|' + o.campo + '|' + o.fuente + '|' + (o.alcance || 'sede')
    return String(o.observado_en || '') === mejor[k]
  })
}

/**
 * Une las sedes con sus observaciones. `observaciones` con sede null (alcance «cuenta») cuentan para TODAS las sedes de la cuenta, con su alcance declarado:
 * un horario de la cuenta que no dice a qué sede pertenece y choca con el de una sede se declara como conflicto (no se adivina a cuál sede era).
 */
function resolverSedes(sedes, observaciones) {
  observaciones = ultimasPorFuente(observaciones || [])
  return (sedes || []).map(function (s) {
    var propias = observaciones.filter(function (o) { return o.sede === s.clave && o.campo !== 'ciudad' })
    var cuenta = observaciones.filter(function (o) { return o.sede === null || o.sede === undefined })
    var por = function (campo) { return propias.concat(cuenta).filter(function (o) { return o.campo === campo }) }
    return {
      clave: s.clave,
      ciudad: s.ciudad,
      direccion: resolverCampo('direccion', por('direccion')),
      horario: resolverCampo('horario', por('horario')),
      canal_pedido: resolverCampo('canal_pedido', por('canal_pedido')),
    }
  })
}

/** Las sedes que declara el propio cliente (sitio · Instagram) · Mapas NO crea sedes · el nombre con tilde gana sobre el escrito sin ella */
function descubrirSedes(observaciones) {
  var por = {}
  var orden = []
  observaciones.forEach(function (o) {
    if (!o.sede || (o.fuente !== 'sitio' && o.fuente !== 'instagram') || !o.ciudad) return
    if (!por[o.sede]) { por[o.sede] = { clave: o.sede, ciudad: o.ciudad }; orden.push(o.sede) }
    else if (/[^\x00-\x7f]/.test(o.ciudad) && !/[^\x00-\x7f]/.test(por[o.sede].ciudad)) por[o.sede].ciudad = o.ciudad
  })
  return orden.map(function (k) { return por[k] })
}

// ───────────────────────────── LO QUE SE LE DICE AL PRODUCTOR ─────────────────────────────

/** Dónde buscar la ficha de Mapas: por sede, con dirección y ciudad (NO el país). Sin sedes y sin ubicación en la ficha ⇒ [] (no se ofrece la opción). */
function ubicacionesParaMapas(resueltas, ficha) {
  var out = (resueltas || []).map(function (s) {
    var dir = s.direccion && s.direccion.valor
    var donde = dir ? (dir.toLowerCase().indexOf(String(s.ciudad).toLowerCase()) === -1 ? dir + ', ' + s.ciudad : dir) : s.ciudad
    return { ciudad: s.ciudad, donde: donde }
  })
  if (out.length) return out
  // sin sedes: lo que la ficha del cliente traiga como ciudad (nunca el país solo: «Ecuador» trajo la ficha de OTRO negocio)
  var f = ficha || {}
  var ciudad = [f.city, f.ciudad].filter(function (x) { return typeof x === 'string' && x.trim() })[0]
  if (!ciudad && typeof f.market === 'string' && f.market.trim()) {
    var primera = f.market.split(/[·|,;\/]/)[0].trim()
    if (primera && clave(primera) !== clave(f.country || '')) ciudad = primera
  }
  return ciudad ? [{ ciudad: ciudad, donde: ciudad }] : []
}

var ESTADO_FRASE = {
  coincide: 'confirmado por más de una fuente',
  una_fuente: 'visto sólo en una fuente',
  conflicto: 'LAS FUENTES NO COINCIDEN',
  sin_dato: 'SIN DATO',
  sin_interpretar: 'hay texto pero no se pudo leer sin adivinar',
}

function lineaDeCampo(nombre, c) {
  if (c.estado === 'sin_dato') return '     · ' + nombre + ': SIN DATO (ninguna fuente lo trae)'
  if (c.estado === 'conflicto') {
    return '     · ' + nombre + ': LAS FUENTES NO COINCIDEN · ' + c.versiones.map(function (v) { return '«' + v.valor + '» (' + v.fuentes.join(' + ') + ')' }).join(' ≠ ')
  }
  if (c.estado === 'sin_interpretar') return '     · ' + nombre + ': ' + ESTADO_FRASE.sin_interpretar + ' · ' + c.fuentes.map(function (f) { return f.fuente + ': «' + f.valor + '»' }).join(' · ')
  var cuando = c.fuentes[0] && c.fuentes[0].observado_en ? ' · visto ' + String(c.fuentes[0].observado_en).slice(0, 10) : ''
  var cuenta = c.fuentes.some(function (f) { return f.alcance === 'cuenta' }) ? ' · ojo: lo dice la cuenta, sin decir de qué sede' : ''
  return '     · ' + nombre + ': ' + c.valor + ' (' + ESTADO_FRASE[c.estado] + ': ' + c.fuentes.map(function (f) { return f.fuente }).filter(function (f, i, a) { return a.indexOf(f) === i }).join(' + ') + cuando + ')' + cuenta
}

/** El bloque del pedido con las sedes. Declara lo que falta o choca: el productor NO puede rellenarlo. */
function bloqueDeSedes(resueltas, estado) {
  if (estado && estado.error) {
    return ['D) LAS SEDES. NO se pudieron leer las sedes del cliente (' + String(estado.error).slice(0, 120) + '). No afirmes ningún horario, dirección ni teléfono que no venga en el brief: declara en «no_pude_cumplir» que las sedes no se pudieron leer.'].join('\n')
  }
  if (!resueltas || !resueltas.length) {
    return 'D) LAS SEDES. El sistema NO tiene sedes registradas para este cliente. No afirmes ningún horario, dirección ni teléfono que no venga en el brief; si el brief da un horario, dilo como lo da el brief y declara que no está verificado.'
  }
  var lineas = ['D) LAS SEDES del cliente, según lo que el SISTEMA vio en sus propias fuentes (sitio · Instagram · Mapas). Cada dato dice de dónde salió.']
  resueltas.forEach(function (s) {
    lineas.push('   - Sede ' + s.ciudad + ':')
    lineas.push(lineaDeCampo('dirección', s.direccion))
    lineas.push(lineaDeCampo('horario', s.horario))
    lineas.push(lineaDeCampo('canal de pedido', s.canal_pedido))
  })
  lineas.push('   Reglas: el brief dice a qué sede y a qué ciudad apunta la pieza: usa SOLO el horario de ESA sede. Si el dato de esa sede es «SIN DATO» o «NO COINCIDEN», NO lo inventes ni elijas uno: escribe la pieza sin horario (o con el que dé el brief, diciendo que no está verificado) y declara el hueco en «no_pude_cumplir». Nunca le preguntes el horario al dueño.')
  return lineas.join('\n')
}

// ───────────────────────────── LA VOZ (textos propios) ─────────────────────────────

/** Los textos de los posts propios como referencia de voz: los más recientes, sin repetir, sin la cola de hashtags, recortados. */
function textosPropios(posts, opciones) {
  var max = (opciones && opciones.max) || 8
  var largo = (opciones && opciones.largo) || 320
  var lista = Array.isArray(posts) ? posts.slice() : []
  lista.sort(function (a, b) { return String((b && b.timestamp) || '').localeCompare(String((a && a.timestamp) || '')) })
  var vistos = {}
  var out = []
  for (var i = 0; i < lista.length && out.length < max; i++) {
    var p = lista[i]
    if (!p || typeof p.caption !== 'string') continue
    var t = p.caption.replace(/(\s*#[\p{L}\p{N}_]+){3,}\s*$/u, '').replace(/\s+/g, ' ').trim()
    if (t.length < 20) continue
    var k = clave(t).slice(0, 60)
    if (vistos[k]) continue
    vistos[k] = true
    out.push({ fecha: p.timestamp ? String(p.timestamp).slice(0, 10) : null, texto: t.length > largo ? t.slice(0, largo).replace(/\s+\S*$/, '') + '…' : t, post: p.shortCode || null })
  }
  return out
}

/** El bloque de voz del pedido · si no hay textos propios se DECLARA */
function bloqueDeVoz(textos) {
  if (!textos || !textos.length) {
    return 'E) LA VOZ. No hay textos de posts propios del cliente guardados en el sistema: no tienes una referencia de voz aparte del brief y del manual. Decláralo en «no_pude_cumplir» («sin textos propios de referencia») y escribe con la voz del manual.'
  }
  return ['E) LA VOZ. Estos son textos de posts PROPIOS del cliente (los más recientes primero). Úsalos SÓLO para captar el tono y las palabras de la casa: no los copies, no repitas sus datos (pueden estar viejos) y no importes de ellos nada que el brief prohíba.',
    '   Algunos pueden ser de colaboradores o estar en otro registro: el manual y el brief mandan. El español es de Ecuador: TUTEA siempre («escríbenos», «pídelo»), aunque algún texto de referencia use otra forma.']
    .concat(textos.map(function (t, i) { return '   ' + (i + 1) + '. [' + (t.fecha || 's/f') + '] «' + t.texto + '»' })).join('\n')
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    clave: clave, leerDias: leerDias, leerRangoDeHoras: leerRangoDeHoras, horarioDeTexto: horarioDeTexto, horarioDeJsonLd: horarioDeJsonLd, horarioDeMaps: horarioDeMaps,
    canonicoHorario: canonicoHorario, describirHorario: describirHorario, telefonoNorm: telefonoNorm, extraerJsonLd: extraerJsonLd,
    observacionesDelSitio: observacionesDelSitio, observacionesDeInstagram: observacionesDeInstagram, observacionesDeMaps: observacionesDeMaps, mismoNegocio: mismoNegocio,
    descubrirSedes: descubrirSedes, ultimasPorFuente: ultimasPorFuente, resolverCampo: resolverCampo, resolverSedes: resolverSedes, ubicacionesParaMapas: ubicacionesParaMapas,
    bloqueDeSedes: bloqueDeSedes, textosPropios: textosPropios, bloqueDeVoz: bloqueDeVoz,
  }
}
