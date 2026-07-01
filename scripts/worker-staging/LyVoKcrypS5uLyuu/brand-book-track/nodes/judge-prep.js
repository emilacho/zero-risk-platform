// Brand Book · Judge prep · arma el task de fidelidad + metadata para el nodo HTTP.
// FIX 2026-07-01 (judge no llegaba al runner) · el fetch del Code node NO llegaba
// al runner en el contexto n8n (no creaba fila ni checkpoint → scores 0). Ahora la
// llamada run-sdk se hace en un nodo HTTP Request (timeout 800s + neverError · mismo
// patrón que lentes/revisores que SÍ funcionan). Este nodo solo prepara el task.
const THRESHOLD = 0.85;
const inJson = $json;
const draft = inJson.brand_book_draft || {};
const grounding = inJson._grounding_refs || {};
const cycle = Number(inJson.cycle) || 1;
const fidelityCycle = Number(inJson._fidelity_cycle) || 1;
const clientId = draft.client_id || $('Validate Deal Data').first().json.client_id;

const SCORED_FIELDS = [
  'positioning', 'icp_summary', 'voice_description', 'customer_angle', 'retention_notes',
];
const fieldsForPrompt = SCORED_FIELDS.map((f) => ({ field: f, value: String(draft[f] || '') }));
// run-sdk RECHAZA task > 8000 chars · slices reducidos + guard final ≤7900.
const judgeTask = (
  'Sos un evaluador de FIDELIDAD (groundedness). Dada la EVIDENCIA real del cliente y ' +
  'los CAMPOS de un brand book, puntuá 0..1 qué tan soportado por la evidencia está cada campo ' +
  '(1 = totalmente grounded · 0 = inventado/contradice). LLAMÁ EL TOOL `emit_fidelity_scores` ' +
  'con tus scores (un número 0..1 por campo). NO narres · usá el tool · es la ÚNICA forma en ' +
  'que tus scores deciden el canon.\n\n' +
  'EVIDENCIA:\n' + JSON.stringify(grounding).slice(0, 3000) + '\n\n' +
  'CAMPOS:\n' + JSON.stringify(fieldsForPrompt).slice(0, 3500)
).slice(0, 7900);

return [{ json: {
  judge_task: judgeTask,
  judge_step_name: 'bb-faithfulness-judge-c' + fidelityCycle,
  client_id: clientId,
  brand_book_draft: draft,
  _grounding_refs: grounding,
  cycle,
  _fidelity_cycle: fidelityCycle,
  threshold: THRESHOLD,
} }];
