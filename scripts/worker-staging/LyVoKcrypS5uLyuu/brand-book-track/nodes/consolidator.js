// Brand Book · Consolidador (maker) · paso 3 + re-síntesis del lazo A (paso 4)
// Funde las 3 lentes de los jefes en UN brand_book_draft · cada campo grounded
// en evidencia real (discovery_summary + ICP + competitive del brain). NO INSERT.
//
// Inputs (vía $items / referencias de nodos):
//   - brand-strategist  → posicionamiento + ICP
//   - editor-en-jefe    → voz/tono + forbidden_words + required_terminology
//   - jefe-client-success → ángulo cliente / retención
//   - corrections (opcional · lazo A) → array de {eje,severidad,donde,problema,cambio_sugerido}
//
// Output: { brand_book_draft, cycle, _grounding_refs }

const dealData = $('Validate Deal Data').first().json;
const clientId = dealData.client_id;

// Cada lente llega como respuesta run-sdk · tomamos su `response` (texto) o
// `structured` si el agente emitió JSON. Defensive · floors seguros.
function lensOutput(nodeName) {
  try {
    const j = $(nodeName).first().json;
    const body = j.body || j;
    // preferimos un bloque estructurado si el agente lo emitió; si no, el texto.
    return {
      structured: body.structured || body.brand_book_section || null,
      text: typeof body.response === 'string' ? body.response : '',
    };
  } catch (e) {
    return { structured: null, text: '' };
  }
}

const strat = lensOutput('Lente · brand-strategist');
const editor = lensOutput('Lente · editor-en-jefe');
const cs = lensOutput('Lente · jefe-client-success');

// Correcciones acumuladas del lazo A (si venimos de una re-síntesis).
let corrections = [];
try {
  corrections = $json.corrections || $json.staging_package?.corrections || [];
} catch (e) { corrections = []; }
const cycle = (Number($json.cycle) || 0) + 1;

// pick · usa structured cuando exista, fallback a texto.
const pick = (lens, key) =>
  (lens.structured && lens.structured[key]) || lens.text || '';

const brandBookDraft = {
  client_id: clientId,
  // posicionamiento + ICP (brand-strategist)
  positioning: pick(strat, 'positioning'),
  icp_summary: pick(strat, 'icp'),
  // voz/tono + reglas (editor-en-jefe)
  voice_description: pick(editor, 'voice_description'),
  forbidden_words: (editor.structured && editor.structured.forbidden_words) || [],
  required_terminology: (editor.structured && editor.structured.required_terminology) || [],
  // ángulo cliente / retención (jefe-client-success)
  customer_angle: pick(cs, 'customer_angle'),
  retention_notes: pick(cs, 'retention_notes'),
  // metadata de build
  _build: {
    source: 'onboarding_collaborative_build',
    lenses: ['brand-strategist', 'editor-en-jefe', 'jefe-client-success'],
    cycle,
    corrections_applied: corrections.length,
  },
};

// Referencias de grounding · qué evidencia respalda el borrador (para el judge).
const grounding = {
  discovery_summary:
    ($('Confirm barato · competitor list').first().json.discovery_package || {}).discovery_summary || '',
  client_id: clientId,
};

return [{ json: { brand_book_draft: brandBookDraft, cycle, corrections, _grounding_refs: grounding } }];
