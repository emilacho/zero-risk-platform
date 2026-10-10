// ⓪ GUARDA DEL VIAJE · el `_journey_id` y el `client_id` del sobre tienen que existir JUNTOS en la sala (condición 1 de CC#3): si no, no se hace nada
const r = $input.first().json || {}
const b = r.body && typeof r.body === 'object' ? r.body : {}
if (Number(r.statusCode) !== 200) throw new Error('PUERTA_VIAJE_NO_COMPROBABLE · ' + String(b.code || b.error || r.statusCode) + ' · ' + String(b.detalle || b.detail || 'sin detalle') + ' · se DETIENE y no escribe nada')
if (b.existe !== true) throw new Error('PUERTA_VIAJE_NO_EXISTE · el viaje del sobre no existe para este cliente en la sala · se DETIENE y no escribe nada')
return [{ json: $('⓪ Llave y origen').last().json }]
