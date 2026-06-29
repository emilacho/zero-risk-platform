// Lazo A · Review prep · arma la tarea de revisión para los 3 jefes sobre el
// borrador consolidado. Patrón SPEC-camino-iii-lazo-correccion: los jefes
// DIAGNOSTICAN (emiten correcciones accionables), el consolidador CORRIGE.
// Para el brand book es NO vinculante (la fidelidad decide canon · spec Lazo A).
//
// Input (del trigger del sub-wf): { brand_book_draft, _grounding_refs, client_id, cycle }
// Output: 1 item por jefe · { reviewer, agent, task, brand_book_draft, _grounding_refs, cycle }

const inp = $json;
const draft = inp.brand_book_draft || {};
const grounding = inp._grounding_refs || {};
const clientId = inp.client_id || draft.client_id;
const cycle = Number(inp.cycle) || 0;

const FORMAT =
  'Emití SOLO JSON: {"corrections":[{eje,severidad,donde,problema,por_que,cambio_sugerido}]}.\n' +
  '- eje: "factual"|"voz"|"posicionamiento"|"cliente"\n' +
  '- severidad: "rojo"|"ámbar" (rojo = choca con la evidencia / regla dura)\n' +
  '- Regla: NO emitas "rojo" sin un objeto-corrección accionable. Sin prosa.\n' +
  '- Si el borrador ya está bien en TU eje, devolvé {"corrections":[]}.';

const base =
  'Sos revisor de un borrador de BRAND BOOK. Diagnosticá (NO reescribas) contra la ' +
  'EVIDENCIA real del cliente. Tu rol corrige solo TU eje.\n\n' +
  'EVIDENCIA:\n' + JSON.stringify(grounding).slice(0, 6000) + '\n\n' +
  'BORRADOR:\n' + JSON.stringify(draft).slice(0, 6000) + '\n\n' + FORMAT;

const reviewers = [
  { reviewer: 'brand-strategist', agent: 'brand-strategist',
    task: base + '\n\nTU EJE: posicionamiento + ICP · ¿el posicionamiento contradice la evidencia? ¿ICP refleja la data?' },
  { reviewer: 'editor-en-jefe', agent: 'editor-en-jefe',
    task: base + '\n\nTU EJE: voz · ¿los principios de voz son concretos/testeables? ¿forbidden_words/required_terminology coherentes?' },
  { reviewer: 'jefe-client-success', agent: 'jefe-client-success',
    task: base + '\n\nTU EJE: cliente · ¿el ICP/ángulo refleja la retención? ¿algo no aterriza en valor cliente?' },
];

return reviewers.map((r) => ({
  json: { ...r, brand_book_draft: draft, _grounding_refs: grounding, client_id: clientId, cycle },
}));
