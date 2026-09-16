// [RECONCILIADOR] cierre · E63 · CC#2 · 2026-09-16
//
// 🔴 Una corrida que no pudo leer NO termina en verde. Nunca. Se lanza aquí, DESPUÉS
// del aviso, para que el aviso salga primero y la corrida quede `error` en la lista.
// 🔴 Y un aviso que Slack rechazó tampoco es un aviso: `chat.postMessage` contesta 200
// con `ok:false` (misma enfermedad en el canal). Si no llegó, la corrida queda `error`.
const v = $('Find stuck (>20min)').first().json;

let slack = null;
try {
  slack = $('AVISO · #alertas').first().json;
} catch (e) {
  slack = null; // no gritó en esta corrida · el nodo no corrió
}

if (v.grita === true && (!slack || slack.ok !== true)) {
  throw new Error('[reconciliador] el aviso NO llego a #alertas · ' + ((slack && slack.error) || 'sin respuesta de Slack') + ' · estado ' + v.estado);
}

if (v.lectura_ok !== true) {
  throw new Error('[reconciliador] NO SE PUDO LEER · ' + v.detalle + ' · esto NO es «cero colgados» · aviso ' + (v.grita ? 'enviado' : 'no enviado en esta vuelta (' + v.por_que_grita + ')'));
}

console.log('[reconciliador] ' + v.estado + ' · ' + v.por_que_grita);
return [{ json: v }];
