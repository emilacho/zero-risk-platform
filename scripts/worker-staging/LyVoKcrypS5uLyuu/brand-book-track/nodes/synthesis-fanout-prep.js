// Brand Book · Fan-out prep · paso 2 · arma el grounding compartido para las 3
// lentes (brand-strategist · editor-en-jefe · jefe-client-success). Corre DESPUÉS
// de FASE 2 (Aggregate Apify listo) · fuera del gate Camino III. NO INSERT.

const dealData = $('Validate Deal Data').first().json;
const clientId = dealData.client_id;
const discoveryPkg =
  ($('Confirm barato · competitor list').first().json.discovery_package) || {};
const apifyAgg = (() => {
  try { return $('[APIFY-WIRE] Aggregate Service responses (onboarding_e2e)').first().json; }
  catch (e) { return {}; }
})();

// Evidencia real ya en el brain · es el grounding de las 3 lentes (cero invención).
const grounding = {
  client_id: clientId,
  client_name: dealData.client_name,
  industry: dealData.industry,
  website: dealData.website,
  discovery_summary: discoveryPkg.discovery_summary || '',
  competitors: (discoveryPkg.competitors || []).slice(0, 8),
  icp_signals: discoveryPkg.icp_signals || discoveryPkg.icp || null,
  apify_sources: (apifyAgg.sources || apifyAgg.results || []).slice(0, 10),
};

// Un item por lente · cada uno con su task scoped a su skill (disciplina de fan-out:
// solo los 3 contribuyentes relevantes · NO los 38 · §150).
const base =
  'Construí TU sección del brand book SOLO desde la evidencia real del cliente abajo ' +
  '(web/redes/discovery/Apify). NO inventes. CUANDO TENGAS TU SECCIÓN LISTA, LLAMÁ EL TOOL ' +
  '`emit_brand_section` con tus campos (pasá `lens` con tu nombre de lente). NO narres la ' +
  'respuesta · usá el tool · es la ÚNICA forma en que tu sección llega al consolidador. ' +
  // FIX 2026-07-01 (límite 8000 chars run-sdk) · grounding 8000→6800 · deja margen
  // para la prosa base + la instrucción de sección · el guard final garantiza ≤7900.
  'Grounding cada afirmación en la evidencia.\n\nEVIDENCIA:\n' +
  JSON.stringify(grounding).slice(0, 6800);

// guard final · run-sdk rechaza task > 8000 chars (E-INPUT-INVALID) · garantiza ≤7900.
const cap = (t) => t.slice(0, 7900);
const lenses = [
  { lens: 'brand-strategist', agent: 'brand-strategist',
    task: cap(base + '\n\nTU SECCIÓN: positioning + icp (audience_segment, pains, goals).') },
  { lens: 'editor-en-jefe', agent: 'editor-en-jefe',
    task: cap(base + '\n\nTU SECCIÓN: voice_description + forbidden_words[] + required_terminology[].') },
  { lens: 'jefe-client-success', agent: 'jefe-client-success',
    task: cap(base + '\n\nTU SECCIÓN: customer_angle + retention_notes.') },
];

// FIX-FORWARD 2026-06-30 (Fix B · fan-out routing) · emití UN solo item con las
// 3 tasks keyed por lente · cada nodo-lente lee SU task ($json.tasks.<lente>).
// Antes emitía 3 items → n8n mandaba los 3 a cada nodo → mis-routing (solo 1
// lente emitía · exec 41641). Un item = cada lente corre 1 vez con su task.
const tasks = {
  'brand-strategist': lenses[0].task,
  'editor-en-jefe': lenses[1].task,
  'jefe-client-success': lenses[2].task,
};
return [{ json: { tasks, client_id: clientId, _grounding_refs: grounding } }];
