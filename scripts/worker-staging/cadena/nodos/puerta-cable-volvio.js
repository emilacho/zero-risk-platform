// CABLE · ¿VOLVIÓ? · el cable de vuelta no puede ser mudo: si no volvió, la sala nunca se entera de que el viaje terminó
const r = $input.first().json || {}
const b = r.body && typeof r.body === 'object' ? r.body : {}
const volvio = Number(r.statusCode) >= 200 && Number(r.statusCode) < 300 && (b.ok === true || b.kind === 'accepted' || b.kind === 'duplicate' || b.event_id !== undefined)
let corr = null
try { corr = $('⓪ Llave y origen').last().json._sala_correlation_id || null } catch (e) { corr = null }
if (corr && !volvio) throw new Error('CABLE_DE_VUELTA_MUDO · la sala NO se enteró de que el viaje terminó · código ' + String(b.code || b.error || r.statusCode || 'sin código'))
const prev = $('Cable · armar').last().json
return [{ json: { cierre: 'cadena_terminada', resultado: prev.resultado, vuelta_ok: volvio, despachado_por_la_sala: !!corr } }]
