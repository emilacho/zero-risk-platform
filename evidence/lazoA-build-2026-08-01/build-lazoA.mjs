// BUILD Lazo A · arreglos 1-5 + 8.a · plan FINAL cap=1 v2 (CC#3) con las 8 correcciones de CC#2
// Ensayo por defecto · con --ejecutar: V12 (sintaxis) + UN PUT con payload completo.
import fs from 'node:fs';
import crypto from 'node:crypto';
import vm from 'node:vm';

const DIR = new URL('./', import.meta.url);
const env = Object.fromEntries(
  fs.readFileSync(process.argv[2], 'utf8').split(/\r?\n/).filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
const B = env.N8N_BASE_URL + '/api/v1';
const H = { 'X-N8N-API-KEY': env.N8N_API_KEY, 'Content-Type': 'application/json' };
const ID = 'kSSAvCbEfHs2Hoa0';

const CAMPOS = ['name', 'parameters', 'onError', 'retryOnFail', 'typeVersion', 'webhookId'];
const ordenar = (o) => Array.isArray(o) ? o.map(ordenar)
  : (o && typeof o === 'object' ? Object.fromEntries(Object.keys(o).sort().map((k) => [k, ordenar(o[k])])) : o);
const huella = (ns) => crypto.createHash('sha256').update(JSON.stringify(
  [...ns].sort((a, b) => a.name.localeCompare(b.name))
    .map((n) => ordenar(Object.fromEntries(CAMPOS.map((k) => [k, n[k] === undefined ? null : n[k]])))))).digest('hex');

const rep = []; const L = (s) => { console.log(s); rep.push(s); };

// El Lazo A (02-jul) guarda el jsCode con CRLF · LyVoK usa LF. Los anclas multilínea
// escritos con \n no matchean. Este emparejador tolera los dos finales de línea.
const rx = (s) => new RegExp(s.split('\n').map((l) => l.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\r?\\n'));
const swap = (code, viejo, nuevo, etiqueta) => {
  const re = rx(viejo);
  if (!re.test(code)) throw new Error(etiqueta + ' · no encuentro el bloque');
  return code.replace(re, () => nuevo);
};
const REVIEW = '[BBA] Review prep', MERGE = '[BBA] Merge corrections', RESYN = '[BBA] Re-síntesis';
const IFSEG = '[BBA] IF · seguir corrigiendo', EXIT = '[BBA] Exit · borrador final';
const PREP = '[BBA] Re-síntesis prep', RUN = '[BBA] Re-síntesis · run-sdk', PARSE = '[BBA] Re-síntesis parse';
const REVISORES = ['Revisor · brand-strategist', 'Revisor · editor-en-jefe', 'Revisor · jefe-client-success'];
const EJES = { 'Revisor · brand-strategist': 'brand-strategist', 'Revisor · editor-en-jefe': 'editor-en-jefe', 'Revisor · jefe-client-success': 'jefe-client-success' };
// nodos EDITADOS o NUEVOS · la huella se compara sobre el resto
const TOCADOS = [REVIEW, MERGE, RESYN, EXIT, ...REVISORES, PREP, RUN, PARSE];

(async () => {
  const pre = JSON.parse(fs.readFileSync(new URL('./BASELINE-LazoA.json', DIR), 'utf8'));
  L(`=== BASELINE Lazo A · ${pre.nodes.length} nodos · versionId ${pre.versionId} · active ${pre.active} ===`);
  const hPre = huella(pre.nodes.filter((n) => !TOCADOS.includes(n.name)));
  L(`huella de los NO tocados (${pre.nodes.filter((n) => !TOCADOS.includes(n.name)).length}): ${hPre}`);

  const w = JSON.parse(JSON.stringify(pre));
  const N = (n) => { const x = w.nodes.find((y) => y.name === n); if (!x) throw new Error('falta ' + n); return x; };

  // ─────────── ARREGLO 1 · Review prep → 1 ítem con tasks indexadas · + 8.a low_fields ───────────
  {
    const nd = N(REVIEW);
    let c = nd.parameters.jsCode;
    // 8.a · ranura de diagnóstico ANTES del BORRADOR
    const ANCLA = `  'BORRADOR:\\n' + JSON.stringify(draft).slice(0, 3500) + '\\n\\n' + FORMAT;`;
    c = swap(c, ANCLA, 
`  (Array.isArray(inp.low_fields) && inp.low_fields.length
    ? 'EL JUEZ REPROBÓ estos campos (groundedness < 0.85): ' +
      inp.low_fields.map((f) => f + ' (' + ((inp.scores || {})[f] ?? '?') + ')').join(' · ') +
      '. Priorizá correcciones que SUBAN su groundedness contra la EVIDENCIA.\\n\\n'
    : '') +
  'BORRADOR:\\n' + JSON.stringify(draft).slice(0, 3500) + '\\n\\n' + FORMAT;`);
    // A1 · un solo ítem
    const RET = `return reviewers.map((r) => ({
  json: { ...r, brand_book_draft: draft, _grounding_refs: grounding, client_id: clientId, cycle },
}));`;
    c = swap(c, RET, 
`// 2026-08-01 · patrón del hermano ([BB] Fan-out prep · fix exec 41641): UN ítem con las
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
} }];`, 'A1');
    nd.parameters.jsCode = c;
    L('arreglo 1 + 8.a · Review prep → 1 ítem indexado + ranura low_fields ✅');
  }

  // ─────────── ARREGLO 2 · revisores · agente FIJO + su tarea ───────────
  for (const r of REVISORES) {
    const nd = N(r); const eje = EJES[r];
    let b = nd.parameters.jsonBody;
    if (!b.includes('"agent": "{{ $json.agent }}"')) throw new Error('A2 · agente dinámico no encontrado en ' + r);
    if (!b.includes('"task": {{ JSON.stringify($json.task) }}')) throw new Error('A2 · task no encontrada en ' + r);
    b = b.replace('"agent": "{{ $json.agent }}"', `"agent": "${eje}"`)
         .replace('"task": {{ JSON.stringify($json.task) }}', `"task": {{ JSON.stringify($json.tasks['${eje}']) }}`);
    nd.parameters.jsonBody = b;
    L(`arreglo 2 · ${r} → agente fijo '${eje}' + su tarea ✅`);
  }

  // ─────────── ARREGLO 3 · Merge corrections · trigger + §7.3 + reviewers_ok parseable ───────────
  {
    const nd = N(MERGE); let c = nd.parameters.jsCode;
    const VIEJO_SRC = `const items = $input.all();

// recupera draft/grounding/cycle del primer item (todos lo comparten).
const first = (items[0] && items[0].json) || {};
const draft = first.brand_book_draft || {};
const grounding = first._grounding_refs || {};
const clientId = first.client_id || draft.client_id;
const cycle = Number(first.cycle) || 0;`;
    c = swap(c, VIEJO_SRC, 
`const items = $input.all();

// 2026-08-01 · CAUSA RAÍZ (commit 486ceaf "el Lazo A borraba el draft"): el borrador y la
// evidencia se toman del TRIGGER, no de items[0] — items[0] es la RESPUESTA HTTP de un
// revisor, y el nodo HTTP reemplaza el ítem ⇒ draft = {} ⇒ el juez puntuaba 0.
const src = (() => { try { return $('Lazo A · trigger (Execute Workflow)').first().json || {}; } catch (e) { return {}; } })();
const draft = src.brand_book_draft || {};
const grounding = src._grounding_refs || {};
const clientId = src.client_id || draft.client_id;
const cycle = Number(src.cycle) || 0;
const lowFields = Array.isArray(src.low_fields) ? src.low_fields : [];`, 'A3-src');

    const VIEJO_KG = `const hasActionable = corrections.some((c) => c.cambio_sugerido.trim().length > 0);
const keepGoing = hasActionable;`;
    c = swap(c, VIEJO_KG, 
`// ADR-020 §7.3 · SOLO el ROJO dispara re-síntesis · el ámbar es advisory y NO itera.
// 2ª capa · relevancia-al-gate: solo amerita ciclo lo que puede mover la fidelidad
// (ejes factual/posicionamiento → positioning · icp_summary). Lo estilístico jamás cicla.
const EJE_GATEADO = new Set(['factual', 'posicionamiento']);
const bloqueantes = corrections.filter((c) =>
  c.severidad === 'rojo' && EJE_GATEADO.has(c.eje) && c.cambio_sugerido.trim().length > 0);
// §7.3 · presupuesto top-N · el creador recibe foco, no un volcado de nitpicks.
const TOP_N = 5;
const bloqueantes_top = bloqueantes.slice(0, TOP_N);
const keepGoing = bloqueantes_top.length > 0;

// CC#2 F3 · cuenta respuestas PARSEABLES con la clave \`corrections\` presente (aunque venga
// vacía) · NO por longitud (un revisor sin hallazgos es legítimo) ni por ausencia de \`.error\`
// (un 401 con neverError puede devolver {message}/{detail}/HTML y colarse como OK).
const parseable = (it) => { try {
  const b = (it.json && it.json.body) || it.json || {};
  const t = typeof b.response === 'string' ? b.response : JSON.stringify(b);
  const m = t.match(/\\{[\\s\\S]*\\}/);
  return !!m && Array.isArray(JSON.parse(m[0]).corrections);
} catch (e) { return false; } };
const reviewers_ok = items.filter(parseable).length;`, 'A3-kg');

    const VIEJO_RET = `return [{ json: {
  brand_book_draft: draft,
  _grounding_refs: grounding,
  client_id: clientId,
  cycle,
  corrections,
  keep_going: keepGoing,
  _lazo_a: { cycle, max_cycles: MAX_CYCLES, corrections_count: corrections.length, keep_going: keepGoing },
} }];`;
    c = swap(c, VIEJO_RET, 
`return [{ json: {
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
} }];`, 'A3-ret');
    nd.parameters.jsCode = c;
    L('arreglo 3 · Merge: borrador del trigger + §7.3 (rojo/eje gateado/top-5) + reviewers_ok parseable ✅');
  }

  // ─────────── ARREGLO 4 · Re-síntesis → prep → HTTP → parse ───────────
  {
    const viejo = N(RESYN);
    const pos = viejo.position;
    // 4a · prep
    const prep = { parameters: { jsCode:
`// [BBA] Re-síntesis prep · arma el task · SIN llamadas (el fetch salía del Code · CC#2/CC#3).
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
  'campos nuevos · mantené la estructura. LLAMÁ EL TOOL \`emit_brand_section\` (pasá ' +
  'lens:"brand-strategist") con TODOS los campos mejorados (positioning, icp_summary, ' +
  'voice_description, forbidden_words[], required_terminology[], customer_angle, ' +
  'retention_notes). NO narres · usá el tool.\\n\\n' +
  'EVIDENCIA:\\n' + JSON.stringify(grounding).slice(0, 2500) + '\\n\\n' +
  'BORRADOR:\\n' + JSON.stringify(draft).slice(0, 2500) + '\\n\\n' +
  'CORRECCIONES:\\n' + JSON.stringify(correcciones)
).slice(0, 7900);

return [{ json: { task, brand_book_draft: draft, _grounding_refs: grounding, client_id: clientId,
  cycle: nextCycle, corrections: inp.corrections || [], _fidelity_cycle: inp._fidelity_cycle } }];` },
      type: 'n8n-nodes-base.code', typeVersion: 2, position: [pos[0], pos[1]], id: crypto.randomUUID(), name: PREP };

    // 4b · HTTP
    const run = { parameters: {
      method: 'POST',
      url: "={{ $env.ZERO_RISK_API_URL || 'https://zero-risk-platform.vercel.app' }}/api/agents/run-sdk",
      sendHeaders: true,
      headerParameters: { parameters: [
        { name: 'Content-Type', value: 'application/json' },
        { name: 'x-api-key', value: '={{ $env.INTERNAL_API_KEY }}' }] },
      sendBody: true, specifyBody: 'json',
      jsonBody: '={\n  "agent": "brand-strategist",\n  "client_id": "{{ $json.client_id }}",\n  "workflow_id": "{{ $execution.id }}",\n  "workflow_execution_id": "{{ $execution.id }}",\n  "task": {{ JSON.stringify($json.task) }},\n  "context": { "role": "brand_book_consolidator_resynth", "cycle": {{ $json.cycle }} }\n}',
      options: { response: { response: { neverError: true } }, timeout: 800000 },
    }, type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: [pos[0] + 220, pos[1]], id: crypto.randomUUID(), name: RUN };

    // 4c · parse
    const parse = { parameters: { jsCode:
`// [BBA] Re-síntesis parse · mezcla la sección mejorada · marca resynth_ok · propaga corrections
// (la telemetría estaba invertida: llegaban [] justo cuando SÍ se corrigió).
const body = ($json && $json.body) || $json || {};
const src = (() => { try { return $(' + '\\'' + '${PREP}' + '\\'' + ').first().json || {}; } catch (e) { return {}; } })();
const draft = src.brand_book_draft || {};
const clientId = src.client_id || draft.client_id;
let cand = body.brand_section || null;
if (!cand && typeof body.response === 'string') {
  const m = body.response.match(/\\{[\\s\\S]*\\}/);
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
} }];`.replace("$(' + '\\'' + '" + PREP + "' + '\\'' + ')", `$('${PREP}')`) },
      type: 'n8n-nodes-base.code', typeVersion: 2, position: [pos[0] + 440, pos[1]], id: crypto.randomUUID(), name: PARSE };

    w.nodes = w.nodes.filter((n) => n.name !== RESYN);
    w.nodes.push(prep, run, parse);
    delete w.connections[RESYN];
    w.connections[IFSEG].main[0] = [{ node: PREP, type: 'main', index: 0 }];
    w.connections[PREP] = { main: [[{ node: RUN, type: 'main', index: 0 }]] };
    w.connections[RUN] = { main: [[{ node: PARSE, type: 'main', index: 0 }]] };
    w.connections[PARSE] = { main: [[{ node: EXIT, type: 'main', index: 0 }]] };
    L('arreglo 4 · Re-síntesis → prep → HTTP → parse (fuera el fetch del Code) ✅');
  }

  // ─────────── ARREGLO 5 · Exit fail-closed ───────────
  {
    const nd = N(EXIT);
    nd.parameters.jsCode =
`// [BBA] Exit · borrador final · FAIL-CLOSED (2026-08-01).
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
} }];`;
    L('arreglo 5 · Exit → 3 pisos fail-closed ✅');
  }

  // ─────────── VERIFICACIÓN ───────────
  const nombres = new Set(w.nodes.map((n) => n.name));
  const colg = [];
  for (const [src, c] of Object.entries(w.connections)) {
    if (!nombres.has(src)) colg.push('origen: ' + src);
    (c.main || []).forEach((br, i) => (br || []).forEach((x) => { if (!nombres.has(x.node)) colg.push(`${src} main#${i} → ${x.node}`); }));
  }
  const hPost = huella(w.nodes.filter((n) => !TOCADOS.includes(n.name)));
  L('\n=== VERIFICACIÓN Lazo A ===');
  L(`V1 nodos                : ${pre.nodes.length} → ${w.nodes.length} (esperado 11) ${w.nodes.length === 11 ? '✅' : '❌'}`);
  L(`V5 aristas colgando     : ${colg.length} ${colg.length === 0 ? '✅' : '❌ ' + colg.join(' | ')}`);
  L(`V4 huella NO tocados    : ${hPost}`);
  L(`     ${hPre === hPost ? '✅ IDÉNTICA' : '❌ DISTINTA'}`);
  // V12 · sintaxis
  L('V12 sintaxis de los nodos Code:');
  let sintaxOk = true;
  for (const n of w.nodes.filter((x) => x.type === 'n8n-nodes-base.code')) {
    try { new vm.Script('(async()=>{' + n.parameters.jsCode + '})'); L(`     ✅ ${n.name}`); }
    catch (e) { L(`     ❌ ${n.name} → ${e.message}`); sintaxOk = false; }
  }
  const ok = w.nodes.length === 11 && colg.length === 0 && hPre === hPost && sintaxOk;
  L(`\n>>> VEREDICTO: ${ok ? '✅ VERDE' : '❌ ROJO'}`);
  fs.writeFileSync(new URL('./PAYLOAD-LazoA.json', DIR), JSON.stringify(w, null, 2));
  fs.writeFileSync(new URL('./VERIFICACION-LazoA.txt', DIR), rep.join('\n') + '\n');
  if (!ok) process.exit(1);
  if (process.argv[3] !== '--ejecutar') { L('\n(ensayo · sin PUT)'); return; }

  const settings = { ...pre.settings }; delete settings.availableInMCP; delete settings.binaryMode;
  const r = await fetch(`${B}/workflows/${ID}`, { method: 'PUT', headers: H,
    body: JSON.stringify({ name: w.name, nodes: w.nodes, connections: w.connections, settings }) });
  const j = await r.json();
  L(`\nPUT · HTTP ${r.status} · nodos ${j.nodes?.length} · versionId ${j.versionId} · active ${j.active}`);
  if (r.status !== 200) { L(JSON.stringify(j).slice(0, 400)); process.exit(1); }
  const vivo = await (await fetch(`${B}/workflows/${ID}`, { headers: H })).json();
  fs.writeFileSync(new URL('./POST-LazoA.json', DIR), JSON.stringify(vivo, null, 2));
  L(`vivo: ${vivo.nodes.length} nodos · huella NO tocados ${huella(vivo.nodes.filter((n) => !TOCADOS.includes(n.name)))} · active ${vivo.active}`);
  fs.writeFileSync(new URL('./VERIFICACION-LazoA.txt', DIR), rep.join('\n') + '\n');
})().catch((e) => { console.log('ABORT:', e.message); fs.writeFileSync(new URL('./VERIFICACION-LazoA.txt', DIR), rep.join('\n') + '\nABORT: ' + e.message + '\n'); process.exit(1); });
