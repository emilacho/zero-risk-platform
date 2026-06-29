// Lazo A · Merge corrections · consolida las correcciones de los 3 jefes y
// decide si hay que seguir corrigiendo. NO vinculante (no es voto pass/reject ·
// spec Lazo A): es mejora iterativa hasta converger o agotar 3 ciclos (§150).
//
// Input: items de los 3 review-agents (cada uno con `response` = JSON corrections)
// Output: { brand_book_draft, _grounding_refs, client_id, cycle, corrections, keep_going }

const MAX_CYCLES = 3;
const items = $input.all();

// recupera draft/grounding/cycle del primer item (todos lo comparten).
const first = (items[0] && items[0].json) || {};
const draft = first.brand_book_draft || {};
const grounding = first._grounding_refs || {};
const clientId = first.client_id || draft.client_id;
const cycle = Number(first.cycle) || 0;

const VALID_EJE = new Set(['factual', 'voz', 'posicionamiento', 'cliente']);
const VALID_SEV = new Set(['rojo', 'ámbar', 'ambar']);

function extract(item) {
  try {
    const j = item.json || {};
    const body = j.body || j;
    const text = typeof body.response === 'string' ? body.response : JSON.stringify(body);
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return [];
    const arr = (JSON.parse(m[0]).corrections) || [];
    return Array.isArray(arr) ? arr : [];
  } catch (e) { return []; }
}

// consolida + sanea · descarta correcciones malformadas (no rompe el lazo ·
// hardening como en camino-iii voto-red-nunca-se-dropea, PR #233).
const corrections = [];
for (const it of items) {
  for (const c of extract(it)) {
    if (!c || typeof c !== 'object') continue;
    const eje = String(c.eje || '').toLowerCase();
    const sev = String(c.severidad || '').toLowerCase();
    if (!VALID_EJE.has(eje)) continue;
    corrections.push({
      eje,
      severidad: VALID_SEV.has(sev) ? sev.replace('ambar', 'ámbar') : 'ámbar',
      donde: String(c.donde || ''),
      problema: String(c.problema || ''),
      por_que: String(c.por_que || ''),
      cambio_sugerido: String(c.cambio_sugerido || ''),
    });
  }
}

// seguir si hay correcciones accionables Y no agotamos ciclos.
const hasActionable = corrections.some((c) => c.cambio_sugerido.trim().length > 0);
const keepGoing = hasActionable && cycle < MAX_CYCLES;

return [{ json: {
  brand_book_draft: draft,
  _grounding_refs: grounding,
  client_id: clientId,
  cycle,
  corrections,
  keep_going: keepGoing,
  _lazo_a: { cycle, max_cycles: MAX_CYCLES, corrections_count: corrections.length, keep_going: keepGoing },
} }];
