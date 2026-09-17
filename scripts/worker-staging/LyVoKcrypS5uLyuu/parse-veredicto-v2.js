// E87 · CC#1 · 2026-09-17 · «Parse veredicto» y «Parse re-gate veredicto» del alta · MISMO código en los dos
// (cambia sólo el nodo del que se lee `competitor_list` · lo fija el armador).
//
// 🔴 ANTES: cualquier respuesta sin JSON legible caía en `observar · default_observar_no_parseable`.
// En la bolita (E83) la respuesta del veredicto se perdió por el camino (`{"error":"terminated"}` · E86),
// el flujo la leyó como «observar» y pagó un re-descubrimiento que sobraba (US$ 0,59) · el veredicto real,
// «confirmar», estaba entero en agent_invocations 18 s después.
//
// AHORA: una respuesta perdida es «no sé», NUNCA un valor. Sólo cuenta como veredicto lo que viene con
// `success:true` Y trae un JSON con `veredicto`/`verdict` legible. Todo lo demás ⇒ `no_se` + motivo, y
// el nodo siguiente («¿Veredicto legible?») PARA ruidoso (el avisador lo lleva a #alertas).
const r = $input.first().json;
const body = (r && r.body) ? r.body : r;

let veredicto = 'no_se';
let razones = [];
let confianza = 0;
let perdida = null;   // por qué es «no sé» · null si el veredicto es legible

if (!body || typeof body !== 'object' || Array.isArray(body)) {
  perdida = 'respuesta_no_es_objeto';
} else if (body.success !== true) {
  perdida = 'respuesta_sin_success_true' + (body.error ? ' · ' + String(body.error).slice(0, 120) : '');
} else {
  const txt = typeof body.response === 'string' ? body.response : (typeof body.output_summary === 'string' ? body.output_summary : '');
  const m = (txt || '').match(/\{[\s\S]*\}/);
  if (!m) {
    perdida = 'respuesta_sin_json';
  } else {
    try {
      const j = JSON.parse(m[0]);
      const v = String(j.veredicto || j.verdict || '').toLowerCase();
      if (v === 'confirmar' || v === 'confirm') veredicto = 'confirmar';
      else if (v === 'observar' || v === 'observe') veredicto = 'observar';
      else perdida = 'veredicto_desconocido: ' + JSON.stringify(v).slice(0, 40);
      razones = Array.isArray(j.razones) ? j.razones : (Array.isArray(j.reasons) ? j.reasons : []);
      confianza = typeof j.confianza === 'number' ? j.confianza : (typeof j.confidence === 'number' ? j.confidence : 0);
    } catch (e) {
      perdida = 'json_invalido: ' + (e.message || String(e)).slice(0, 80);
    }
  }
}
if (perdida) { veredicto = 'no_se'; razones = ['respuesta_perdida: ' + perdida]; confianza = 0; }

const txtRaw = (body && typeof body === 'object') ? (body.response || body.output_summary || (body.error ? 'error: ' + body.error : '')) : (typeof body === 'string' ? body : '');
return [{ json: { veredicto, razones, confianza, _perdida: perdida,
  client_id: $('Validate Deal Data').item.json.client_id,
  client_name: $('Validate Deal Data').item.json.client_name,
  competitor_list: $('__LISTA__').item.json,
  _verdict_raw: String(txtRaw || '').slice(0, 800) } }];
