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
  '(1 = totalmente grounded · 0 = inventado/contradice). Respondé SOLO con JSON: ' +
  '{"scores": {"<field>": <0..1>, ...}}. Sin prosa.\n\n' +
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
    }),
  });
  const body = await resp.json();
  const text = typeof body.response === 'string' ? body.response : JSON.stringify(body);
  const m = text.match(/\{[\s\S]*\}/);
  if (m) scores = (JSON.parse(m[0]).scores) || {};
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
      max_cycles: MAX_FIDELITY_CYCLES,
      exhausted: !pass && cycle >= MAX_FIDELITY_CYCLES,
    },
    brand_book_draft: draft,
    cycle,
  },
}];
