// Brand Book · Faithfulness judge · SCORING · paso 5 · ESTO decide canon (no votos).
// FIX 2026-07-01 · la llamada run-sdk se movió a un nodo HTTP previo ([BB] Judge · run-sdk)
// porque el fetch del Code node NO llegaba al runner en n8n (scores 0). Este nodo SOLO
// lee la respuesta del HTTP node (body.fidelity_scores) y computa la fidelidad.
//
// Input · $json = respuesta de [BB] Judge · run-sdk (body con fidelity_scores).
// Datos del draft/ciclo · via referencia a [BB] Judge prep.
// Output: { fidelity: { pass, threshold, scores, low_fields }, brand_book_draft, cycle }

const THRESHOLD = 0.85;
const MAX_FIDELITY_CYCLES = 3;
const SCORED_FIELDS = [
  'positioning', 'icp_summary', 'voice_description', 'customer_angle', 'retention_notes',
];

const prep = $('[BB] Judge prep').first().json;
const draft = prep.brand_book_draft || {};
const cycle = Number(prep.cycle) || 1;
const fidelityCycle = Number(prep._fidelity_cycle) || 1;

// La respuesta del nodo HTTP · el run-sdk surface los scores en body.fidelity_scores.scores.
const body = ($json && ($json.body || $json)) || {};
let scores = {};
if (body.fidelity_scores && body.fidelity_scores.scores) {
  scores = body.fidelity_scores.scores;
} else {
  // Fallback defensivo · parsear texto si el tool no fue capturado.
  const text = typeof body.response === 'string' ? body.response : JSON.stringify(body);
  const m = text.match(/\{[\s\S]*\}/);
  if (m) { try { scores = (JSON.parse(m[0]).scores) || {}; } catch (e) {} }
}

// Floor seguro · campo sin score = 0 (no-grounded · fuerza re-síntesis o HITL).
const norm = {};
for (const f of SCORED_FIELDS) {
  const v = Number(scores[f]);
  norm[f] = Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0;
}
const lowFields = SCORED_FIELDS.filter((f) => norm[f] < THRESHOLD);
const pass = lowFields.length === 0;

return [{
  json: {
    fidelity: {
      pass,
      threshold: THRESHOLD,
      scores: norm,
      low_fields: lowFields,
      cycle,
      fidelity_cycle: fidelityCycle,
      max_cycles: MAX_FIDELITY_CYCLES,
      // exhausted sobre el contador independiente · hard-cap real ≤3 aunque el judge falle.
      exhausted: !pass && fidelityCycle >= MAX_FIDELITY_CYCLES,
    },
    brand_book_draft: draft,
    cycle,
    _fidelity_cycle: fidelityCycle,
  },
}];
