/**
 * KIT DE HISTORIAS POR CÓDIGO · ronda 80 (D4) · CC#2 · 2026-10-13 · firma de Emilio 13-oct «desmenuzar el trabajo»: cada nivel entrega lo macro y el siguiente detalla lo suyo.
 *
 * Lógica PURA (sin red, sin `this`, sin `require`): se pega entera en el nodo «④ Chequeos» de la copia por filas (estilo `var` + `function`) y la corren las pruebas.
 * AGNÓSTICA: no nombra clientes ni rubros. Qué filas van al kit lo dice el DATO `familia === 'kit_historias'` de `cadena_formatos_por_red` (historia de Instagram/Facebook, estado de WhatsApp…).
 *
 * Qué hace: las filas de la familia kit de UN lote (= una semana ISO) se agrupan en UN brief de kit. Cada fila = un elemento
 *   `AAAA-MM-DD HH:MM | historia|estado | tema | pilar | dato: valor; dato: valor`
 * con la fecha y la hora DE LA FILA (nunca de una frase). El redactor del parte ya NO entrega la lista de elementos: solo lo macro de la semana (tema, objetivo, mensaje…);
 * sus entregables sobre esas filas se absorben en el kit (se toma el primero como fuente de lo macro).
 *
 * Lo que NO hace: no corrige nada. Una fila con fecha u hora ilegible entra al kit TAL CUAL se leyó y la sala 3 falla visible («no se entiende el elemento»).
 * Sin filas de kit en el lote: el parte queda exactamente como lo entregó el redactor (no hay kit).
 */
var FAMILIA_DEL_KIT = 'kit_historias'

function kitTextoLimpio(s) {
  return String(s === undefined || s === null ? '' : s).replace(/[\r\n]+/g, ' ').replace(/\|/g, '/').replace(/\s+/g, ' ').trim()
}

function kitEsFechaReal(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
  var d = new Date(s + 'T00:00:00Z')
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s
}

function kitEsHoraReal(h) {
  var m = /^(\d{2}):(\d{2})/.exec(String(h))
  return !!m && Number(m[1]) <= 23 && Number(m[2]) <= 59
}

/** las filas del lote que van al kit (por el dato `familia`), ordenadas por fecha, hora e id */
function filasDelKit(filasLote) {
  var out = (Array.isArray(filasLote) ? filasLote : []).filter(function (f) { return f && f.id && f.familia === FAMILIA_DEL_KIT })
  return out.slice().sort(function (a, b) {
    var ka = String(a.fecha || '') + ' ' + String(a.hora || '') + ' ' + String(a.id)
    var kb = String(b.fecha || '') + ' ' + String(b.hora || '') + ' ' + String(b.id)
    return ka < kb ? -1 : ka > kb ? 1 : 0
  })
}

/** «historia» o «estado» (el estado es el formato de WhatsApp) */
function kitDestino(f) {
  var fmt = String(f.formato || '').toLowerCase()
  return fmt === 'estado' || String(f.red || '').toLowerCase() === 'whatsapp' ? 'estado' : 'historia'
}

/** UNA línea de elemento a partir de UNA fila. Fecha u hora que no existen: se escriben tal cual (la sala 3 las rechaza, no se corrigen aquí). */
function lineaDeElemento(f) {
  var fecha = kitTextoLimpio(f.fecha) || '(fecha vacía)'
  var hora = f.hora === undefined || f.hora === null || f.hora === '' ? '' : kitTextoLimpio(f.hora)
  var cuando = fecha
  if (hora) cuando = fecha + ' ' + (kitEsHoraReal(hora) ? hora.slice(0, 5) : hora)
  var datos = (Array.isArray(f.datos) ? f.datos : []).map(function (d) {
    if (d && typeof d === 'object') return kitTextoLimpio(d.dato) && kitTextoLimpio(d.valor) ? kitTextoLimpio(d.dato) + ': ' + kitTextoLimpio(d.valor).replace(/;/g, ',') : kitTextoLimpio(d.valor || d.dato).replace(/;/g, ',')
    return kitTextoLimpio(d).replace(/;/g, ',')
  }).filter(Boolean).join('; ')
  return cuando + ' | ' + kitDestino(f) + ' | ' + kitTextoLimpio(f.tema) + ' | ' + kitTextoLimpio(f.pilar) + (datos ? ' | ' + datos : '')
}

function kitSiguienteId(entregables) {
  var max = 0
  entregables.forEach(function (e) { var m = e && e.id ? /^BRF-(\d{4})$/.exec(String(e.id)) : null; if (m && Number(m[1]) > max) max = Number(m[1]) })
  return 'BRF-' + ('0000' + (max + 1)).slice(-4)
}

function kitMayuscula(s) { s = String(s || ''); return s ? s.charAt(0).toUpperCase() + s.slice(1) : s }

var CAMPOS_MACRO_DEL_KIT = ['de_que_parte_del_plan', 'objetivo', 'segmento', 'protagonista', 'mensaje', 'hipotesis', 'limites', 'vocabulario_obligatorio', 'prohibido', 'sintaxis', 'visual', 'llamado_a_la_accion', 'variantes', 'negativos', 'aprueba_y_para_cuando', 'presupuesto']

/**
 * Agrupa las filas de kit del lote en UN entregable de kit.
 * `parte` = lo que entregó el redactor ({ entregables, … }) · `filasLote` = las filas del lote CON su `familia` · devuelve { parte, kit }.
 * `kit` = null si el lote no tiene filas de kit; si no, { brief_id, fila_ids, elementos, absorbidos[] }. NO modifica sus argumentos.
 */
function agruparKit(parte, filasLote) {
  var filas = filasDelKit(filasLote)
  if (!filas.length) return { parte: parte, kit: null }
  var ids = filas.map(function (f) { return f.id })
  var estaEnElKit = function (e) {
    if (!e) return false
    if (e.fila_id && ids.indexOf(e.fila_id) !== -1) return true
    return Array.isArray(e.fila_ids) && e.fila_ids.length > 0 && e.fila_ids.every(function (x) { return ids.indexOf(x) !== -1 })
  }
  var ents = Array.isArray(parte && parte.entregables) ? parte.entregables : []
  var absorbidos = ents.filter(estaEnElKit)
  var macro = absorbidos[0] || {}
  var primeraRed = String((filas.filter(function (f) { return String(f.red).toLowerCase() !== 'whatsapp' })[0] || filas[0]).red || '')
  var kit = { id: kitSiguienteId(ents), fila_id: null, fila_ids: ids, es_kit: true, plataforma: macro.plataforma || kitMayuscula(primeraRed), tipo_de_pieza: 'kit', que_es: macro.que_es || ('Kit semanal de historias y estados (' + filas.length + (filas.length === 1 ? ' elemento' : ' elementos') + ')'), elementos: filas.map(lineaDeElemento) }
  CAMPOS_MACRO_DEL_KIT.forEach(function (k) { if (macro[k] !== undefined) kit[k] = macro[k] })
  // el kit ocupa el lugar del primer entregable que absorbe (o va al final si el redactor no dijo nada de esas filas)
  var nuevos = []
  var puesto = false
  ents.forEach(function (e) {
    if (!estaEnElKit(e)) { nuevos.push(e); return }
    if (!puesto) { nuevos.push(kit); puesto = true }
  })
  if (!puesto) nuevos.push(kit)
  var nueva = {}
  Object.keys(parte || {}).forEach(function (k) { nueva[k] = parte[k] })
  nueva.entregables = nuevos
  return { parte: nueva, kit: { brief_id: kit.id, fila_ids: ids, elementos: kit.elementos, absorbidos: absorbidos.map(function (e) { return e.id || null }) } }
}

if (typeof module !== 'undefined' && module.exports) module.exports = { FAMILIA_DEL_KIT: FAMILIA_DEL_KIT, filasDelKit: filasDelKit, lineaDeElemento: lineaDeElemento, agruparKit: agruparKit, kitDestino: kitDestino, kitEsFechaReal: kitEsFechaReal, kitEsHoraReal: kitEsHoraReal }
