/**
 * EL PLAN DE 90 DÍAS A PRIMER NIVEL · v2 AGNÓSTICA (ronda 73) · texto plano apto para pegar en los nodos Code de n8n (sin require/import/export; estilo `var` + `function`).
 * Lo usan «Redactor (B4)» (la ficha limpia, el bloque de instrucciones, el contexto del chequeo) y «¿Llegó la vuelta?» (el chequeo del plan que volvió).
 *
 * 🔴 AGNÓSTICO: nada de esto sabe de un cliente, un lugar ni un rubro. Todo sale de la ficha, el manual, el cerebro y la investigación de CADA cliente.
 *    Los códigos de moneda y de país de abajo son DATOS (se amplían sin tocar la lógica). Una prueba hace grep de este archivo: 0 nombres, lugares ni rubros de un cliente.
 */

// ───────────────────────── 1 · LA FICHA QUE VE EL REDACTOR: sin topes ni reglas internas
// Claves de la ficha que son de la casa (topes de gasto, límites, llaves…): NO viajan al redactor, así que no pueden aparecer en el plan.
var CLAVES_INTERNAS = /spend|(^|_)cap(_|$)|tope|limit|quota|cuota|freno|budget_?rule|interno|internal|secret|token|api_?key|password|clave_?api/i

/** copia de la ficha sin las claves internas, en cualquier nivel · devuelve también las rutas quitadas (solo nombres de clave, nunca valores) */
function fichaLimpia(ficha) {
  var quitadas = []
  function limpiar(v, ruta) {
    if (Array.isArray(v)) return v.map(function (x, i) { return limpiar(x, ruta + '[' + i + ']') })
    if (v && typeof v === 'object') {
      var out = {}
      Object.keys(v).forEach(function (k) {
        if (CLAVES_INTERNAS.test(k)) { quitadas.push((ruta ? ruta + '.' : '') + k); return }
        out[k] = limpiar(v[k], (ruta ? ruta + '.' : '') + k)
      })
      return out
    }
    return v
  }
  return { ficha: limpiar(ficha && typeof ficha === 'object' ? ficha : {}, ''), quitadas: quitadas }
}

// ───────────────────────── 2 · LA IDENTIDAD VISUAL Y LA MONEDA: salen de la ficha y del manual
function _lista(v) {
  if (Array.isArray(v)) return v.reduce(function (a, x) { return a.concat(typeof x === 'string' ? [x] : (x && typeof x === 'object' ? _lista(x.nombre || x.name || x.hex || x.valor || x.value || []) : [])) }, [])
  if (typeof v === 'string') return [v]
  return []
}
// solo los colores de seis dígitos (los de tres se confunden con una etiqueta o un número de punto)
function _hexes(texto) { return (String(texto == null ? '' : texto).match(/#[0-9a-fA-F]{6}\b/g) || []).map(function (h) { return h.toLowerCase() }) }

/** colores y tipografías declarados: la unión de las columnas de la ficha y las del manual (+ lo que el texto del manual nombra como tipografía) */
function identidadDeclarada(ficha, manual) {
  var f = ficha || {}, m = manual || {}
  var colores = {}, fuentes = {}
  _lista(f.brand_colors).concat(_lista(m.primary_colors)).forEach(function (c) { _hexes(c).forEach(function (h) { colores[h] = true }) })
  _hexes(typeof m.content_text === 'string' ? m.content_text : '').forEach(function (h) { colores[h] = true })
  _lista(f.brand_fonts).concat(_lista(m.typography)).forEach(function (t) { if (String(t).trim()) fuentes[String(t).trim().toLowerCase()] = String(t).trim() })
  if (typeof m.content_text === 'string') {
    try {
      var d = JSON.parse(m.content_text); d = d && d.brand_book_draft ? d.brand_book_draft : d
      ;_lista(d && (d.tipografias || d.typography)).forEach(function (t) { if (String(t).trim()) fuentes[String(t).trim().toLowerCase()] = String(t).trim() })
    } catch (e) { /* ilegible: se ignora, no se inventa */ }
  }
  return { colores: Object.keys(colores), tipografias: Object.keys(fuentes).map(function (k) { return fuentes[k] }) }
}

// DATO · moneda por país cuando nadie la declaró (baja confianza · se declara como omisión) · sin país conocido no hay moneda por omisión
var MONEDA_POR_PAIS = { ecuador: 'USD', panama: 'USD', 'el salvador': 'USD', 'estados unidos': 'USD', mexico: 'MXN', colombia: 'COP', peru: 'PEN', argentina: 'ARS', chile: 'CLP', uruguay: 'UYU', bolivia: 'BOB', paraguay: 'PYG', brasil: 'BRL', guatemala: 'GTQ', 'costa rica': 'CRC', 'republica dominicana': 'DOP', espana: 'EUR', francia: 'EUR', alemania: 'EUR', italia: 'EUR', portugal: 'EUR', 'reino unido': 'GBP', canada: 'CAD' }
var CODIGOS_DE_MONEDA = ['USD', 'EUR', 'GBP', 'CAD', 'MXN', 'COP', 'PEN', 'ARS', 'CLP', 'UYU', 'BOB', 'PYG', 'BRL', 'GTQ', 'CRC', 'DOP', 'PAB']
function _sinTil(s) { return String(s == null ? '' : s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim() }
function _codigoDeMoneda(v) {
  var t = String(v == null ? '' : v).trim().toUpperCase()
  if (CODIGOS_DE_MONEDA.indexOf(t) >= 0) return t
  var n = _sinTil(v)
  if (/dolar/.test(n)) return 'USD'
  if (/\beuro/.test(n)) return 'EUR'
  return null
}
/** la moneda: la que declara la ficha o el manual; si no, la del país de la ficha (declarada como omisión); si no, sin dato (se pregunta, no se inventa) */
function monedaDelCliente(ficha, manual) {
  var f = ficha || {}, m = manual || {}, c = f.config && typeof f.config === 'object' ? f.config : {}
  var declarada = [c.currency, c.moneda, f.currency, f.moneda, m.currency, m.moneda].map(_codigoDeMoneda).filter(Boolean)[0]
  if (declarada) return { codigo: declarada, fuente: 'declarada en la ficha o el manual' }
  var porPais = MONEDA_POR_PAIS[_sinTil(f.country)]
  if (porPais) return { codigo: porPais, fuente: 'por omisión del país de la ficha (nadie la declaró)' }
  return { codigo: null, fuente: 'sin dato' }
}

// ───────────────────────── 3 · LAS INSTRUCCIONES (generales: cada cliente aporta su propio contenido)
/** líneas que se suman al pedido del redactor · `ctx` = { identidad, moneda } */
function bloquePrimerNivel(ctx) {
  var id = (ctx && ctx.identidad) || { colores: [], tipografias: [] }, mo = (ctx && ctx.moneda) || { codigo: null, fuente: 'sin dato' }
  var L = []
  L.push('══════ EL PLAN A PRIMER NIVEL ══════')
  L.push('Este bloque MANDA sobre el documento de referencia donde se contradigan: no hay un reparto fijo del presupuesto entre canales (lo propones tú desde la meta) y ninguna regla interna que el documento mencione se le muestra al cliente.')
  L.push('')
  L.push('QUÉ SE LE MUESTRA AL CLIENTE. El plan lo lee el dueño del negocio. No escribas en él reglas ni topes internos de la agencia, ni a quién se le atribuyen, ni nombres de campos, tablas, variables o herramientas internas (nada con guiones bajos ni en código).')
  L.push('Cuando cites de dónde sale un dato, nómbralo en lenguaje llano (por ejemplo «la ficha pública del negocio en el mapa», «las estadísticas del sitio», «la biblioteca pública de anuncios»), no por su nombre interno.')
  L.push('')
  L.push('1. EL PRESUPUESTO SALE DE LA META, NO DE UN TOPE. Parte de la meta del negocio (si es muy alta, se respeta). Calcula en este orden y muéstralo con cifras:')
  L.push('   a) la meta expresada en ventas o clientes necesarios;')
  L.push('   b) el costo por cliente o por venta, con su fuente o un rango de mercado declarado como tal (nunca un número sin origen);')
  L.push('   c) el presupuesto que alcanza esa meta (a × b) y, al menos, DOS ESCENARIOS (por ejemplo prudente y ambicioso) con lo que se espera de cada uno.')
  L.push('   No existe un techo artificial. El ÚNICO límite que declaras es la capacidad operativa del propio negocio (lo que puede atender, producir o entregar) cuando está declarada en los datos que recibes o se observa en ellos; si no se sabe, formúlala como una PREGUNTA al dueño, no la inventes.')
  L.push('')
  L.push('2. MOMENTOS DE COMPRA DE ESTE MERCADO. Identifica, con las fuentes que recibes (manual, cerebro, investigación, fechas que el cliente declare), los momentos en que ESTE público compra: estacionalidad, ciclos, fechas propias del negocio. Marca los picos en el calendario y sube la inversión ANTES de cada uno. No uses un calendario fijo de ningún país: si una fecha no sale de las fuentes, no la pongas.')
  L.push('')
  L.push('3. IDEA DE MARCA. Propón UNA idea que una todas las piezas, tomada del manual (su frase propia, su propósito, su voz). Reserva una parte del presupuesto para construir marca, no solo para activar ventas, y fija una meta de recordación además de las metas de ventas.')
  L.push('')
  L.push('4. DISPONIBILIDAD. Describe dónde y cómo puede comprar el cliente del cliente: canales propios, socios, puntos de contacto, intermediarios y la forma de acceso que corresponda a su rubro, según las fuentes. Señala dónde falta presencia y qué la resolvería.')
  L.push('')
  L.push('5. CALENDARIO DE 12 SEMANAS con tema, formato y fecha de cada semana, y un PLAN DE RECOMPRA Y RETENCIÓN (qué se hace con quien ya compró, cuándo y con qué señal).')
  L.push('')
  L.push('6. LA AGENCIA ES AGÉNTICA. Escribe como trabajo de la agencia lo que hacen los agentes: variantes creativas en volumen y pruebas, optimización continua, contenido para las salas de trabajo, respuestas tipo y reportes. Al cliente solo se le piden las acciones que exige su cuenta o su operación (accesos, aprobaciones, capacidad, responder a quienes escriban).')
  L.push('')
  L.push('7. IDENTIDAD VISUAL Y MONEDA. Usa SOLO lo que dicen el manual y la ficha:')
  L.push('   - colores permitidos: ' + (id.colores.length ? id.colores.join(' · ') : '(el manual no declara colores: no cites ninguno y di que falta)'))
  L.push('   - tipografías permitidas: ' + (id.tipografias.length ? id.tipografias.join(' · ') : '(el manual no declara tipografías: no cites ninguna y di que falta)'))
  L.push('   - moneda: ' + (mo.codigo ? mo.codigo + ' (' + mo.fuente + '). Todas las cifras de dinero van en esa moneda y no mezclas otra.' : '(no está declarada: no asumas una; pregúntala al dueño y deja las cifras en la unidad en que vengan los datos)'))
  L.push('')
  return L
}

// ───────────────────────── 4 · EL CHEQUEO DEL PLAN QUE VOLVIÓ (código, sin modelo)
// Marca lo que NO debe llegar al cliente. No corrige el texto: dice qué hay que revisar. Los ejemplos van para quien certifica (en la salida del nodo), no dentro del plan.
function _plano(texto) { return String(texto == null ? '' : texto).split('\\_').join('_').split('\\*').join('*').split('\\#').join('#') }
function _ejemplos(texto, re, max) {
  var out = [], m, r = new RegExp(re.source, re.flags.indexOf('g') >= 0 ? re.flags : re.flags + 'g')
  while ((m = r.exec(texto)) !== null && out.length < max) { out.push(String(m[0]).replace(/\s+/g, ' ').slice(0, 90)); if (m[0] === '') r.lastIndex++ }
  return out
}
var RE_TOPE = /spend[_ ]?cap|\btope[s]? (?:diario|de gasto|interno)|\btecho (?:diario|interno)|\b(?:cap|tope) (?:diario|interno)|registrad[oa] en la configuraci[oó]n del cliente/i
var RE_REGLA_INTERNA = /(?:regla|reparto|porcentaje|n[uú]mero|criterio|decisi[oó]n)s? de la casa|fijad[oa]s? por la casa|\bla casa\b(?=[^.\n]{0,70}(?:acept|fij|regla|reparto|porcentaje|inamovible|discut|decide))|inamovible|no se discute/i
var RE_NOMBRE_INTERNO = /(?:\b[a-z]{2,}(?:_[a-z0-9]{2,})+\b)|(?:\b[a-z]+[A-Z][A-Za-z]{3,}\b)/g
var RE_GASTO_POR_DIA_X_DIAS = /\d[\d.,]*\s*(?:[a-z]{3}|us\$|\$|€|£)?\s*(?:\/|por|al)\s*d[ií]a[^.\n]{0,25}[×x*][^.\n]{0,8}\d{2,3}\s*d[ií]as/i

/** `ctx` = { identidad: {colores, tipografias}, moneda: {codigo} } · devuelve { ok, marcas:[{codigo, que, ejemplos}] } */
function revisarPlan(texto, ctx) {
  var t = _plano(texto), marcas = []
  var id = (ctx && ctx.identidad) || { colores: [], tipografias: [] }, mo = (ctx && ctx.moneda) || { codigo: null }
  var sinUrls = t.replace(/https?:\/\/\S+|\b[\w.+-]+@[\w-]+\.[\w.]+/g, ' ')

  var topes = _ejemplos(t, RE_TOPE, 3)
  if (topes.length) marcas.push({ codigo: 'P1', que: 'el plan nombra o usa un tope interno de gasto', ejemplos: topes })

  var reglas = _ejemplos(t, RE_REGLA_INTERNA, 3)
  if (reglas.length) marcas.push({ codigo: 'P2', que: 'el plan muestra una regla interna de la agencia como si fuera del cliente', ejemplos: reglas })

  var internos = _ejemplos(sinUrls.replace(/`[^`]*`/g, function (m) { return m.replace(/`/g, ' ') }), RE_NOMBRE_INTERNO, 6)
  if (internos.length) marcas.push({ codigo: 'P3', que: 'el plan lleva nombres internos (campos, variables o herramientas) en vez de lenguaje llano', ejemplos: internos })

  // P4 · el presupuesto sale de la meta: meta → ventas/clientes necesarios → costo por cliente con fuente → presupuesto, con escenarios y sin cuenta de tope × días
  var faltan = []
  if (/presupuesto/i.test(t)) {
    if (!/meta[^.\n]{0,160}\d|\d[^.\n]{0,60}meta/i.test(t)) faltan.push('la meta con cifra')
    if (!/necesari[oa]s?[^.\n]{0,60}(?:ventas|clientes|pedidos|contratos|leads|cuentas)|(?:ventas|clientes|pedidos|contratos|leads|cuentas)[^.\n]{0,40}necesari[oa]s?/i.test(t)) faltan.push('las ventas o clientes necesarios')
    if (!/(?:costo|coste)[^.\n]{0,25}(?:por|de)[^.\n]{0,20}(?:cliente|venta|lead|adquisici[oó]n|conversi[oó]n)|\b(?:cpa|cac)\b/i.test(t)) faltan.push('el costo por cliente')
    if (!/(?:fuente|rango|referencia|benchmark|estimaci[oó]n|promedio)[^.\n]{0,80}(?:costo|coste|cpa|cac|mercado)|(?:costo|coste|cpa|cac)[^.\n]{0,120}(?:fuente|rango|referencia|benchmark|estimaci[oó]n|promedio)/i.test(t)) faltan.push('la fuente o rango del costo por cliente')
    var esc = {}; (t.match(/escenarios?\s+[a-záéíóúñ0-9]+/gi) || []).forEach(function (x) { esc[x.toLowerCase().replace(/^escenarios?\s+/, '')] = true })
    var nEsc = Object.keys(esc).length || ((t.match(/escenario/gi) || []).length >= 2 ? 2 : 0)
    if (nEsc < 2) faltan.push('al menos dos escenarios')
  } else { faltan.push('no hay presupuesto') }
  var cuenta = _ejemplos(t, RE_GASTO_POR_DIA_X_DIAS, 2)
  if (cuenta.length) faltan.push('el presupuesto sale de un gasto diario × días (un tope, no la meta)')
  if (faltan.length) marcas.push({ codigo: 'P4', que: 'el presupuesto no sale de la meta: falta ' + faltan.join(', '), ejemplos: cuenta })

  // P5 · identidad visual fuera del manual
  var fuera = []
  var declaradosC = {}; id.colores.forEach(function (c) { declaradosC[String(c).toLowerCase()] = true })
  _hexes(t).forEach(function (h) { if (!declaradosC[h] && fuera.indexOf(h) < 0) fuera.push(h) })
  var declaradosF = {}; id.tipografias.forEach(function (f) { declaradosF[String(f).toLowerCase()] = true })
  ;(t.match(/(?:tipograf[ií]as?|fuentes? tipogr[aá]ficas?)\s*(?:de la marca|del manual)?\s*[:\-–]?\s*([^.\n]{1,120})/gi) || []).forEach(function (frase) {
    var cola = frase.replace(/^[^:\-–]*?(?:tipograf[ií]as?|fuentes? tipogr[aá]ficas?)\s*(?:de la marca|del manual)?\s*[:\-–]?\s*/i, '')
    cola.split(/,| y | e |·|\/|;/).forEach(function (n) {
      var nombre = n.replace(/[()«»"*_]/g, '').trim()
      if (/^[A-ZÁÉÍÓÚÑ][\w'’ ]{2,30}$/.test(nombre) && nombre.split(' ').length <= 4 && !declaradosF[nombre.toLowerCase()] && fuera.indexOf(nombre) < 0) fuera.push(nombre)
    })
  })
  if (fuera.length) marcas.push({ codigo: 'P5', que: 'el plan cita colores o tipografías que el manual y la ficha no declaran', ejemplos: fuera.slice(0, 6) })

  // P6 · moneda distinta de la declarada (sin moneda declarada no se puede comprobar: se dice en el contexto, no se marca)
  if (mo.codigo) {
    var otras = []
    ;(t.match(/\b(?:USD|EUR|GBP|CAD|MXN|COP|PEN|ARS|CLP|UYU|BOB|PYG|BRL|GTQ|CRC|DOP|PAB)\b/g) || []).forEach(function (c) { if (c !== mo.codigo && otras.indexOf(c) < 0) otras.push(c) })
    if (mo.codigo !== 'EUR' && /€/.test(t)) otras.push('€')
    if (mo.codigo !== 'GBP' && /£/.test(t)) otras.push('£')
    if (otras.length) marcas.push({ codigo: 'P6', que: 'el plan usa una moneda distinta de la declarada (' + mo.codigo + ')', ejemplos: otras })
  }
  return { ok: marcas.length === 0, marcas: marcas }
}

/** el bloque que el SISTEMA añade al final del plan cuando el chequeo marca algo · sin citar nada de lo marcado (el detalle va en la salida del nodo) */
function bloqueDeRevisionDelPlan(r) {
  if (!r || r.ok) return ''
  return '\n\n## Revisión del plan (la hace el sistema)\n- Antes de enviarlo al cliente hay que revisar: ' + r.marcas.map(function (m) { return m.que }).join(' · ') + '.'
}
