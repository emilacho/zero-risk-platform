// CC#3 F2.2 · mapea el discovery real del parent a la forma discovery_package que el track
// (downstream probado) espera. Validado contra el oráculo ($0). Robusto a discovery_output crudo
// Y discovery_package ensamblado. FALLA RUIDOSA si no hay discovery real (→ Execute Workflow error → HITL).
const dealData = $('Validate Deal Data').first().json;
const parserPkg = ($('[APIFY-WIRE] Discovery Parser · dynamic targets (lazo)').first().json.discovery_package) || {};
let loadedSummary = '';
try { const _rows = $('[JEFATURA] Load landscape_summary (canon)').first().json; loadedSummary = (Array.isArray(_rows) ? (_rows[0] && _rows[0].content_text) : (_rows && _rows.content_text)) || ''; } catch (e) { loadedSummary = ''; }
const src = Object.assign({}, parserPkg, { discovery_summary: parserPkg.discovery_summary || parserPkg.competitive_landscape_summary || loadedSummary });
const rawIcp = src.icp_signals != null ? src.icp_signals : src.icp;
const icpArr = Array.isArray(rawIcp) ? rawIcp : (rawIcp && typeof rawIcp === 'object' ? [rawIcp] : []);
const flat = (k) => icpArr.flatMap((s)=> Array.isArray(s&&s[k]) ? s[k] : (s&&s[k] ? [s[k]] : [])).filter(Boolean);
const discovery_summary = String(src.discovery_summary || src.competitive_landscape_summary || '');
if (!discovery_summary) { throw new Error('CIMIENTO_NO_DISCOVERY · sin discovery real para calificar · se PARA (→HITL)'); }
// FIX B (2026-08-08 CC#2) el CABLE DE SALIDA de Apify al escritor y al juez.
// Antes: `competitors` salía SOLO del parser = la lista del AGENTE de descubrimiento,
// anterior a cualquier scrape. La verificación de Apify no tenía consumidor:
//   . [APIFY] Enrich competitors -> lista VERIFICADA (source/trust_level/scraped/
//     positioning/evidence) . solo la leía el re-gate . rama «observar» únicamente.
//   . [APIFY-WIRE] Aggregate Service responses -> PROCEDENCIA del scraping
//     (sources[]/sources_summary) . moría en Synthesis Staging, que nadie lee.
// CORRECCION AL DISENO: Aggregate NO emite competidores (verificado en su codigo),
// emite PROCEDENCIA. Por eso el cable son DOS piezas, no una:
//   (1) CONTENIDO verificado <- Enrich . fusionado POR NOMBRE sobre la lista del parser,
//       que sigue siendo la BASE => ningun competidor se pierde si Enrich no corrio.
//   (2) PROCEDENCIA <- Aggregate . en LAS DOS ramas => el juez sabe cuanto scraping
//       hubo de verdad y si fallo.
// Los dos con try/catch: en «confirmar» el nodo Enrich NO se ejecuta y el $() lanza.
// Conservador: NO se agregan competidores que solo existan en Enrich, se CUENTAN
// (_solo_en_enrich) para decidirlo con dato.
let _enrichByName = {}; let _apify_enriched = 0; let _solo_en_enrich = 0;
try {
  const _e = $('[APIFY] Enrich competitors').first().json;
  const _list = Array.isArray(_e && _e.competitors) ? _e.competitors : [];
  for (const c of _list) {
    const k = String((c && c.name) || '').trim().toLowerCase();
    if (k) { _enrichByName[k] = c; if (c.scraped === true) _apify_enriched++; }
  }
} catch (e) { _enrichByName = {}; }
let _apify_sources = []; let _apify_summary = null;
try {
  const _a = $('[APIFY-WIRE] Aggregate Service responses (onboarding_e2e)').first().json || {};
  _apify_sources = Array.isArray(_a.sources) ? _a.sources : [];
  _apify_summary = _a.sources_summary || null;
} catch (e) { _apify_sources = []; _apify_summary = null; }
// FIX 2026-08-09 (CC#1) · metadatos (website/tipo) de los competidores CANÓNICOS,
// para poder PROMOVER al paquete los que sólo existen en Enrich (Enrich no trae website).
// Fuentes en orden: Scrape-Verify (trae website + deep_scan) → ANCHOR (lista corregida).
// Las dos con try/catch · en la rama «confirmar» esos nodos NO corren y el $() lanza.
let _metaByName = {};
for (const _n of ['[APIFY] Scrape-Verify', '[ANCHOR] Guard geo+canonical']) {
  try {
    const _j = $(_n).first().json || {};
    const _l = Array.isArray(_j.competitors) ? _j.competitors
             : (_j.discovery_output && Array.isArray(_j.discovery_output.competitors) ? _j.discovery_output.competitors : []);
    for (const c of _l) {
      const k = String((c && c.name) || '').trim().toLowerCase();
      if (k && !_metaByName[k]) _metaByName[k] = c;
    }
  } catch (e) { /* nodo no ejecutado en esta rama */ }
}
const _nombresParser = {};
for (const c of (src.competitors || [])) { _nombresParser[String((c && c.name) || '').trim().toLowerCase()] = true; }
for (const k of Object.keys(_enrichByName)) { if (!_nombresParser[k]) _solo_en_enrich++; }
const discovery_package = {
  discovery_summary,
  // E39 (CC#2 2026-09-15) · segundo filtro que copia nombre por nombre · sin este
  // renglon la casilla muere aca aunque el parser la haya traido.
  business_model: String(src.business_model || ''),
  own_handles: { facebook: (src.own_handles&&src.own_handles.facebook)||'', instagram: (src.own_handles&&src.own_handles.instagram)||'' },
  competitors: (function(){
    const _fila = (c)=>{
      const base = { name:String(c&&c.name||''), website:String(c&&c.website||''), competitor_type:String(c&&c.competitor_type||'') };
      const v = _enrichByName[base.name.trim().toLowerCase()];
      if (!v) return base;
      base.source = v.source || 'auto_discovery';
      base.trust_level = v.trust_level || 'untrusted';
      base.scraped = v.scraped === true;
      if (typeof v.positioning === 'string' && v.positioning) base.positioning = String(v.positioning).slice(0, 150);
      if (v.evidence && typeof v.evidence === 'object' && Object.keys(v.evidence).length) base.evidence = v.evidence;
      return base;
    };
    const _out = (src.competitors||[]).map(_fila);
    // FIX 2026-08-09 (CC#1) · EL CABLE QUE FALTABA. Antes esta lista era SÓLO la del parser
    // y los que existían únicamente en Enrich se CONTABAN (_solo_en_enrich) sin entrar nunca.
    // Con la base del parser vacía (exec 87035: parser 0 · enrich 6 · enriched 5) el escritor
    // recibía competitors:[] y escribía de la prosa. Ahora se PROMUEVEN, tomando website/tipo
    // de la lista canónica (Scrape-Verify/ANCHOR) y la evidencia de Enrich.
    for (const k of Object.keys(_enrichByName)) {
      if (_nombresParser[k]) continue;
      const meta = _metaByName[k] || {};
      const v = _enrichByName[k];
      _out.push(_fila({ name: v.name || meta.name || '', website: meta.website || '', competitor_type: v.competitor_type || meta.competitor_type || '' }));
    }
    return _out;
  })(),
  icp_signals: { segments: icpArr.map((s)=>s&&s.audience_segment).filter(Boolean), pain_points: flat('pain_points'), goals: flat('goals'), objections: flat('objections'), jobs_to_be_done: flat('jobs_to_be_done'), decision_criteria: flat('decision_criteria'), preferred_channels: flat('preferred_channels'), content_preferences: flat('content_preferences') },
  _apify: { enriched_count: _apify_enriched, solo_en_enrich: _solo_en_enrich, promoted_from_enrich: _solo_en_enrich, sources: _apify_sources, sources_summary: _apify_summary },
  _source: 'onboarding_e2e_discovery_real',
};
return [{ json: {
  client_id: dealData.client_id, client_name: dealData.client_name, industry: dealData.industry,
  website: dealData.website || dealData.domain, discovery_package,
  _journey_id: dealData._journey_id || $workflow.id,
  _sala_correlation_id: (($('Validate Deal Data').first().json._sala_correlation_id) || (dealData._sala_correlation_id) || $execution.id)
} }];