// Lazo A · Re-síntesis · el CONSOLIDADOR (maker) re-sintetiza el borrador
// atendiendo las correcciones de los jefes (spec: "el consolidador re-sintetiza").
// Un solo pase run-sdk (costo acotado §150). cycle++ → vuelve a review-prep.
// Para el brand book es NO vinculante: mejora iterativa hasta converger o cap 3.

const apiUrl = $env.ZERO_RISK_API_URL || 'https://zero-risk-platform.vercel.app';
const apiKey = $env.INTERNAL_API_KEY;

const inp = $json;
const draft = inp.brand_book_draft || {};
const grounding = inp._grounding_refs || {};
const corrections = inp.corrections || [];
const clientId = inp.client_id || draft.client_id;
const nextCycle = (Number(inp.cycle) || 0) + 1;

// FIX 2026-07-01 (límite 8000 chars run-sdk) · slices reducidos + guard final ≤7900.
const task = (
  'Sos el consolidador del brand book (el MAKER · no un revisor). Mejorá el BORRADOR ' +
  'aplicando SOLO las CORRECCIONES de los jefes, grounded en la EVIDENCIA. NO inventes ' +
  'campos nuevos · mantené la estructura. LLAMÁ EL TOOL `emit_brand_section` (pasá ' +
  'lens:"brand-strategist") con TODOS los campos mejorados (positioning, icp_summary, ' +
  'voice_description, forbidden_words[], required_terminology[], customer_angle, ' +
  'retention_notes). NO narres · usá el tool.\n\n' +
  'EVIDENCIA:\n' + JSON.stringify(grounding).slice(0, 2500) + '\n\n' +
  'BORRADOR:\n' + JSON.stringify(draft).slice(0, 2500) + '\n\n' +
  'CORRECCIONES:\n' + JSON.stringify(corrections).slice(0, 2500)
).slice(0, 7900);

let improved = draft;
try {
  const resp = await fetch(apiUrl + '/api/agents/run-sdk', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
    body: JSON.stringify({
      agent: 'brand-strategist', // owner del cimiento · re-sintetiza como maker
      client_id: clientId,
      workflow_id: $execution.id,
      workflow_execution_id: $execution.id,
      task,
      context: { role: 'brand_book_consolidator_resynth', cycle: nextCycle },
    }),
  });
  const body = await resp.json();
  // CANON · la sección mejorada llega vía emit_brand_section (body.brand_section).
  let cand = body.brand_section || null;
  if (!cand && typeof body.response === 'string') {
    const m = body.response.match(/\{[\s\S]*\}/);
    if (m) { try { const p = JSON.parse(m[0]); cand = p.brand_book_draft || p; } catch (e) {} }
  }
  if (cand && typeof cand === 'object') improved = { ...draft, ...cand, client_id: clientId };
} catch (e) {
  // floor seguro · si el re-synth falla, conserva el borrador previo · el lazo
  // sigue (la fidelidad decide canon · Lazo A es no-vinculante).
  improved = draft;
}

return [{ json: {
  brand_book_draft: improved,
  _grounding_refs: grounding,
  client_id: clientId,
  cycle: nextCycle,
} }];
