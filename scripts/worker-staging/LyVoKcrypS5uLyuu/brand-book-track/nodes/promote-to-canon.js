// Brand Book · Promote staging → canon · paso 6+7 · disparado por FIDELIDAD PASS
// (NO por Camino III PASS · ese gobierna CONTENIDO, no el cimiento). El borrador
// vivió en memoria (consejero §3 · sin tabla nueva) · recién aquí escribe canon.
// Reusa el endpoint canónico POST /api/clients/{id}/brand-book.

const apiUrl = $env.ZERO_RISK_API_URL || 'https://zero-risk-platform.vercel.app';
const apiKey = $env.INTERNAL_API_KEY;
const headers = { 'Content-Type': 'application/json', 'x-api-key': apiKey };

const inJson = $json;
const fidelity = inJson.fidelity || {};
const draft = inJson.brand_book_draft || {};
const clientId = draft.client_id || $('Validate Deal Data').first().json.client_id;

// Guardia · NUNCA persistir sin PASS de fidelidad (invariante 5 de la spec).
if (!fidelity.pass) {
  return [{ json: {
    persisted: false,
    reason: fidelity.exhausted ? 'fidelity_exhausted_hitl_last_resort' : 'fidelity_not_passed',
    fidelity,
    client_id: clientId,
  } }];
}

let result = null;
try {
  const resp = await fetch(apiUrl + '/api/clients/' + clientId + '/brand-book', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      brand_book: draft,
      source: 'onboarding_collaborative_build',
      // CANON por fidelidad · NO por firma humana ni voto Camino III.
      fidelity_passed: true,
      fidelity_scores: fidelity.scores,
      fidelity_threshold: fidelity.threshold,
      approved_by: 'faithfulness_check',
      approved_at: new Date().toISOString(),
    }),
  });
  let body = null;
  try { body = await resp.json(); } catch (e) { body = null; }
  result = { status: resp.status, ok: resp.ok, body };
} catch (e) {
  result = { status: 'error', message: e.message };
}

return [{ json: {
  persisted: !!(result && result.ok),
  brand_book_write: result,
  fidelity,
  client_id: clientId,
} }];
