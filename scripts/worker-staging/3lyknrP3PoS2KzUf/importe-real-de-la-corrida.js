// ═══ IMPORTE REAL DE LA CORRIDA (ronda 68 · CC#1 · 2026-10-11) ═══
// El Servicio llama a Apify con `run-sync-get-dataset-items`: la respuesta es la lista de filas y NO trae el identificador de la corrida ni lo que costó.
// Preguntar «la última corrida de este actor» no sirve con varias llamadas a la vez (CC#2 · 11-sep: cuatro filas con el mismo identificador). Lo que SÍ es único
// de cada llamada es lo que se le MANDÓ: la entrada (INPUT) de la corrida queda guardada en su almacén de la cuenta. Se busca, entre las corridas que empezaron
// y terminaron DENTRO de esta llamada, la que tiene como entrada lo que mandamos. Una sola ⇒ ese es su importe real. Cero o varias ⇒ NO se adivina: sin importe y con el motivo.
var VENTANA_ANTES_MS = 20000
var VENTANA_DESPUES_MS = 15000
var MAX_CANDIDATAS = 40

/** todo lo de `a` está igual en `b` (b puede traer más: Apify le añade valores por omisión a la entrada) */
function subconjunto(a, b) {
  if (a === b) return true
  if (a === null || b === null || a === undefined || b === undefined) return false
  if (typeof a !== typeof b) return false
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false
    for (var i = 0; i < a.length; i++) if (!subconjunto(a[i], b[i])) return false
    return true
  }
  if (typeof a === 'object') {
    var ks = Object.keys(a)
    for (var j = 0; j < ks.length; j++) {
      if (!Object.prototype.hasOwnProperty.call(b, ks[j]) || !subconjunto(a[ks[j]], b[ks[j]])) return false
    }
    return true
  }
  return false
}

/**
 * `http(url)` devuelve el JSON (lo pone el nodo: this.helpers.httpRequest · en la prueba, un doble). La llave NO va en la dirección (ronda 69): la pone el `http` del nodo en la cabecera `Authorization`;
 * `token` solo sirve aquí para saber si hay llave.
 * desdeMs/hastaMs = cuándo empezó y terminó ESTA llamada. cuerpo = lo que se mandó al actor.
 */
async function buscarImporteReal(http, token, cuerpo, desdeMs, hastaMs) {
  if (!token) return { estado: 'sin_importe', motivo: 'sin llave de Apify en el flujo · no se pudo preguntar' }
  var lista
  try {
    lista = await http('https://api.apify.com/v2/actor-runs?limit=100&desc=1')
  } catch (e) {
    return { estado: 'sin_importe', motivo: 'no se pudo leer la lista de corridas de Apify · ' + String(e && e.message ? e.message : e).slice(0, 120) }
  }
  var items = (lista && lista.data && lista.data.items) || []
  var candidatas = items.filter(function (r) {
    if (!r.startedAt || !r.finishedAt) return false
    var ini = new Date(r.startedAt).getTime()
    var fin = new Date(r.finishedAt).getTime()
    return ini >= desdeMs - VENTANA_ANTES_MS && fin <= hastaMs + VENTANA_DESPUES_MS
  })
  if (candidatas.length === 0) return { estado: 'sin_importe', motivo: 'ninguna corrida de la cuenta empezó y terminó dentro de esta llamada (puede no haberse cobrado aún)' }
  var elegidas = candidatas
  if (cuerpo && typeof cuerpo === 'object') {
    elegidas = []
    var vistas = candidatas.slice(0, MAX_CANDIDATAS)
    for (var i = 0; i < vistas.length; i++) {
      var r = vistas[i]
      if (!r.defaultKeyValueStoreId) continue
      try {
        var entrada = await http('https://api.apify.com/v2/key-value-stores/' + r.defaultKeyValueStoreId + '/records/INPUT')
        if (subconjunto(cuerpo, entrada)) elegidas.push(r)
      } catch (e) { /* una entrada que no se pudo leer no es la nuestra: no se adivina */ }
    }
  } else if (candidatas.length > 1) {
    return { estado: 'sin_importe', motivo: 'la llamada no guardó lo que mandó y hay ' + candidatas.length + ' corridas posibles · no se adivina' }
  }
  if (elegidas.length === 0) return { estado: 'sin_importe', motivo: 'de ' + candidatas.length + ' corridas posibles ninguna tiene la entrada que se mandó · no se adivina' }
  // varias corridas con LA MISMA entrada (dos llamadas idénticas a la vez): no se sabe cuál es de cuál ⇒ sin importe aquí; la reconciliación del día las cubre enteras
  if (elegidas.length > 1) return { estado: 'sin_importe', motivo: elegidas.length + ' corridas con la misma entrada · no se sabe cuál fue la de esta llamada · lo cubre la reconciliación del día' }
  var e0 = elegidas[0]
  if (typeof e0.usageTotalUsd !== 'number') return { estado: 'sin_importe', motivo: 'Apify aún no publica el importe de la corrida ' + e0.id + ' · lo cubre la reconciliación del día' }
  return { estado: 'medido', run_id: e0.id, actor: e0.actId || null, usd: e0.usageTotalUsd, corrida_estado: e0.status || null, candidatas: candidatas.length, con_la_misma_entrada: elegidas.length }
}
// ═══ fin importe real ═══
