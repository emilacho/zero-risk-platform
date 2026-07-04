// F1.2 (CC#4 2026-07-04) · Shadow scorer prep · arma el task del SEGUNDO scorer de
// groundedness (sombra · gpt-5.5-advisor · sin rol en Lazo A) + adjunta los scores del
// judge para medir el acuerdo. El sombra puntúa el MISMO draft de forma INDEPENDIENTE ·
// NO ve los scores del judge (van en extra solo para el delta) · NO decide nada.
//
// Corre en paralelo al judge · dead-end (no alimenta el IF de fidelidad).
const jp = $('[BB] Judge prep').first().json;
const judgeTask = jp.judge_task;
const clientId = jp.client_id;
const cycle = Number(jp._fidelity_cycle) || 1;

let judgeScores = {};
try {
  judgeScores = $('[BB] Faithfulness judge').first().json.fidelity.scores || {};
} catch (e) {
  judgeScores = {};
}

return [{ json: {
  shadow_task: judgeTask,
  judge_scores: judgeScores,
  client_id: clientId,
  shadow_step_name: 'bb-fidelity-shadow-c' + cycle,
} }];
