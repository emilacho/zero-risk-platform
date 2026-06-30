// Brand Book · Faithfulness judge · paso 5 · ESTO decide canon (no votos)
// LLM-judge DIY in-stack (consejero §2: NO RAGAS/DeepEval · Python/§151).
// Por CADA campo del brand_book_draft: ¿está soportado por la evidencia real
// del cliente? score 0..1 · umbral ≥0.85. NO depende de paquete nuevo.
//
// Output: { fidelity: { pass, threshold, scores, low_fields }, brand_book_draft, cycle }

const apiUrl = $env.ZERO_RISK_API_URL || 'https://zero-risk-platform.vercel.app';
const apiKey = $env.INTERNAL_API_KEY;
const THRESHOLD = 0.85;
const MAX_FIDELITY_CYCLES = 3;

const inJson = $json;
const draft = inJson.brand_book_draft || {};
const grounding = inJson._grounding_refs || {};
const cycle = Number(inJson.cycle) || 1;
// FIX 2026-06-30 (Bug 1) · contador de fidelidad INDEPENDIENTE (no el `cycle`
// del Lazo A · que se resetea). El hard-cap del worker decide agotamiento sobre éste.
const fidelityCycle = Number(inJson._fidelity_cycle) || 1;
const clientId = draft.client_id || $('Validate Deal Data').first().json.client_id;

// Campos textuales a puntuar (los arrays de reglas se validan aparte por presencia).
const SCORED_FIELDS = [
  'positioning', 'icp_summary', 'voice_description', 'customer_angle', 'retention_notes',
];

// Prompt del judge · pide UN JSON con score por campo · cero prosa.
const fieldsForPrompt = SCORED_FIELDS.map((f) => ({ field: f, value: String(draft[f] || '') }));
const judgeTask =
  'Sos un evaluador de FIDELIDAD (groundedness). Dada la EVIDENCIA real del cliente y ' +
  'los CAMPOS de un brand book, puntuá 0..1 qué tan soportado por la evidencia está cada campo ' +
  '(1 = totalmente grounded · 0 = inventado/contradice). LLAMÁ EL TOOL `emit_fidelity_scores` ' +
  'con tus scores (un número 0..1 por campo). NO narres · usá el tool · es la ÚNICA forma en ' +
  'que tus scores deciden el canon.\n\n' +
  'EVIDENCIA:\n' + JSON.stringify(grounding).slice(0, 6000) + '\n\n' +
  'CAMPOS:\n' + JSON.stringify(fieldsForPrompt).slice(0, 6000);

let scores = {};
try {
  const resp = await fetch(apiUrl + '/api/agents/run-sdk', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
    body: JSON.stringify({
      agent: 'editor-en-jefe', // jefe con criterio editorial · juez de fidelidad
      client_id: clientId,
      workflow_id: $execution.id, // por-run · NO colisiona con checkpoint (lección exec 40025)
      workflow_execution_id: $execution.id,
      task: judgeTask,
      context: { role: 'faithfulness_judge', threshold: THRESHOLD },
      // Bug 2 fix · marca la invocación-judge · activa el forced-emit Messages-API
      // de emit_fidelity_scores en el runner si el agente narra sin llamar el tool.
      extra: { fidelity_judge: true },
    }),
  });
  const body = await resp.json();
  // CANON · el judge emite sus scores vía emit_fidelity_scores · el run-sdk los
  // surface en body.fidelity_scores.scores. Fallback defensivo · parsear texto
  // si por algún motivo el tool no fue capturado (degradación graceful).
  if (body.fidelity_scores && body.fidelity_scores.scores) {
    scores = body.fidelity_scores.scores;
  } else {
    const text = typeof body.response === 'string' ? body.response : JSON.stringify(body);
    const m = text.match(/\{[\s\S]*\}/);
    if (m) { try { scores = (JSON.parse(m[0]).scores) || {}; } catch (e) {} }
  }
} catch (e) {
  scores = {};
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
