// ⑥ EL CABLE DE VUELTA NO PUEDE SER MUDO · CC#1 · 2026-09-29 · igual que planeación.
// Si no volvió, la sala NUNCA se entera de que la corrida terminó y su marca queda sin resolver.
const r = $input.first().json || {}
const volvio = r.ok === true
let corr = null
try { corr = $('⓪ Sobre · llave · modo seco').first().json._sala_correlation_id || null } catch (e) { corr = null }
// Falla RUIDOSA solo si la sala lo despachó: un disparo a mano no tiene a quién contestarle.
if (corr && !volvio) {
  throw new Error('CABLE_DE_VUELTA_MUDO · la sala NO se enteró de que la corrida terminó · código ' + String(r.code || r.error || 'sin código'))
}
return [{
  json: {
    cierre: 'parte_terminado',
    vuelta_ok: volvio,
    vuelta_detalle: volvio ? r.event_id || 'sin event_id' : r.code || r.detail || r.error || 'sin respuesta de la sala',
    despachado_por_la_sala: !!corr,
  },
}]
