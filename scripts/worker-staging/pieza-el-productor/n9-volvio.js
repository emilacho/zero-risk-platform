// ⑨ EL CABLE DE VUELTA NO PUEDE SER MUDO · CC#1 · 2026-10-01 · igual que el brief y planeación.
// Si no volvió, la sala NUNCA se entera de que la corrida terminó y su marca queda sin resolver.
const r = $input.first().json || {}
const volvio = r.ok === true
let corr = null
try { corr = $('⓪ Sobre · llave · modo seco').first().json._sala_correlation_id || null } catch (e) { corr = null }
// Falla RUIDOSA solo si la sala lo despachó: un disparo a mano no tiene a quién contestarle.
if (corr && !volvio) {
  throw new Error('CABLE_DE_VUELTA_MUDO · la sala NO se enteró de que la corrida terminó · código ' + String(r.code || r.error || 'sin código'))
}
// 🔴 LA CORRIDA NO CIERRA «CORRECTA» SI LA PIEZA NO VALE: el cable YA declaró el resultado real arriba; acá la corrida termina en ERROR visible con el motivo, no en verde.
let cierrePrevio = null
try { cierrePrevio = $('⑧ ¿Guardó la pieza?').first().json } catch (e) { cierrePrevio = null }
if (cierrePrevio && cierrePrevio.ok === false) {
  throw new Error((cierrePrevio.pieza_valida === false ? 'PIEZA_NO_VALIDA' : 'PIEZA_CON_PROBLEMAS') + ' · ' + (cierrePrevio.problemas || []).join(' | ') + ' · la sala ya fue avisada del resultado real')
}
return [{
  json: {
    cierre: 'pieza_terminada',
    vuelta_ok: volvio,
    vuelta_detalle: volvio ? r.event_id || 'sin event_id' : r.code || r.detail || r.error || 'sin respuesta de la sala',
    despachado_por_la_sala: !!corr,
  },
}]
