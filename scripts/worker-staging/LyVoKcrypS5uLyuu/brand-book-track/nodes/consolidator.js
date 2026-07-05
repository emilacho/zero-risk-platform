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
    // CANON · la lente emite su sección vía emit_brand_section · el run-sdk la
    // surface en body.brand_section (estructurado · NO texto narrativo).
    // Fallbacks defensivos: intenta parsear JSON del response si por algún
    // motivo el tool no fue capturado (degradación graceful).
    let structured = body.brand_section || body.structured || null;
    if (!structured && typeof body.response === 'string') {
      const m = body.response.match(/\{[\s\S]*\}/);
      if (m) { try { structured = JSON.parse(m[0]); } catch (e) {} }
    }
    return {
      structured: structured || null,
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
// FIX 2026-06-30 (Bug 1 · loop infinito) · contador de fidelidad INDEPENDIENTE del
// `cycle` del Lazo A (que el sub-wf resetea con su ciclo interno). Se incrementa
// cada vez que el consolidador corre = cada iteración del loop de fidelidad del
// worker principal. El IF · ciclos agotados hace hard-cap sobre ESTE contador.
const fidelityCycle = (Number($json._fidelity_cycle) || 0) + 1;

// pick · usa structured cuando exista, fallback a texto.
const pick = (lens, key) =>
  (lens.structured && lens.structured[key]) || lens.text || '';

const brandBookDraft = {
  client_id: clientId,
  // posicionamiento + ICP (brand-strategist)
  positioning: pick(strat, 'positioning'),
  icp_summary: pick(strat, 'icp_summary'),
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
// FIX 2026-07-05 (CC#3 · Sprint JEFATURA item 1 · precondición HARD F2.2): el judge
// de fidelidad (judge-prep.js:22-38) puntúa cada campo del brand book contra
// client_name / industry / competitors / icp_signals ADEMÁS del discovery_summary.
// Antes acá solo se pasaba discovery_summary + client_id → esos campos llegaban
// vacíos al juez = garbage-in (fidelidad medida sobre evidencia recortada). Se pasan
// los campos ricos desde el MISMO discovery_package + dealData que ya usa
// synthesis-fanout-prep.js:20-22 (mismo contrato · sin fuente de datos nueva).
const discoveryPkg =
  ($('Confirm barato · competitor list').first().json.discovery_package) || {};
const grounding = {
  client_name: dealData.client_name || '',
  industry: dealData.industry || '',
  discovery_summary: discoveryPkg.discovery_summary || '',
  competitors: (discoveryPkg.competitors || []).slice(0, 8),
  icp_signals: discoveryPkg.icp_signals || discoveryPkg.icp || null,
  client_id: clientId,
};

return [{ json: { brand_book_draft: brandBookDraft, cycle, _fidelity_cycle: fidelityCycle, corrections, _grounding_refs: grounding } }];
