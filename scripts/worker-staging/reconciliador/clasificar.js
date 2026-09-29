// EL RECONCILIADOR DE DESPACHOS HUÉRFANOS · la lógica pura · CC#1 · 2026-09-30 · GO de Emilio (evaluación 30-sep §6/§10).
// Un RELOJ aparte que mira el SÍNTOMA («despacho aceptado, sin recibo, sin vuelta») y no la causa, para que las dos causas medidas
// (saldo agotado · tope de la vuelta de Vercel a los 800 s) y cualquier causa futura se VEAN en vez de perderse.
// REGLA 8 de la evaluación: todo arreglo tiene que hacer DISTINGUIBLE «terminó y no pudo entregar» de «nunca arrancó».
// Lógica PURA (sin red, sin `this`, sin `URL`, sin `require` fuera de este archivo): se prueba a costo cero y se pega en el nodo del reloj.
//
// Entradas por despacho (`agent_dispatches`): status accepted|running|completed|error · created_at · workflow_execution_id · agent_name.
// Contexto: `invocacion` = la fila de `agent_invocations` (misma ejecución y agente, posterior al despacho; se escribe AL TERMINAR el trabajo)
//           `intentos`   = filas de `agent_callback_attempts` cuya dirección trae esa ejecución (`/webhook-waiting/<ejecución>`).

var PARAMETROS = {
  // un despacho aceptado que no llega a «running» en 3 min no arrancó (el marcador running se escribe a los segundos)
  ACEPTADO_MAX_S: 180,
  // un agente puede tardar mucho (medido: 32 min); pasada 1 h sin ninguna señal de vida, se da por muerto
  CORRIENDO_MAX_S: 3600,
  // el callback llega a los segundos de terminar el trabajo: 3 min de gracia antes de dar el resultado por «no entregado»
  GRACIA_ENTREGA_S: 180,
}

var CLASES = {
  ok: { severidad: 'ok', que: 'despacho cerrado' },
  en_curso: { severidad: 'ok', que: 'trabajando dentro de lo esperado' },
  entregado_ledger_abierto: { severidad: 'info', que: 'la vuelta SÍ se entregó pero el registro del despacho quedó abierto' },
  error_entregado: { severidad: 'info', que: 'falló y el error SÍ le llegó al que esperaba' },
  error_callback_409: { severidad: 'info', que: 'falló; el que llamó no espera por callback (lo sondea): sus intentos dan 409' },
  termino_y_no_entrego: { severidad: 'alta', que: 'TERMINÓ el trabajo y NADIE lo entregó · el resultado existe · el que esperaba no se enteró' },
  nunca_arranco: { severidad: 'alta', que: 'se ACEPTÓ el trabajo y NUNCA arrancó' },
  sin_senales_de_vida: { severidad: 'alta', que: 'lleva más de 1 h «corriendo» sin ninguna señal de vida · probablemente murió' },
  error_sin_entrega: { severidad: 'alta', que: 'FALLÓ y el error NO le llegó al que esperaba (sin intentos de vuelta o todos fallaron) · su espera puede estar colgada' },
}

function segundos(desde, hasta) {
  var a = new Date(desde).getTime()
  var b = typeof hasta === 'number' ? hasta : new Date(hasta).getTime()
  return Math.round((b - a) / 1000)
}

/** ¿La dirección de una fila de intentos es la de esta ejecución? (sin `URL`: solo texto) */
function intentoDeLaEjecucion(url, ejecucion) {
  if (!url || !ejecucion) return false
  return String(url).indexOf('/webhook-waiting/' + String(ejecucion) + '?') !== -1 || String(url).slice(-('/webhook-waiting/' + String(ejecucion)).length) === '/webhook-waiting/' + String(ejecucion)
}

/** Empareja la invocación de un despacho: misma ejecución + mismo agente + creada DESPUÉS del despacho (menos 5 s de tolerancia). */
function invocacionDe(despacho, invocaciones) {
  var t0 = new Date(despacho.created_at).getTime() - 5000
  var mejor = null
  for (var i = 0; i < (invocaciones || []).length; i++) {
    var v = invocaciones[i]
    if (String(v.workflow_execution_id) !== String(despacho.workflow_execution_id)) continue
    if (v.agent_name !== despacho.agent_name) continue
    if (new Date(v.created_at).getTime() < t0) continue
    if (!mejor || new Date(v.created_at) < new Date(mejor.created_at)) mejor = v
  }
  return mejor
}

/**
 * Clasifica UN despacho. Devuelve { clasificacion, severidad, que, evidencia }.
 * `ahora` en milisegundos. NO modifica nada.
 */
function clasificarDespacho(despacho, invocacion, intentos, ahora, params) {
  var P = params || PARAMETROS
  var edad = segundos(despacho.created_at, ahora)
  var ok = (intentos || []).filter(function (x) { return x.status === 'ok' })
  var fallidos = (intentos || []).filter(function (x) { return x.status !== 'ok' })
  var todos409 = (intentos || []).length > 0 && fallidos.length === (intentos || []).length && fallidos.every(function (x) { return Number(x.http_status_code) === 409 })
  var evidencia = {
    dispatch_key: despacho.dispatch_key || null,
    agente: despacho.agent_name,
    ejecucion: String(despacho.workflow_execution_id),
    estado_del_registro: despacho.status,
    edad_s: edad,
    intentos_de_vuelta: (intentos || []).length,
    intentos_ok: ok.length,
    ultimo_intento: (intentos || []).length ? (intentos[intentos.length - 1].status + (intentos[intentos.length - 1].http_status_code ? '/' + intentos[intentos.length - 1].http_status_code : '')) : null,
    invocacion: invocacion ? { id: invocacion.id || null, creada: invocacion.created_at, duracion_ms: invocacion.duration_ms, costo_usd: invocacion.cost_usd, estado: invocacion.status } : null,
  }
  var salir = function (clase, extra) {
    return { clasificacion: clase, severidad: CLASES[clase].severidad, que: CLASES[clase].que, evidencia: extra ? Object.assign(evidencia, extra) : evidencia }
  }

  if (despacho.status === 'completed') return salir('ok')

  if (despacho.status === 'error') {
    if (ok.length) return salir('error_entregado')
    if (todos409) return salir('error_callback_409')
    return salir('error_sin_entrega')
  }

  // accepted | running → sin cerrar
  if (ok.length) {
    // entregada la vuelta pero el registro sigue abierto: solo se declara cuando ya pasó la gracia
    return edad > P.GRACIA_ENTREGA_S ? salir('entregado_ledger_abierto') : salir('en_curso')
  }
  if (invocacion) {
    var desdeQueTermino = segundos(invocacion.created_at, ahora)
    if (desdeQueTermino >= P.GRACIA_ENTREGA_S) return salir('termino_y_no_entrego', { desde_que_termino_s: desdeQueTermino })
    return salir('en_curso')
  }
  if (despacho.status === 'accepted') {
    return edad > P.ACEPTADO_MAX_S ? salir('nunca_arranco') : salir('en_curso')
  }
  // running sin invocación (la fila aparece AL TERMINAR): solo se da por muerto pasado el tope de vida esperado
  return edad > P.CORRIENDO_MAX_S ? salir('sin_senales_de_vida') : salir('en_curso')
}

/** Clasifica todos los despachos y devuelve solo lo que hay que registrar (severidad alta o info). */
function reconciliar(despachos, invocaciones, intentos, ahora, params) {
  var out = []
  for (var i = 0; i < (despachos || []).length; i++) {
    var d = despachos[i]
    var inv = invocacionDe(d, invocaciones)
    var ints = (intentos || []).filter(function (x) { return intentoDeLaEjecucion(x.callback_url, d.workflow_execution_id) })
    ints.sort(function (a, b) { return new Date(a.attempted_at || a.created_at).getTime() - new Date(b.attempted_at || b.created_at).getTime() })
    var c = clasificarDespacho(d, inv, ints, ahora, params)
    out.push({ despacho: d, resultado: c })
  }
  return out
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    PARAMETROS: PARAMETROS,
    CLASES: CLASES,
    clasificarDespacho: clasificarDespacho,
    invocacionDe: invocacionDe,
    intentoDeLaEjecucion: intentoDeLaEjecucion,
    reconciliar: reconciliar,
  }
}
