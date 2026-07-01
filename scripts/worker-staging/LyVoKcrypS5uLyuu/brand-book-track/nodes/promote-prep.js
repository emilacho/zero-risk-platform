// Brand Book · Promote prep · arma el body para el POST /brand-book.
// FIX 2026-07-01 · el nodo Promote era un Code node con fetch() · pero `fetch` NO existe
// en los Code nodes de n8n ("fetch is not defined") → no persistía. El POST se movió a un
// nodo HTTP Request (mismo patrón que el judge). Este nodo solo prepara el body.
//
// Corre SOLO en el branch PASS del IF de fidelidad (ya gateado) · igual guardamos el
// invariante 5 (nunca persistir sin PASS) por defensa.
const fidelity = ($json && $json.fidelity) || {};
const draft = ($json && $json.brand_book_draft) || {};
const clientId = draft.client_id || $('Validate Deal Data').first().json.client_id;

const promote_body = {
  brand_book: draft,
  source: 'onboarding_collaborative_build',
  // CANON por fidelidad · NO por firma humana ni voto Camino III.
  fidelity_passed: !!fidelity.pass,
  fidelity_scores: fidelity.scores,
  fidelity_threshold: fidelity.threshold,
  approved_by: 'faithfulness_check',
  // Date.now() está OK en Code nodes n8n (no es un workflow script del harness).
  approved_at: new Date().toISOString(),
};

return [{ json: {
  promote_body,
  client_id: clientId,
  should_persist: !!fidelity.pass, // el HTTP corre igual (el IF ya gatea) · defensa extra.
  fidelity,
} }];
