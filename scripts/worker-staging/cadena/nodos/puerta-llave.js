// ⓪ LA LLAVE Y EL ORIGEN · cadena · puerta · CC#1 · 2026-10-09 · diseño v2 §3.4 + condición 1 de CC#3
// 🔴 ORDEN QUE IMPORTA (condición 1): PRIMERO la llave de despacho, DESPUÉS el cuerpo. La sala no firma el cuerpo y el webhook es una dirección pública:
// quien llegue sin la llave no consigue que se lea ni un campo (ni `target_step_id`). Falla CERRADO: sin la llave en el entorno el flujo queda cerrado.
const w = $input.first().json || {}
const headers = w.headers && typeof w.headers === 'object' ? w.headers : {}
const esperada = String($env.SALA_DISPATCH_KEY || '').trim()
if (!esperada) throw new Error('PUERTA_CERRADA · el motor no tiene la llave de despacho (SALA_DISPATCH_KEY) en su entorno · este flujo paga y queda cerrado hasta que exista · E67')
const recibida = String(headers['x-sala-dispatch-key'] || '')
let ok = recibida.length === esperada.length
for (let i = 0; i < esperada.length; i++) ok = recibida.charCodeAt(i) === esperada.charCodeAt(i) && ok
if (!ok) throw new Error('PUERTA_PROCEDENCIA_INVALIDA · llave de despacho ausente o incorrecta · este flujo paga y solo lo despierta la sala · E67')

// recién ahora se lee el cuerpo
const body = w.body && typeof w.body === 'object' ? w.body : {}
if (typeof body.client_id !== 'string' || !/^[0-9a-fA-F-]{36}$/.test(body.client_id)) throw new Error('PUERTA_CLIENTE_INVALIDO · client_id debe ser un uuid · se DETIENE y no escribe nada')
if (typeof body._journey_id !== 'string' || body._journey_id.trim() === '') throw new Error('PUERTA_SIN_VIAJE · falta _journey_id (lo pone la sala) · se DETIENE y no escribe nada')
if (typeof body.dry_run !== 'boolean') throw new Error('PUERTA_DRY_RUN_AUSENTE · el sobre debe traer dry_run explícito (true o false) · no se asume · se DETIENE antes de gastar')

// el modo lo decide la SALA (`target_step_id` lo escribe el despachador DESPUÉS del payload: no se falsifica desde el cuerpo) · cualquier `modo` del cuerpo se ignora salvo para el vigía y de una lista cerrada
const paso = String(body.target_step_id || '')
let modo = null
if (paso === 'router.dispatch.planeacion/plan-listo.briefear') modo = 'abrir'
else if (paso === 'router.dispatch.cadena/vigia.briefear') {
  if (body.modo !== 'parte' && body.modo !== 'tanda_siguiente') throw new Error('PUERTA_MODO_INVALIDO · el vigía manda parte | tanda_siguiente · llegó ' + JSON.stringify(body.modo))
  modo = body.modo
} else throw new Error('PUERTA_ORIGEN_DESCONOCIDO · target_step_id ' + JSON.stringify(paso) + ' no es de la cadena · no se escribe nada')

return [{
  json: {
    modo,
    client_id: body.client_id,
    tenant_id: body.tenant_id || body.client_id,
    _journey_id: body._journey_id,
    _sala_correlation_id: body._sala_correlation_id || null,
    plan_id: typeof body.plan_id === 'string' ? body.plan_id : null,
    campana_id: typeof body.campana_id === 'string' ? body.campana_id : null,
    lote: typeof body.lote === 'string' ? body.lote : null,
    tanda: Number.isInteger(body.tanda) ? body.tanda : null,
    fila_ids: Array.isArray(body.fila_ids) ? body.fila_ids.filter((x) => typeof x === 'string') : [],
    dry_run: body.dry_run,
    // los simulacros (respuestas enlatadas de los agentes) SOLO existen en seco
    simulacros: body.dry_run === true && body._simulacros && typeof body._simulacros === 'object' ? body._simulacros : null,
    // para la pasarela: el cuerpo ENTERO, sin tocar un campo
    cuerpo_original: JSON.stringify(body),
  },
}]
