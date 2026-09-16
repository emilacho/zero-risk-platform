// [RECONCILIADOR] decide · E63 · CC#2 · 2026-09-16
//
// 🔴 POR QUÉ SE REESCRIBIÓ: la versión anterior leía `($input.first().json.data) || []`.
// Cuando el motor contestaba `'X-N8N-API-KEY' header required`, eso se convertía en
// «0 colgados» y la corrida terminaba en `success`. 30 de 30 corridas en verde el
// 16-sep, sin haber visto nada nunca (E60 · CC#3 · corrida 139378).
// Canon: una consulta que falla y se lee como tranquilidad es el defecto que perseguimos.
//
// 🔴 LA REGLA: «no pude leer» NO es «cero colgados». Es `NO_SE_PUDO_LEER`, y:
//   · la corrida TERMINA EN ERROR (lo hace el nodo de cierre) · siempre, cada 15 min
//   · el aviso a #alertas sale UNA VEZ AL DÍA · la vuelta de las 13:00 UTC (08:00 Ecuador)
//     o a pedido con `forzar_aviso: true` por la puerta
//
// 🔴 LO QUE NO TIENE, A PROPÓSITO: interruptor de silencio, fila de settings, memoria.
// No hay nada que editar para callarla. La única forma de que deje de avisar es que
// la lectura vuelva a funcionar.
const UMBRAL_MIN = 20;
const HORA_AVISO_CIEGO_UTC = 13;

const ahora = new Date();

// ── ① lo que contestó el motor · con o sin respuesta completa, con o sin error de red ──
const crudo = $input.first().json || {};
const status = typeof crudo.statusCode === 'number' ? crudo.statusCode : null;
const cuerpo = crudo.body !== undefined && crudo.statusCode !== undefined ? crudo.body : crudo;

let motivo = null;
if (crudo.error !== undefined && crudo.statusCode === undefined) {
  // el nodo falló entero (red, tiempo agotado) y siguió por `onError: continueRegularOutput`
  motivo = 'la consulta al motor fallo · ' + String((crudo.error && crudo.error.message) || crudo.error).slice(0, 200);
} else if (status !== null && (status < 200 || status >= 300)) {
  motivo = 'el motor contesto ' + status + ' · ' + String((cuerpo && cuerpo.message) || '').slice(0, 200);
} else if (!cuerpo || typeof cuerpo !== 'object' || !Array.isArray(cuerpo.data)) {
  // sin `data` como lista no hay lectura, aunque el código sea 200
  motivo = 'el motor no devolvio una lista de ejecuciones · ' +
    String((cuerpo && (cuerpo.message || cuerpo.error)) || JSON.stringify(cuerpo)).slice(0, 200);
} else if (cuerpo.nextCursor) {
  // más de 100 en espera: leí sólo la primera página, no puedo afirmar «ninguna más»
  motivo = 'lectura parcial · hay mas de ' + cuerpo.data.length + ' ejecuciones en espera y solo se leyo la primera pagina';
}

// ── ② ¿pidieron el aviso a mano? · se lee de la PUERTA, no de $input (lección E60 del vigía) ──
// try/catch obligatorio: en la vuelta del reloj la puerta no corrió y nombrarla lanza.
let forzado = false;
try {
  const p = $('Puerta · preguntar a pedido').first().json || {};
  const b = p.body || {};
  forzado = String(b.forzar_aviso) === 'true';
} catch (e) {
  forzado = false;
}

// ── ③ el veredicto ──
if (motivo !== null) {
  const esLaVueltaDelDia = ahora.getUTCHours() === HORA_AVISO_CIEGO_UTC && ahora.getUTCMinutes() < 15;
  const faltaLlave = /X-N8N-API-KEY/i.test(motivo);
  return [{ json: {
    estado: 'NO_SE_PUDO_LEER',
    lectura_ok: false,
    grita: esLaVueltaDelDia || forzado,
    por_que_grita: forzado ? 'pedido a mano (forzar_aviso)' : (esLaVueltaDelDia ? 'vuelta diaria de las 13 UTC' : 'no grita · solo avisa en la vuelta de las 13 UTC'),
    stuck_count: null,
    stuck: [],
    titulo: 'EL RECONCILIADOR DE COLGADOS NO PUDO LEER · NO SE SI HAY PROCESOS COLGADOS',
    detalle: 'Motivo medido en esta corrida: ' + motivo,
    que_hacer: faltaLlave
      ? 'poner `N8N_API_KEY` en el entorno del motor · hasta entonces este vigia NO ve nada y cada corrida queda en error'
      : 'revisar la consulta al motor · hasta que lea, cada corrida queda en error y NO significa «cero colgados»',
    medido_en: ahora.toISOString(),
  } }];
}

const stuck = cuerpo.data
  .filter(function (e) { return e && e.startedAt && (ahora - new Date(e.startedAt)) > UMBRAL_MIN * 60 * 1000; })
  .map(function (e) {
    return { id: e.id, workflowId: e.workflowId, startedAt: e.startedAt, mins: Math.round((ahora - new Date(e.startedAt)) / 60000) };
  });

if (stuck.length > 0) {
  return [{ json: {
    estado: 'HAY_COLGADOS',
    lectura_ok: true,
    grita: true,
    por_que_grita: 'hay ejecuciones en espera hace mas de ' + UMBRAL_MIN + ' min',
    stuck_count: stuck.length,
    stuck: stuck,
    titulo: 'PROCESOS COLGADOS · ' + stuck.length + ' ejecucion(es) en espera hace mas de ' + UMBRAL_MIN + ' min',
    detalle: stuck.slice(0, 10).map(function (s) { return '• exec ' + s.id + ' · wf ' + s.workflowId + ' · ' + s.mins + ' min'; }).join('\n'),
    que_hacer: 'revisar esas ejecuciones · con el resume por sondeo del alta (LyVoKcrypS5uLyuu) no deberia colgarse nada · esto detecta regresiones',
    medido_en: ahora.toISOString(),
  } }];
}

return [{ json: {
  estado: 'SIN_COLGADOS',
  lectura_ok: true,
  grita: false,
  por_que_grita: 'no grita · leyo ' + cuerpo.data.length + ' ejecucion(es) en espera y ninguna pasa de ' + UMBRAL_MIN + ' min',
  stuck_count: 0,
  stuck: [],
  titulo: 'sin colgados',
  detalle: 'leidas ' + cuerpo.data.length + ' en espera',
  que_hacer: 'nada',
  medido_en: ahora.toISOString(),
} }];
