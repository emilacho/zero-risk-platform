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
  '(web/redes/discovery/Apify). NO inventes. Emití JSON estructurado en `structured`. ' +
  'Grounding cada afirmación en la evidencia.\n\nEVIDENCIA:\n' +
  JSON.stringify(grounding).slice(0, 8000);

const lenses = [
  { lens: 'brand-strategist', agent: 'brand-strategist',
    task: base + '\n\nTU SECCIÓN: positioning + icp (audience_segment, pains, goals).' },
  { lens: 'editor-en-jefe', agent: 'editor-en-jefe',
    task: base + '\n\nTU SECCIÓN: voice_description + forbidden_words[] + required_terminology[].' },
  { lens: 'jefe-client-success', agent: 'jefe-client-success',
    task: base + '\n\nTU SECCIÓN: customer_angle + retention_notes.' },
];

return lenses.map((l) => ({ json: { ...l, client_id: clientId, _grounding_refs: grounding } }));
