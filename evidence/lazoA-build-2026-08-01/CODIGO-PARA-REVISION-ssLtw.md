# ssLtw · código APLICADO (arreglos 6-8 + fix falla-falso CC#3) · para revisión

**22 nodos** · generado desde el payload compuesto · para revisión

## Webhook · smoke trigger

`n8n-nodes-base.webhook` v2

```json
{
 "httpMethod": "POST",
 "path": "zero-risk/bb-isolated-smoke",
 "responseMode": "lastNode"
}
```

## Validate Deal Data

`n8n-nodes-base.code` v2

```js
// De-smoke go-live F2.2 (CC#3) · lee data REAL del cliente del Execute Workflow Trigger.
// SIN hardcode de cliente · SIN fallback enlatado (cond.1 BINDING): ausente/malformado → FALLA RUIDOSA.
const inp = ($json && $json.body && typeof $json.body === "object") ? $json.body : ($json || {});
const missing = [];
for (const f of ['client_id','client_name','industry']) if (!inp[f]) missing.push(f);
// Pieza B (Emilio 2026-07-30) · website OPCIONAL: sin web el cimiento sale PROVISIONAL, no se para.
const _sin_web = !inp.website && !inp.domain;
const dp = inp.discovery_package;
if (!dp || typeof dp !== 'object' || !dp.discovery_summary) missing.push('discovery_package');
if (missing.length) {
  throw new Error('CIMIENTO_INPUT_INVALIDO · faltan campos reales: ' + missing.join(', ') + ' · se PARA (no se sustituye por otro cliente · cond.1 BINDING)');
}
return [{ json: { client_id: inp.client_id, client_name: inp.client_name, industry: inp.industry,
  website: inp.website || inp.domain || null, _sin_web, discovery_package: dp,
  corrections: Array.isArray(inp.corrections) ? inp.corrections : [], _fidelity_cycle: (inp._fidelity_cycle ?? null),
  _sala_correlation_id: inp._sala_correlation_id || null, _journey_id: inp._journey_id || null } }];
```

## Confirm barato · competitor list

`n8n-nodes-base.code` v2

```js
// De-smoke go-live F2.2 (CC#3) · usa el discovery_package REAL del parent (validado). SIN enlatado.
const inp = $('Validate Deal Data').first().json;
const dp = inp.discovery_package;
if (!dp || typeof dp !== 'object' || !dp.discovery_summary) {
  throw new Error('CIMIENTO_DISCOVERY_INVALIDO · discovery_package real ausente/malformado · se PARA (cond.1 BINDING)');
}
return [{ json: { client_id: inp.client_id, discovery_package: dp } }];
```

## [BB] Fan-out prep

`n8n-nodes-base.code` v2

```js
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

```

## Lente · brand-strategist

`n8n-nodes-base.httpRequest` v4.2

```json
{
 "method": "POST",
 "url": "={{ $env.ZERO_RISK_API_URL || 'https://zero-risk-platform.vercel.app' }}/api/agents/run-sdk",
 "sendHeaders": true,
 "headerParameters": {
  "parameters": [
   {
    "name": "Content-Type",
    "value": "application/json"
   },
   {
    "name": "x-api-key",
    "value": "={{ $env.INTERNAL_API_KEY }}"
   }
  ]
 },
 "sendBody": true,
 "specifyBody": "json",
 "jsonBody": "={\n  \"agent\": \"brand-strategist\",\n  \"client_id\": \"{{ $json.client_id }}\",\n  \"workflow_id\": \"{{ $execution.id }}\",\n  \"workflow_execution_id\": \"{{ $execution.id }}\",\n  \"step_name\": \"bb-lens-brand-strategist\",\n  \"task\": {{ JSON.stringify($json.tasks['brand-strategist']) }},\n  \"context\": { \"role\": \"brand_book_lens\", \"lens\": \"brand-strategist\" }\n}",
 "options": {
  "response": {
   "response": {
    "neverError": true
   }
  },
  "timeout": 800000
 }
}
```

## Lente · editor-en-jefe

`n8n-nodes-base.httpRequest` v4.2

```json
{
 "method": "POST",
 "url": "={{ $env.ZERO_RISK_API_URL || 'https://zero-risk-platform.vercel.app' }}/api/agents/run-sdk",
 "sendHeaders": true,
 "headerParameters": {
  "parameters": [
   {
    "name": "Content-Type",
    "value": "application/json"
   },
   {
    "name": "x-api-key",
    "value": "={{ $env.INTERNAL_API_KEY }}"
   }
  ]
 },
 "sendBody": true,
 "specifyBody": "json",
 "jsonBody": "={\n  \"agent\": \"editor-en-jefe\",\n  \"client_id\": \"{{ $json.client_id }}\",\n  \"workflow_id\": \"{{ $execution.id }}\",\n  \"workflow_execution_id\": \"{{ $execution.id }}\",\n  \"step_name\": \"bb-lens-editor-en-jefe\",\n  \"task\": {{ JSON.stringify($json.tasks['editor-en-jefe']) }},\n  \"context\": { \"role\": \"brand_book_lens\", \"lens\": \"editor-en-jefe\" }\n}",
 "options": {
  "response": {
   "response": {
    "neverError": true
   }
  },
  "timeout": 800000
 }
}
```

## Lente · jefe-client-success

`n8n-nodes-base.httpRequest` v4.2

```json
{
 "method": "POST",
 "url": "={{ $env.ZERO_RISK_API_URL || 'https://zero-risk-platform.vercel.app' }}/api/agents/run-sdk",
 "sendHeaders": true,
 "headerParameters": {
  "parameters": [
   {
    "name": "Content-Type",
    "value": "application/json"
   },
   {
    "name": "x-api-key",
    "value": "={{ $env.INTERNAL_API_KEY }}"
   }
  ]
 },
 "sendBody": true,
 "specifyBody": "json",
 "jsonBody": "={\n  \"agent\": \"jefe-client-success\",\n  \"client_id\": \"{{ $json.client_id }}\",\n  \"workflow_id\": \"{{ $execution.id }}\",\n  \"workflow_execution_id\": \"{{ $execution.id }}\",\n  \"step_name\": \"bb-lens-jefe-client-success\",\n  \"task\": {{ JSON.stringify($json.tasks['jefe-client-success']) }},\n  \"context\": { \"role\": \"brand_book_lens\", \"lens\": \"jefe-client-success\" }\n}",
 "options": {
  "response": {
   "response": {
    "neverError": true
   }
  },
  "timeout": 800000
 }
}
```

## [BB] Merge lentes (esperar 3)

`n8n-nodes-base.merge` v3

```json
{
 "mode": "combine",
 "combineBy": "combineByPosition",
 "numberInputs": 3,
 "options": {}
}
```

## [BB] Consolidador

`n8n-nodes-base.code` v2

```js
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
  corrections = (Array.isArray(dealData.corrections) && dealData.corrections.length) ? dealData.corrections : ($json.corrections || $json.staging_package?.corrections || []);
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
const grounding = {
  discovery_summary:
    ($('Confirm barato · competitor list').first().json.discovery_package || {}).discovery_summary || '',
  client_id: clientId,
};

return [{ json: { brand_book_draft: brandBookDraft, cycle, _fidelity_cycle: fidelityCycle, corrections, _grounding_refs: grounding } }];

```

## [BB] Judge prep

`n8n-nodes-base.code` v2

```js
// Brand Book · Judge prep · arma el task de fidelidad + metadata para el nodo HTTP.
// FIX 2026-07-01 (judge no llegaba al runner) · el fetch del Code node NO llegaba
// al runner en el contexto n8n (no creaba fila ni checkpoint → scores 0). Ahora la
// llamada run-sdk se hace en un nodo HTTP Request (timeout 800s + neverError · mismo
// patrón que lentes/revisores que SÍ funcionan). Este nodo solo prepara el task.
const THRESHOLD = 0.85;
const inJson = $json;
const draft = inJson.brand_book_draft || {};
const grounding = inJson._grounding_refs || {};
const cycle = Number(inJson.cycle) || 1;
const fidelityCycle = Number(inJson._fidelity_cycle) || 1;
// P3 (endurecido 2026-07-30) · la fuente VALIDADA manda · el borrador del modelo NUNCA
// controla la dirección de escritura. Antes era al revés (draft primero).
const clientId = $('Validate Deal Data').first().json.client_id || draft.client_id;

const SCORED_FIELDS = [
  'positioning', 'icp_summary', 'voice_description', 'customer_angle', 'retention_notes',
];
const fieldsForPrompt = SCORED_FIELDS.map((f) => ({ field: f, value: String(draft[f] || '') }));

// FIX 2026-07-01 (judge puntuaba 0 · evidencia rota) · construir la EVIDENCIA como
// PROSA LEGIBLE (no JSON.stringify().slice() que cortaba a mitad de estructura · el
// judge no la podía verificar → 0). Con evidencia limpia el mismo agente puntuó 0.92.
const g = grounding || {};
const icp = g.icp_signals || g.icp || {};
const arr = (x) => (Array.isArray(x) ? x : x ? [x] : []);
const line = (label, v) => {
  const items = arr(v).map((s) => (typeof s === 'string' ? s : (s && (s.name || s.audience_segment)) || '')).filter(Boolean);
  return items.length ? '- ' + label + ': ' + items.slice(0, 8).join(' · ') + '\n' : '';
};
const evidencia = (
  'Cliente: ' + (g.client_name || '') + ' · Industria: ' + (g.industry || '') + '\n' +
  'Resumen de descubrimiento (evidencia real del brain/discovery):\n' +
  String(g.discovery_summary || '').slice(0, 2200) + '\n\n' +
  line('Competidores', (g.competitors || []).map((c) => c.name)) +
  line('Segmentos ICP', icp.segments) +
  line('Dolores', icp.pain_points) +
  line('Objetivos', icp.goals) +
  line('Objeciones', icp.objections) +
  line('Canales preferidos', icp.preferred_channels)
).slice(0, 4000);

// run-sdk RECHAZA task > 8000 chars · guard final ≤7900.
const judgeTask = (
  'Sos un evaluador de FIDELIDAD (groundedness). Dada la EVIDENCIA real del cliente y ' +
  'los CAMPOS de un brand book, puntuá 0..1 qué tan soportado por la evidencia está cada campo ' +
  '(1 = totalmente grounded · 0 = inventado/contradice). LLAMÁ EL TOOL `emit_fidelity_scores` ' +
  'con tus scores (un número 0..1 por campo). NO narres · usá el tool · es la ÚNICA forma en ' +
  'que tus scores deciden el canon.\n\n' +
  'EVIDENCIA:\n' + evidencia + '\n\n' +
  'CAMPOS:\n' + JSON.stringify(fieldsForPrompt).slice(0, 3500)
).slice(0, 7900);

return [{ json: {
  judge_task: judgeTask,
  judge_step_name: 'bb-faithfulness-judge-c' + fidelityCycle,
  client_id: clientId,
  brand_book_draft: draft,
  _grounding_refs: grounding,
  cycle,
  _fidelity_cycle: fidelityCycle,
  threshold: THRESHOLD,
} }];

```

## [BB] Judge · run-sdk

`n8n-nodes-base.httpRequest` v4.2

```json
{
 "method": "POST",
 "url": "={{ $env.ZERO_RISK_API_URL || 'https://zero-risk-platform.vercel.app' }}/api/agents/run-sdk",
 "sendHeaders": true,
 "headerParameters": {
  "parameters": [
   {
    "name": "Content-Type",
    "value": "application/json"
   },
   {
    "name": "x-api-key",
    "value": "={{ $env.INTERNAL_API_KEY }}"
   }
  ]
 },
 "sendBody": true,
 "specifyBody": "json",
 "jsonBody": "={\n  \"agent\": \"editor-en-jefe\",\n  \"client_id\": \"{{ $json.client_id }}\",\n  \"workflow_id\": \"{{ $execution.id }}\",\n  \"workflow_execution_id\": \"{{ $execution.id }}\",\n  \"step_name\": \"{{ $json.judge_step_name }}\",\n  \"task\": {{ JSON.stringify($json.judge_task) }},\n  \"context\": { \"role\": \"faithfulness_judge\", \"threshold\": 0.85 },\n  \"extra\": { \"fidelity_judge\": true }\n}",
 "options": {
  "response": {
   "response": {
    "neverError": true
   }
  },
  "timeout": 800000
 }
}
```

## [BB] Faithfulness judge

`n8n-nodes-base.code` v2

```js
// Brand Book · Faithfulness judge · SCORING · paso 5 · ESTO decide canon (no votos).
// FIX 2026-07-01 · la llamada run-sdk se movió a un nodo HTTP previo ([BB] Judge · run-sdk)
// porque el fetch del Code node NO llegaba al runner en n8n (scores 0). Este nodo SOLO
// lee la respuesta del HTTP node (body.fidelity_scores) y computa la fidelidad.
//
// Input · $json = respuesta de [BB] Judge · run-sdk (body con fidelity_scores).
// Datos del draft/ciclo · via referencia a [BB] Judge prep.
// Output: { fidelity: { pass, threshold, scores, low_fields }, brand_book_draft, cycle }

const THRESHOLD = 0.85;
const MAX_FIDELITY_CYCLES = 2;   // pasadas de juez · cap=1 ⇒ 2 pasadas (CC#2 F2.1 · antes 1 mentía en `exhausted`)
// Todos los campos se PUNTÚAN + registran (transparencia · dashboards).
const SCORED_FIELDS = [
  'positioning', 'icp_summary', 'voice_description', 'customer_angle', 'retention_notes',
];
// FIX 2026-07-01 (consejero · Opción 1) · el GATE solo exige groundedness en los campos
// FÁCTICOS (positioning + icp_summary · verificables contra la evidencia de discovery).
// voice/customer_angle/retention_notes son DERIVACIONES CREATIVAS de marca (voz, ángulo,
// retención) · no hechos que se puedan "grounded" contra competidores/ICP · se puntúan
// pero NO bloquean el canon. El gate frena hechos inventados, no decisiones de marca.
const GATED_FIELDS = ['positioning', 'icp_summary'];

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
// El pase se decide SOLO sobre los campos fácticos gateados (Opción 1 · consejero).
const lowFields = GATED_FIELDS.filter((f) => norm[f] < THRESHOLD);
// ADR-020 §7.6 · progreso monótono · una re-síntesis que NO sube la fidelidad → STOP + mejor versión.
// try/catch OBLIGATORIO (CC#2 F1): en la 1ª pasada '[BB] Lazo A prep' NO se ejecutó y referenciarlo
// LANZA · el || no salva (Number(undefined)=NaN ⇒ falsy ⇒ evalúa el 2º operando ⇒ lanza).
// Es el idioma que [BBA] Exit ya usa con el trigger.
const gated_mean = GATED_FIELDS.reduce((a, f) => a + (Number(norm[f]) || 0), 0) / GATED_FIELDS.length;
let prev_best = Number($json.best_gated_mean) || 0;
let prev_draft = null;
try {
  const lp = $('[BB] Lazo A prep').first().json || {};
  prev_best = prev_best || Number(lp.best_gated_mean) || 0;
  prev_draft = lp.best_draft || null;
} catch (e) { /* 1ª pasada · el nodo del reintento todavía no corrió · piso 0 */ }
const improved = gated_mean > prev_best;
const pass = lowFields.length === 0;

const no_progress = !pass && fidelityCycle > 1 && !improved;
const best_gated_mean_out = Math.max(gated_mean, prev_best);
const best_draft_out = improved ? draft : (prev_draft || draft);
return [{
  json: {
    no_progress,
    best_gated_mean: best_gated_mean_out,
    best_draft: best_draft_out,
    gated_mean,
    fidelity: {
      pass,
      threshold: THRESHOLD,
      scores: norm,
      gated_fields: GATED_FIELDS, // solo éstos deciden el pase (Opción 1)
      low_fields: lowFields, // campos GATEADOS bajo umbral (los que bloquean)
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

```

## [BB] IF · fidelidad PASS

`n8n-nodes-base.if` v2

```json
{
 "conditions": {
  "options": {
   "caseSensitive": true,
   "typeValidation": "loose"
  },
  "conditions": [
   {
    "leftValue": "={{ $json.fidelity.pass }}",
    "rightValue": true,
    "operator": {
     "type": "boolean",
     "operation": "true"
    }
   }
  ],
  "combinator": "and"
 }
}
```

## [BB] IF · ciclos agotados

`n8n-nodes-base.if` v2

```json
{
 "conditions": {
  "options": {
   "caseSensitive": true,
   "typeValidation": "loose"
  },
  "conditions": [
   {
    "leftValue": "={{ (Number($json._fidelity_cycle) || 0) >= 2 || $json.no_progress === true }}",
    "rightValue": true,
    "operator": {
     "type": "boolean",
     "operation": "true"
    }
   }
  ],
  "combinator": "and"
 }
}
```

## [BB] Promote prep

`n8n-nodes-base.code` v2

```js
// Brand Book · Promote prep · arma el body para el POST /brand-book.
// FIX 2026-07-01 · el nodo Promote era un Code node con fetch() · pero `fetch` NO existe
// en los Code nodes de n8n ("fetch is not defined") → no persistía. El POST se movió a un
// nodo HTTP Request (mismo patrón que el judge). Este nodo solo prepara el body.
//
// Corre SOLO en el branch PASS del IF de fidelidad (ya gateado) · igual guardamos el
// invariante 5 (nunca persistir sin PASS) por defensa.
const fidelity = ($json && $json.fidelity) || {};
const draft = ($json && $json.brand_book_draft) || {};
// P3 (endurecido 2026-07-30) · la fuente VALIDADA manda · el borrador del modelo NUNCA
// controla la dirección de escritura. Antes era al revés (draft primero).
const clientId = $('Validate Deal Data').first().json.client_id || draft.client_id;

const promote_body = {
  // HOOK DE HONESTIDAD (Emilio 2026-07-30 · dentro de brand_book · top-level lo descarta el endpoint):
  // el registro dice QUÉ se calificó de verdad. voz/ángulo/retención NO están gateados.
  brand_book: Object.assign({}, draft, {
    gated_fields_only: true,
    provisional: !!$('Validate Deal Data').first().json._sin_web,
  }),
  source: 'onboarding_collaborative_build',
  // CANON por fidelidad · NO por firma humana ni voto Camino III.
  fidelity_passed: !!fidelity.pass,
  fidelity_scores: fidelity.scores,
  fidelity_threshold: fidelity.threshold,
  approved_by: 'faithfulness_check',
  // Date.now() está OK en Code nodes n8n (no es un workflow script del harness).
  approved_at: new Date().toISOString(),
};

return [{ json: {
  promote_body,
  client_id: clientId,
  should_persist: !!fidelity.pass, // el HTTP corre igual (el IF ya gatea) · defensa extra.
  fidelity,
} }];

```

## [BB] Promote → canon

`n8n-nodes-base.httpRequest` v4.2

```json
{
 "method": "POST",
 "url": "={{ ($env.ZERO_RISK_API_URL || 'https://zero-risk-platform.vercel.app') + '/api/brand-book/' + $json.client_id }}",
 "sendHeaders": true,
 "headerParameters": {
  "parameters": [
   {
    "name": "Content-Type",
    "value": "application/json"
   },
   {
    "name": "x-api-key",
    "value": "={{ $env.INTERNAL_API_KEY }}"
   }
  ]
 },
 "sendBody": true,
 "specifyBody": "json",
 "jsonBody": "={{ JSON.stringify($json.promote_body) }}",
 "options": {
  "response": {
   "response": {
    "neverError": true
   }
  },
  "timeout": 800000
 }
}
```

## [BB] HITL último recurso (no Emilio)

`n8n-nodes-base.httpRequest` v4.2 · **[APAGADO]**

```json
{
 "method": "POST",
 "url": "={{ $env.ZERO_RISK_API_URL || 'https://zero-risk-platform.vercel.app' }}/api/hitl/queue",
 "sendBody": true,
 "specifyBody": "json",
 "jsonBody": "={\n  \"type\": \"brand_book_fidelity_last_resort\",\n  \"client_id\": \"{{ $json.brand_book_draft.client_id }}\",\n  \"fidelity\": {{ JSON.stringify($json.fidelity) }}\n}",
 "options": {
  "timeout": 15000
 }
}
```

## [BB] Trigger Onboarding Report

`n8n-nodes-base.httpRequest` v4.2 · **[APAGADO]**

```json
{
 "method": "POST",
 "url": "https://n8n-production-72be.up.railway.app/webhook/onboarding-report",
 "sendBody": true,
 "specifyBody": "json",
 "jsonBody": "={{ { \"client_id\": $('[BB] Promote prep').item.json.client_id } }}",
 "options": {
  "response": {
   "response": {
    "neverError": true
   }
  },
  "timeout": 60000
 }
}
```

## Execute Workflow Trigger (productivo · CC#3 F2.2)

`n8n-nodes-base.executeWorkflowTrigger` v1.1

```json
{
 "inputSource": "passthrough"
}
```

## Return scores a parent (grade-cimiento gate)

`n8n-nodes-base.code` v2

```js
// Contrato de retorno al parent (CC#3 F2.2 · gate único = grade-cimiento en el parent).
// Track = PRODUCTOR: corre lentes→Consolidador→Judge y DEVUELVE scores+draft · NO decide/persiste.
// Retorna en TODAS las salidas (PASS y ciclos-agotados) · sin dead-end (cond.3).
// 2026-08-01 · CC#3 §2 · FALLA-FALSO. Con el ciclo, [BB] Faithfulness judge corre DOS veces
// (pasada 1 + pasada 2 tras la corrección) y este nodo corre UNA sola ⇒
// `$('[BB] Faithfulness judge').first()` puede resolver al runIndex 0 = LA PASADA 1 ⇒
// reportaría track_pass:false JUSTO CUANDO la corrección funcionó, con el manual ya escrito.
// Es el espejo del "listo falso": un FALLA-FALSO.
//
// Se prefiere la fuente DIRECTA del camino recorrido, que no depende de alinear runIndex:
//   · agotado → $json ES la salida del juez de la pasada 2 (viene por IF ciclos agotados out#0)
//   · PASS    → $('[BB] Promote prep') · corre UNA sola vez y emite `fidelity`
// El juez por referencia queda como ÚLTIMO recurso, no como fuente principal.
let src = null; let _return_source = 'ninguno';
if ($json && $json.fidelity) { src = $json; _return_source = 'json_directo'; }
if (!src) { try { const pp = $('[BB] Promote prep').first().json;
  if (pp && pp.fidelity) { src = pp; _return_source = 'promote_prep'; } } catch (e) {} }
if (!src) { try { src = $('[BB] Faithfulness judge').first().json; _return_source = 'juez_referencia'; }
  catch (e) { src = {}; _return_source = 'vacio'; } }
const fj = src;
const fid = fj.fidelity || {};
const draft = fj.brand_book_draft || (fj.promote_body && fj.promote_body.brand_book) || {};
return [{ json: {
  fidelity_scores: fid.scores || {},
  brand_book_draft: fj.best_draft || draft,   // §7.6 · se devuelve la MEJOR versión registrada
  client_id: draft.client_id || fj.client_id || null,
  track_pass: !!fid.pass,
  track_exhausted: !!fid.exhausted,
  fidelity_cycle: Number(fj._fidelity_cycle || fid.fidelity_cycle || 1),
  _return_source,        // observabilidad · de qué fuente salió el veredicto (chequeo #6 del humo)
  _cimiento_return: true
} }];
```

## [BB] Lazo A prep

`n8n-nodes-base.code` v2

```js
// [BB] Lazo A prep · code · SIN LLM · prepara la invocación del ciclo de corrección.
// Hace 4 cosas, las 4 necesarias:
//  (1) completa _grounding_refs — el juez NO lo emite y el guard P0 del Lazo A salta sin él
//  (2) INCREMENTA _fidelity_cycle (+1) — el Consolidador ya no está en este camino:
//      sin este +1 el lazo NO TERMINA. El contador vive ACÁ, nunca dentro del sub-proceso.
//  (3) pasa low_fields/scores para que el revisor sepa QUÉ falló (arreglo 8.a)
//  (4) arrastra la mejor versión registrada (§7.6 progreso monótono)
const j = $json;
const fid = j.fidelity || {};
const draft = j.brand_book_draft || {};
let grounding = {};
try { grounding = $('[BB] Judge prep').first().json._grounding_refs || {}; } catch (e) { grounding = {}; }

// piso · nunca invocar la corrección sin artefacto (dispararía el guard P0 y volvería {})
if (!draft || Object.keys(draft).length === 0) {
  throw new Error('LAZO_A_SIN_BORRADOR · no se invoca la corrección sin artefacto');
}
// CC#2 F4 · simétrico · el guard P0 del Lazo A salta si el borrador O la evidencia vienen
// vacíos ⇒ Merge se queda sin ítems ⇒ Exit tampoco corre ⇒ el fail-closed no puede atrapar.
// Mejor fallar ruidoso ANTES de gastar que devolver nada en silencio después de 4 llamadas.
if (!grounding || Object.keys(grounding).length === 0) {
  throw new Error('LAZO_A_SIN_EVIDENCIA · no se invoca la corrección sin evidencia · el revisor diagnosticaría a ciegas');
}

return [{ json: {
  brand_book_draft: draft,
  _grounding_refs: grounding,
  client_id: draft.client_id || $('Validate Deal Data').first().json.client_id,
  cycle: Number(j.cycle) || 1,
  _fidelity_cycle: (Number(j._fidelity_cycle) || 0) + 1,
  low_fields: fid.low_fields || [],
  scores: fid.scores || {},
  best_draft: j.best_draft || draft,
  best_gated_mean: Number(j.best_gated_mean) || 0,
} }];
```

## [BB] Execute Lazo A corrección

`n8n-nodes-base.executeWorkflow` v1

```json
{
 "workflowId": {
  "__rl": true,
  "value": "kSSAvCbEfHs2Hoa0",
  "mode": "id"
 },
 "options": {}
}
```

## conexiones

```json
{
 "Webhook · smoke trigger": {
  "main": [
   [
    {
     "node": "Validate Deal Data",
     "type": "main",
     "index": 0
    }
   ]
  ]
 },
 "Validate Deal Data": {
  "main": [
   [
    {
     "node": "Confirm barato · competitor list",
     "type": "main",
     "index": 0
    }
   ]
  ]
 },
 "Confirm barato · competitor list": {
  "main": [
   [
    {
     "node": "[BB] Fan-out prep",
     "type": "main",
     "index": 0
    }
   ]
  ]
 },
 "[BB] Fan-out prep": {
  "main": [
   [
    {
     "node": "Lente · brand-strategist",
     "type": "main",
     "index": 0
    },
    {
     "node": "Lente · editor-en-jefe",
     "type": "main",
     "index": 0
    },
    {
     "node": "Lente · jefe-client-success",
     "type": "main",
     "index": 0
    }
   ]
  ]
 },
 "Lente · brand-strategist": {
  "main": [
   [
    {
     "node": "[BB] Merge lentes (esperar 3)",
     "type": "main",
     "index": 0
    }
   ]
  ]
 },
 "Lente · editor-en-jefe": {
  "main": [
   [
    {
     "node": "[BB] Merge lentes (esperar 3)",
     "type": "main",
     "index": 1
    }
   ]
  ]
 },
 "Lente · jefe-client-success": {
  "main": [
   [
    {
     "node": "[BB] Merge lentes (esperar 3)",
     "type": "main",
     "index": 2
    }
   ]
  ]
 },
 "[BB] Merge lentes (esperar 3)": {
  "main": [
   [
    {
     "node": "[BB] Consolidador",
     "type": "main",
     "index": 0
    }
   ]
  ]
 },
 "[BB] Consolidador": {
  "main": [
   [
    {
     "node": "[BB] Judge prep",
     "type": "main",
     "index": 0
    }
   ]
  ]
 },
 "[BB] Judge prep": {
  "main": [
   [
    {
     "node": "[BB] Judge · run-sdk",
     "type": "main",
     "index": 0
    }
   ]
  ]
 },
 "[BB] Judge · run-sdk": {
  "main": [
   [
    {
     "node": "[BB] Faithfulness judge",
     "type": "main",
     "index": 0
    }
   ]
  ]
 },
 "[BB] Faithfulness judge": {
  "main": [
   [
    {
     "node": "[BB] IF · fidelidad PASS",
     "type": "main",
     "index": 0
    }
   ]
  ]
 },
 "[BB] IF · fidelidad PASS": {
  "main": [
   [
    {
     "node": "[BB] Promote prep",
     "type": "main",
     "index": 0
    }
   ],
   [
    {
     "node": "[BB] IF · ciclos agotados",
     "type": "main",
     "index": 0
    }
   ]
  ]
 },
 "[BB] Promote prep": {
  "main": [
   [
    {
     "node": "[BB] Promote → canon",
     "type": "main",
     "index": 0
    }
   ]
  ]
 },
 "[BB] IF · ciclos agotados": {
  "main": [
   [
    {
     "node": "Return scores a parent (grade-cimiento gate)",
     "type": "main",
     "index": 0
    }
   ],
   [
    {
     "node": "[BB] Lazo A prep",
     "type": "main",
     "index": 0
    }
   ]
  ]
 },
 "[BB] Promote → canon": {
  "main": [
   [
    {
     "node": "Return scores a parent (grade-cimiento gate)",
     "type": "main",
     "index": 0
    }
   ]
  ]
 },
 "Execute Workflow Trigger (productivo · CC#3 F2.2)": {
  "main": [
   [
    {
     "node": "Validate Deal Data",
     "type": "main",
     "index": 0
    }
   ]
  ]
 },
 "[BB] Lazo A prep": {
  "main": [
   [
    {
     "node": "[BB] Execute Lazo A corrección",
     "type": "main",
     "index": 0
    }
   ]
  ]
 },
 "[BB] Execute Lazo A corrección": {
  "main": [
   [
    {
     "node": "[BB] Judge prep",
     "type": "main",
     "index": 0
    }
   ]
  ]
 }
}
```
