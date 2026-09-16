// [SALA] Vigía · el aviso llegó o la corrida falla · E68 · CC#2 · 2026-09-16
//
// 🔴 POR QUÉ EXISTE: el nodo `AVISO · #alertas` tiene `onError: continueRegularOutput`
// y `alwaysOutputData`. Con eso, un rechazo de Slack NO rompía nada:
//   · Slack rechaza con 200 + `ok:false` (token, canal…) → item normal → corrida VERDE
//   · 4xx / 5xx / tiempo agotado → `continueRegularOutput` lo vuelve item → corrida VERDE
// Nadie miraba `ok`. Un aviso que no llega es un silencio, y éste es el vigía del silencio
// (E66 · CC#3 · A-DEFECTO). Mismo patrón que el cierre del reconciliador (E63).
//
// 🔴 LA REGLA: sólo cuenta como avisado lo que Slack confirmó con `ok:true`. Todo lo demás
// —incluido «no llegó ninguna respuesta»— termina la corrida en ERROR.
const v = $('[SALA] Vigía · decide').first().json || {};
const respuestas = $input.all().map(function (i) { return i.json || {}; });

const confirmadas = respuestas.filter(function (r) { return r.ok === true; });
if (respuestas.length === 0 || confirmadas.length !== respuestas.length) {
  const r = respuestas.find(function (x) { return x.ok !== true; }) || {};
  const causa = r.error
    ? (typeof r.error === 'string' ? r.error : (r.error.message || JSON.stringify(r.error)))
    : (respuestas.length === 0 ? 'Slack no devolvio respuesta' : 'Slack no confirmo ok:true · ' + JSON.stringify(r).slice(0, 200));
  throw new Error('[vigia-silencio] el aviso NO llego a #alertas · ' + String(causa).slice(0, 300) +
    ' · estado ' + v.estado + ' · ' + v.titulo);
}

console.log('[vigia-silencio] aviso confirmado por Slack · ts ' + confirmadas[0].ts + ' · ' + v.estado);
return [{ json: Object.assign({}, v, { aviso_ts: confirmadas[0].ts, aviso_canal: confirmadas[0].channel }) }];
