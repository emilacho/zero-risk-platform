# Lazo A · código APLICADO (arreglos 1-5 + reviewers_ok CC#3) · para revisión

**11 nodos** · generado desde el payload compuesto · para revisión

## Lazo A · trigger (Execute Workflow)

`n8n-nodes-base.executeWorkflowTrigger` v1

```json
{}
```

## [BBA] Review prep

`n8n-nodes-base.code` v2

```js
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
// [GUARD P0 · CC#2 2026-07-02 re-apply post-revert] Skip degenerado · si EVIDENCIA
// o BORRADOR vacíos ({}/sin keys) → 0 items (los 3 revisores no corren · loop termina).
const _draftEmpty = !draft || typeof draft !== 'object' || Object.keys(draft).length === 0;
const _groundingEmpty = !grounding || typeof grounding !== 'object' || Object.keys(grounding).length === 0;
if (_draftEmpty || _groundingEmpty) {
  console.warn('[BBA][guard] skip review · brand_book_draft o _grounding_refs vacios · client=' + (clientId || '?') + ' cycle=' + cycle);
  return [];
}


const FORMAT =
  'Emití SOLO JSON: {"corrections":[{eje,severidad,donde,problema,por_que,cambio_sugerido}]}.\n' +
  '- eje: "factual"|"voz"|"posicionamiento"|"cliente"\n' +
  '- severidad: "rojo"|"ámbar" (rojo = choca con la evidencia / regla dura)\n' +
  '- Regla: NO emitas "rojo" sin un objeto-corrección accionable. Sin prosa.\n' +
  '- Si el borrador ya está bien en TU eje, devolvé {"corrections":[]}.';

// FIX 2026-07-01 (límite 8000 chars run-sdk) · slices reducidos + guard final ≤7900.
const base =
  'Sos revisor de un borrador de BRAND BOOK. Diagnosticá (NO reescribas) contra la ' +
  'EVIDENCIA real del cliente. Tu rol corrige solo TU eje.\n\n' +
  'EVIDENCIA:\n' + JSON.stringify(grounding).slice(0, 3000) + '\n\n' +
  (Array.isArray(inp.low_fields) && inp.low_fields.length
    ? 'EL JUEZ REPROBÓ estos campos (groundedness < 0.85): ' +
      inp.low_fields.map((f) => f + ' (' + ((inp.scores || {})[f] ?? '?') + ')').join(' · ') +
      '. Priorizá correcciones que SUBAN su groundedness contra la EVIDENCIA.\n\n'
    : '') +
  'BORRADOR:\n' + JSON.stringify(draft).slice(0, 3500) + '\n\n' + FORMAT;

const cap = (t) => t.slice(0, 7900);
const reviewers = [
  { reviewer: 'brand-strategist', agent: 'brand-strategist',
    task: cap(base + '\n\nTU EJE: posicionamiento + ICP · ¿el posicionamiento contradice la evidencia? ¿ICP refleja la data?') },
  { reviewer: 'editor-en-jefe', agent: 'editor-en-jefe',
    task: cap(base + '\n\nTU EJE: voz · ¿los principios de voz son concretos/testeables? ¿forbidden_words/required_terminology coherentes?') },
  { reviewer: 'jefe-client-success', agent: 'jefe-client-success',
    task: cap(base + '\n\nTU EJE: cliente · ¿el ICP/ángulo refleja la retención? ¿algo no aterriza en valor cliente?') },
];

// 2026-08-01 · patrón del hermano ([BB] Fan-out prep · fix exec 41641): UN ítem con las
// tareas indexadas por eje. Antes emitía 3 ítems y su única salida iba a los 3 nodos
// revisores ⇒ cada revisor corría 3 veces (9 llamadas · las mismas 3 revisiones
// triplicadas · defecto C de CC#2). Cada nodo revisor lee AHORA su propia tarea.
const tasks = {
  'brand-strategist':    reviewers[0].task,
  'editor-en-jefe':      reviewers[1].task,
  'jefe-client-success': reviewers[2].task,
};
return [{ json: {
  tasks, brand_book_draft: draft, _grounding_refs: grounding, client_id: clientId, cycle,
  low_fields: Array.isArray(inp.low_fields) ? inp.low_fields : [],
  scores: inp.scores || {},
} }];

```

## Revisor · brand-strategist

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
 "jsonBody": "={\n  \"agent\": \"brand-strategist\",\n  \"client_id\": \"{{ $json.client_id }}\",\n  \"workflow_id\": \"{{ $execution.id }}\",\n  \"workflow_execution_id\": \"{{ $execution.id }}\",\n  \"task\": {{ JSON.stringify($json.tasks['brand-strategist']) }},\n  \"context\": { \"role\": \"brand_book_corrector\", \"reviewer\": \"brand-strategist\" }\n}",
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

## Revisor · editor-en-jefe

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
 "jsonBody": "={\n  \"agent\": \"editor-en-jefe\",\n  \"client_id\": \"{{ $json.client_id }}\",\n  \"workflow_id\": \"{{ $execution.id }}\",\n  \"workflow_execution_id\": \"{{ $execution.id }}\",\n  \"task\": {{ JSON.stringify($json.tasks['editor-en-jefe']) }},\n  \"context\": { \"role\": \"brand_book_corrector\", \"reviewer\": \"editor-en-jefe\" }\n}",
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

## Revisor · jefe-client-success

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
 "jsonBody": "={\n  \"agent\": \"jefe-client-success\",\n  \"client_id\": \"{{ $json.client_id }}\",\n  \"workflow_id\": \"{{ $execution.id }}\",\n  \"workflow_execution_id\": \"{{ $execution.id }}\",\n  \"task\": {{ JSON.stringify($json.tasks['jefe-client-success']) }},\n  \"context\": { \"role\": \"brand_book_corrector\", \"reviewer\": \"jefe-client-success\" }\n}",
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

## [BBA] Merge corrections

`n8n-nodes-base.code` v2

```js
// Lazo A · Merge corrections · consolida las correcciones de los 3 jefes y
// decide si hay que seguir corrigiendo. NO vinculante (no es voto pass/reject ·
// spec Lazo A): es mejora iterativa hasta converger o agotar 3 ciclos (§150).
//
// Input: items de los 3 review-agents (cada uno con `response` = JSON corrections)
// Output: { brand_book_draft, _grounding_refs, client_id, cycle, corrections, keep_going }

// FIX 2026-06-30 (Fix B · recorte de volumen) · Lazo A a 1 ciclo. Es NO VINCULANTE
// (la fidelidad decide canon · no estos votos) · y era el multiplicador de costo
// (corría 3-4 ciclos × 3 revisores POR cada ciclo de fidelidad → ~60 invocaciones).
// Ahora · 1 pasada de diagnóstico + a lo sumo 1 re-síntesis · Re-síntesis → Exit
// (sin loop-back · ver build-correction-subworkflow.mjs).
const MAX_CYCLES = 1;
const items = $input.all();

// 2026-08-01 · CAUSA RAÍZ (commit 486ceaf "el Lazo A borraba el draft"): el borrador y la
// evidencia se toman del TRIGGER, no de items[0] — items[0] es la RESPUESTA HTTP de un
// revisor, y el nodo HTTP reemplaza el ítem ⇒ draft = {} ⇒ el juez puntuaba 0.
const src = (() => { try { return $('Lazo A · trigger (Execute Workflow)').first().json || {}; } catch (e) { return {}; } })();
const draft = src.brand_book_draft || {};
const grounding = src._grounding_refs || {};
const clientId = src.client_id || draft.client_id;
const cycle = Number(src.cycle) || 0;
const lowFields = Array.isArray(src.low_fields) ? src.low_fields : [];

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

// Re-sintetizar UNA vez si hay correcciones accionables · Re-síntesis → Exit
// (no hay loop-back · el cap de 1 ciclo lo da el wiring, no este contador).
// ADR-020 §7.3 · SOLO el ROJO dispara re-síntesis · el ámbar es advisory y NO itera.
// 2ª capa · relevancia-al-gate: solo amerita ciclo lo que puede mover la fidelidad
// (ejes factual/posicionamiento → positioning · icp_summary). Lo estilístico jamás cicla.
const EJE_GATEADO = new Set(['factual', 'posicionamiento']);
const bloqueantes = corrections.filter((c) =>
  c.severidad === 'rojo' && EJE_GATEADO.has(c.eje) && c.cambio_sugerido.trim().length > 0);
// §7.3 · presupuesto top-N · el creador recibe foco, no un volcado de nitpicks.
const TOP_N = 5;
const bloqueantes_top = bloqueantes.slice(0, TOP_N);
const keepGoing = bloqueantes_top.length > 0;

// CC#2 F3 · cuenta respuestas PARSEABLES con la clave `corrections` presente (aunque venga
// vacía) · NO por longitud (un revisor sin hallazgos es legítimo) ni por ausencia de `.error`
// (un 401 con neverError puede devolver {message}/{detail}/HTML y colarse como OK).
const parseable = (it) => { try {
  const b = (it.json && it.json.body) || it.json || {};
  const t = typeof b.response === 'string' ? b.response : JSON.stringify(b);
  const m = t.match(/\{[\s\S]*\}/);
  return !!m && Array.isArray(JSON.parse(m[0]).corrections);
} catch (e) { return false; } };
const reviewers_ok = items.filter(parseable).length;

return [{ json: {
  brand_book_draft: draft,
  _grounding_refs: grounding,
  client_id: clientId,
  cycle,
  corrections,
  corrections_bloqueantes: bloqueantes_top,
  keep_going: keepGoing,
  reviewers_ok,
  low_fields: lowFields,
  _lazo_a: { cycle, max_cycles: MAX_CYCLES, corrections_count: corrections.length,
             bloqueantes_count: bloqueantes.length, keep_going: keepGoing, reviewers_ok },
} }];

```

## [BBA] IF · seguir corrigiendo

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
    "leftValue": "={{ $json.keep_going }}",
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

## [BBA] Exit · borrador final

`n8n-nodes-base.code` v2

```js
// [BBA] Exit · borrador final · FAIL-CLOSED (2026-08-01).
// Los 3 pisos anteriores fallaban ABIERTOS:
//  (1) fc=0 reseteaba el contador del llamador ⇒ BUCLE INFINITO a ~5 llamadas por vuelta.
//  (2) un borrador vacío reemplazaba al bueno camino al juez.
//  (3) corrections se perdía justo en la rama donde SÍ se corrigió.
const j = $json;
const FC_AGOTADO = 99;   // ante la duda, AGOTADO · nunca reiniciar el contador del llamador
const src = (() => { try { return $('Lazo A · trigger (Execute Workflow)').first().json || {}; } catch (e) { return {}; } })();
let fc = FC_AGOTADO;
const n = Number(src._fidelity_cycle);
if (Number.isFinite(n) && n > 0) fc = n;
const out = j.brand_book_draft;
const draftOk = out && typeof out === 'object' && Object.keys(out).length > 0;
return [{ json: {
  brand_book_draft: draftOk ? out : src.brand_book_draft,   // piso · conserva el previo
  _grounding_refs: j._grounding_refs || src._grounding_refs,
  client_id: j.client_id || src.client_id,
  cycle: j.cycle,
  _fidelity_cycle: fc,
  corrections: j.corrections || [],
  reviewers_ok: (j.reviewers_ok !== undefined ? j.reviewers_ok : null),
  resynth_ok: j.resynth_ok !== false,
  _draft_preserved: !draftOk,
  _lazo_a_done: true,
} }];
```

## [BBA] Re-síntesis prep

`n8n-nodes-base.code` v2

```js
// [BBA] Re-síntesis prep · arma el task · SIN llamadas (el fetch salía del Code · CC#2/CC#3).
// Recorte por ÍTEMS COMPLETOS, no por caracteres: JSON.stringify().slice() corta a mitad de
// objeto y entrega JSON inválido al modelo (el patrón que ya dañó al juez).
const inp = $json;
const draft = inp.brand_book_draft || {};
const grounding = inp._grounding_refs || {};
const clientId = inp.client_id || draft.client_id;
const nextCycle = (Number(inp.cycle) || 0) + 1;
// top-N bloqueantes (§7.3) · si no vinieran, cae a corrections
const base = Array.isArray(inp.corrections_bloqueantes) && inp.corrections_bloqueantes.length
  ? inp.corrections_bloqueantes : (inp.corrections || []);
const capItems = (arr, max) => { const out = []; let len = 0;
  for (const it of arr) { const s = JSON.stringify(it); if (len + s.length > max) break; out.push(it); len += s.length; }
  return out; };
const correcciones = capItems(base, 2500);

const task = (
  'Sos el consolidador del brand book (el MAKER · no un revisor). Mejorá el BORRADOR ' +
  'aplicando SOLO las CORRECCIONES de los jefes, grounded en la EVIDENCIA. NO inventes ' +
  'campos nuevos · mantené la estructura. LLAMÁ EL TOOL `emit_brand_section` (pasá ' +
  'lens:"brand-strategist") con TODOS los campos mejorados (positioning, icp_summary, ' +
  'voice_description, forbidden_words[], required_terminology[], customer_angle, ' +
  'retention_notes). NO narres · usá el tool.\n\n' +
  'EVIDENCIA:\n' + JSON.stringify(grounding).slice(0, 2500) + '\n\n' +
  'BORRADOR:\n' + JSON.stringify(draft).slice(0, 2500) + '\n\n' +
  'CORRECCIONES:\n' + JSON.stringify(correcciones)
).slice(0, 7900);

return [{ json: { task, brand_book_draft: draft, _grounding_refs: grounding, client_id: clientId,
  cycle: nextCycle, corrections: inp.corrections || [], _fidelity_cycle: inp._fidelity_cycle,
  // CC#3 §3 · reviewers_ok se perdía justo en el camino CORREGIDO
  reviewers_ok: inp.reviewers_ok } }];
```

## [BBA] Re-síntesis · run-sdk

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
 "jsonBody": "={\n  \"agent\": \"brand-strategist\",\n  \"client_id\": \"{{ $json.client_id }}\",\n  \"workflow_id\": \"{{ $execution.id }}\",\n  \"workflow_execution_id\": \"{{ $execution.id }}\",\n  \"task\": {{ JSON.stringify($json.task) }},\n  \"context\": { \"role\": \"brand_book_consolidator_resynth\", \"cycle\": {{ $json.cycle }} }\n}",
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

## [BBA] Re-síntesis parse

`n8n-nodes-base.code` v2

```js
// [BBA] Re-síntesis parse · mezcla la sección mejorada · marca resynth_ok · propaga corrections
// (la telemetría estaba invertida: llegaban [] justo cuando SÍ se corrigió).
const body = ($json && $json.body) || $json || {};
const src = (() => { try { return $('[BBA] Re-síntesis prep').first().json || {}; } catch (e) { return {}; } })();
const draft = src.brand_book_draft || {};
const clientId = src.client_id || draft.client_id;
let cand = body.brand_section || null;
if (!cand && typeof body.response === 'string') {
  const m = body.response.match(/\{[\s\S]*\}/);
  if (m) { try { const p = JSON.parse(m[0]); cand = p.brand_book_draft || p; } catch (e) {} }
}
const resynth_ok = !!(cand && typeof cand === 'object');
const improved = resynth_ok ? { ...draft, ...cand, client_id: clientId } : draft;
return [{ json: {
  brand_book_draft: improved,
  _grounding_refs: src._grounding_refs || {},
  client_id: clientId,
  cycle: src.cycle,
  corrections: src.corrections || [],
  resynth_ok,
  // CC#3 §3 · misma inversión de telemetría que ya se cerró para corrections
  reviewers_ok: src.reviewers_ok,
} }];
```

## conexiones

```json
{
 "Lazo A · trigger (Execute Workflow)": {
  "main": [
   [
    {
     "node": "[BBA] Review prep",
     "type": "main",
     "index": 0
    }
   ]
  ]
 },
 "[BBA] Review prep": {
  "main": [
   [
    {
     "node": "Revisor · brand-strategist",
     "type": "main",
     "index": 0
    },
    {
     "node": "Revisor · editor-en-jefe",
     "type": "main",
     "index": 0
    },
    {
     "node": "Revisor · jefe-client-success",
     "type": "main",
     "index": 0
    }
   ]
  ]
 },
 "Revisor · brand-strategist": {
  "main": [
   [
    {
     "node": "[BBA] Merge corrections",
     "type": "main",
     "index": 0
    }
   ]
  ]
 },
 "Revisor · editor-en-jefe": {
  "main": [
   [
    {
     "node": "[BBA] Merge corrections",
     "type": "main",
     "index": 0
    }
   ]
  ]
 },
 "Revisor · jefe-client-success": {
  "main": [
   [
    {
     "node": "[BBA] Merge corrections",
     "type": "main",
     "index": 0
    }
   ]
  ]
 },
 "[BBA] Merge corrections": {
  "main": [
   [
    {
     "node": "[BBA] IF · seguir corrigiendo",
     "type": "main",
     "index": 0
    }
   ]
  ]
 },
 "[BBA] IF · seguir corrigiendo": {
  "main": [
   [
    {
     "node": "[BBA] Re-síntesis prep",
     "type": "main",
     "index": 0
    }
   ],
   [
    {
     "node": "[BBA] Exit · borrador final",
     "type": "main",
     "index": 0
    }
   ]
  ]
 },
 "[BBA] Re-síntesis prep": {
  "main": [
   [
    {
     "node": "[BBA] Re-síntesis · run-sdk",
     "type": "main",
     "index": 0
    }
   ]
  ]
 },
 "[BBA] Re-síntesis · run-sdk": {
  "main": [
   [
    {
     "node": "[BBA] Re-síntesis parse",
     "type": "main",
     "index": 0
    }
   ]
  ]
 },
 "[BBA] Re-síntesis parse": {
  "main": [
   [
    {
     "node": "[BBA] Exit · borrador final",
     "type": "main",
     "index": 0
    }
   ]
  ]
 }
}
```
