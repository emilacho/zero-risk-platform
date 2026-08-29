// 3 ARREGLOS · entrada del onboarding + quitar el Wait vestigial · $0 · reversible
// Ensayo por defecto. Con --ejecutar: portón + UN ÚNICO PUT con el payload COMPLETO.
import fs from 'node:fs';
import crypto from 'node:crypto';

const DIR = new URL('./', import.meta.url);
const env = Object.fromEntries(
  fs.readFileSync(process.argv[2], 'utf8').split(/\r?\n/).filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
const B = env.N8N_BASE_URL + '/api/v1';
const H = { 'X-N8N-API-KEY': env.N8N_API_KEY, 'Content-Type': 'application/json' };
const ID = 'LyVoKcrypS5uLyuu';

const CAMPOS = ['name', 'parameters', 'onError', 'retryOnFail', 'typeVersion', 'webhookId'];
const ordenar = (o) => Array.isArray(o) ? o.map(ordenar)
  : (o && typeof o === 'object' ? Object.fromEntries(Object.keys(o).sort().map((k) => [k, ordenar(o[k])])) : o);
const huella = (ns) => crypto.createHash('sha256').update(JSON.stringify(
  [...ns].sort((a, b) => a.name.localeCompare(b.name))
    .map((n) => ordenar(Object.fromEntries(CAMPOS.map((k) => [k, n[k] === undefined ? null : n[k]])))))).digest('hex');

const GUARD = '[MODELB] Dispatch-único Guard · scoped al run';
const VALID = 'Validate Deal Data';
const SYNTH = 'Synthesis Staging · build package';
const HITL = '[APIFY-WIRE] POST /api/hitl/queue (canon)';
const EDITADOS = [GUARD, VALID];

const rep = []; const L = (s) => { console.log(s); rep.push(s); };
const sal = (w, n) => { const c = w.connections[n]; return c ? (c.main || []).flatMap((br) => (br || []).map((x) => x.node)) : []; };
const alc = (w, d) => { const by = new Map(w.nodes.map((n) => [n.name, n]));
  const v = new Set([d]); const q = [d];
  while (q.length) { const c = q.pop(); for (const t of sal(w, c)) { const nd = by.get(t); if (!nd || v.has(t) || nd.disabled) continue; v.add(t); q.push(t); } } return v; };
const colg = (w) => { const nom = new Set(w.nodes.map((n) => n.name)); const o = [];
  for (const [src, c] of Object.entries(w.connections)) { if (!nom.has(src)) o.push('origen: ' + src);
    (c.main || []).forEach((br, i) => (br || []).forEach((x) => { if (!nom.has(x.node)) o.push(`${src} main#${i} → ${x.node}`); })); } return o; };

const MANUAL = ['[JEFATURA] Load landscape_summary (canon)', '[JEFATURA] Transform discovery→package',
  '[JEFATURA] Execute Cimiento Track', 'IF track_pass (¿el cimiento pasó de verdad?)',
  '[MODELB] Emit · cimiento.promoted', '[MODELB] Emit · cimiento.failed (honesto)', 'Stop and Error · cimiento no promovido',
  'Call Onboarding Specialist: Auto-Discovery Dispatch (fire+forget)'];
const EXTERNOS = ['Create Notion Client Workspace', 'Create Success Plan in Notion', 'Schedule Kickoff Call (Cal.com)',
  'Alert Slack: Onboarding Initiated', 'Notify MC Inbox', 'AM Handoff → SALA event (am_handoff)',
  '[MODELB] Phase-boundary Emit · journey_completed', 'Trigger Master Journey ugK3'];
const RAMA_WAIT = [HITL, 'Wait · Camino III decision', '[APIFY-WIRE] IF · Camino III decision (PASS/REJECT)', 'Onboarding rejected · Camino III'];

(async () => {
  const pre = await (await fetch(`${B}/workflows/${ID}`, { headers: H })).json();
  fs.writeFileSync(new URL('./BASELINE-pre-3-arreglos.json', DIR), JSON.stringify(pre, null, 2));
  L('=== BASELINE (punto de retorno) ===');
  L(`nodos ${pre.nodes.length} · conexiones ${Object.keys(pre.connections).length} · active ${pre.active} · versionId ${pre.versionId}`);
  if (pre.nodes.length !== 73) throw new Error('no son 73 nodos · ABORTO');
  if (pre.active !== false) throw new Error('el onboarding NO está pausado · ABORTO');
  const hPre71 = huella(pre.nodes.filter((n) => !EDITADOS.includes(n.name)));
  L(`huella de los 71 NO editados: ${hPre71}`);
  L(`alcanzables hoy: ${alc(pre, 'Webhook: Deal Won').size}`);

  const post = JSON.parse(JSON.stringify(pre));
  const N = (n) => { const x = post.nodes.find((y) => y.name === n); if (!x) throw new Error('falta ' + n); return x; };

  // ---------------- ARREGLO 1 · el guardia mintea ----------------
  {
    const nd = N(GUARD);
    // el encabezado describía el comportamiento VIEJO ("Rechaza runs…") · dejarlo sería
    // el mismo comentario mentiroso que reporté como falla (red-team 01-ago · F4).
    const CAB = '// Rechaza runs que no vengan via sala dispatch.';
    if (!nd.parameters.jsCode.includes(CAB)) throw new Error('A1 · no encuentro el encabezado viejo');
    nd.parameters.jsCode = nd.parameters.jsCode.replace(CAB,
      '// Normaliza la entrada del run · si faltan los IDs de correlación de la sala, los MINTEA.\n' +
      '// (2026-08-01 · antes RECHAZABA · el encabezado se actualiza con el comportamiento.)');
    const VIEJO = `if (!body._sala_correlation_id || !body._journey_id) {`;
    if (!nd.parameters.jsCode.includes(VIEJO)) throw new Error('A1 · no encuentro el bloque del rechazo');
    const desde = nd.parameters.jsCode.indexOf(VIEJO);
    const nuevo = nd.parameters.jsCode.slice(0, desde) +
`// 2026-08-01 · el guardia YA NO RECHAZA por identificadores de rastreo faltantes: los MINTEA.
// Son IDs de correlación, no credenciales — rechazar por ellos frenaba altas legítimas
// en el segundo nodo de la corrida, antes de intentar nada.
//
// Por qué UUID PELADO (sin prefijo tipo 'jrn-'): estos 2 campos los consumen HOY 12 nodos
// vivos del camino — los 6 emisores de fase (\`reconciliación OBSERVE\`, \`onboarding_specialist_done\`,
// \`cliente_persisted\`, \`APIFY_WIRE\`, \`cimiento.promoted\`, \`cimiento.failed\`), el despacho del
// descubrimiento, el Discovery Parser, \`Synthesis Staging\` y \`[JEFATURA] Transform\`. Todos los
// mandan a /api/sala/ingress como identidad del journey; un prefijo los volvería un formato
// propio que ningún consumidor espera. Se usa el MISMO idioma de UUID v4 que ya genera
// \`Validate Deal Data\` para el client_id (Math.random · sin dependencias).
const uuid = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
  const r = Math.random() * 16 | 0;
  const v = c === 'x' ? r : (r & 0x3 | 0x8);
  return v.toString(16);
});
const _ids_minted = [];
if (!body._sala_correlation_id) { body._sala_correlation_id = uuid(); _ids_minted.push('_sala_correlation_id'); }
if (!body._journey_id)          { body._journey_id          = uuid(); _ids_minted.push('_journey_id'); }

// Pasa el body completo · _ids_minted deja en la traza si el alta vino sin correlación.
return [{ json: { ...body, _modelb_guard: _ids_minted.length ? 'passed_minted' : 'passed', _ids_minted } }];
`;
    nd.parameters.jsCode = nuevo;
    L('\narreglo 1 · guardia: rechazo → minteo ✅');
  }

  // ---------------- ARREGLO 2 · Validate acepta el mínimo ----------------
  {
    const nd = N(VALID);
    const VIEJO = `const missing = [];
if (!b.client_name) missing.push('client_name');
if (!b.industry) missing.push('industry');
if (!b.contract_scope) missing.push('contract_scope');
if (missing.length) {
  throw new Error(\`Missing required fields: \${missing.join(', ')}\`);
}`;
    if (!nd.parameters.jsCode.includes(VIEJO)) throw new Error('A2 · no encuentro el bloque de obligatorios');
    nd.parameters.jsCode = nd.parameters.jsCode.replace(VIEJO,
`// 2026-08-01 · el alta se acepta CON LO QUE VENGA. El único mínimo real es el NOMBRE
// del cliente: sin él no hay a quién describir ni qué descubrir.
//
// Caveat asumido (firmado): con poca señal el manual va a salir pobre o el juez no va a
// pasar. Está BIEN — el workflow ACEPTA y CORRE, y si no alcanza FALLA HONESTO
// (juez < 0.85 → cimiento.failed → Stop and Error). No se rechaza en la puerta ni se
// finge un manual bueno. El punto de fallo se MUEVE, no desaparece: un alta mínima
// llega más lejos y gasta más antes de fallar.
if (!b.client_name || !String(b.client_name).trim()) {
  throw new Error(
    'ONBOARDING_SIN_NOMBRE · el alta se acepta con lo mínimo, pero el nombre del ' +
    'cliente es imprescindible (no hay a quién describir ni qué descubrir).'
  );
}
// Defaults NO VACÍOS a propósito · el productor (ssLtw · Validate Deal Data) exige
// \`industry\` con truthiness y LANZA si viene vacío: con null el rechazo no
// desaparecería, se mudaría al sub-proceso (más adentro y más caro).
// Centinela 'unknown' (M3 red-team): valor único, en inglés como el resto de las claves,
// legible por máquina y distinguible de un dato real.
const _defaults_aplicados = [];
if (!b.industry)       { b.industry = 'unknown';       _defaults_aplicados.push('industry'); }
if (!b.contract_scope) { b.contract_scope = 'unknown'; _defaults_aplicados.push('contract_scope'); }
b._defaults_aplicados = _defaults_aplicados;`);
    L('arreglo 2 · Validate: obligatorios → mínimo + defaults "unknown" ✅');
  }

  // ---------------- ARREGLO 3 · quitar la arista del Wait ----------------
  {
    const br = post.connections[SYNTH].main[0];
    const idx = br.findIndex((x) => x.node === HITL);
    if (idx !== 0) throw new Error(`A3 · la arista del Wait no está en índice 0 (está en ${idx}) · revisar antes de tocar`);
    post.connections[SYNTH].main[0] = br.filter((x) => x.node !== HITL);
    L(`arreglo 3 · arista quitada de índice ${idx} · destinos de Synthesis Staging: ${br.length} → ${post.connections[SYNTH].main[0].length} ✅`);
    L(`             REVERSIÓN N3: re-insertar { node: '${HITL}', type: 'main', index: 0 } en el ÍNDICE 0 del arreglo`);
  }

  // ---------------- VERIFICACIÓN LOCAL ----------------
  const hPost71 = huella(post.nodes.filter((n) => !EDITADOS.includes(n.name)));
  const A = alc(post, 'Webhook: Deal Won');
  const c = colg(post);
  L('\n=== VERIFICACIÓN ===');
  L(`V1 nodos                 : ${post.nodes.length} (73) ${post.nodes.length === 73 ? '✅' : '❌'}`);
  L(`V2 claves conexiones     : ${Object.keys(post.connections).length} (58) ${Object.keys(post.connections).length === 58 ? '✅' : '❌'}`);
  L(`V3 aristas colgando      : ${c.length} ${c.length === 0 ? '✅' : '❌ ' + c.join(' | ')}`);
  L(`V4 huella de los 71      : ${hPost71}`);
  L(`     ${hPre71 === hPost71 ? '✅ IDÉNTICA · solo se tocaron los 2 declarados' : '❌ DISTINTA'}`);
  L(`V5 nodos editados        : ${EDITADOS.join(' · ')} (2, declarados)`);
  L(`V6 alcanzables           : ${A.size} (esperado 49) ${A.size === 49 ? '✅' : '❌'}`);
  L(`V7 rama del Wait fuera   : ${RAMA_WAIT.every((n) => !A.has(n)) ? '✅ los 4 inalcanzables' : '❌'}`);
  L(`V8 camino del manual     : ${MANUAL.every((n) => A.has(n)) ? '✅ intacto' : '❌ ROTO'}`);
  L(`V9 efectos externos      : ${EXTERNOS.every((n) => !A.has(n)) ? '✅ siguen frenados' : '❌ FUGA'}`);
  const ok = post.nodes.length === 73 && Object.keys(post.connections).length === 58 && c.length === 0
    && hPre71 === hPost71 && A.size === 49 && RAMA_WAIT.every((n) => !A.has(n))
    && MANUAL.every((n) => A.has(n)) && EXTERNOS.every((n) => !A.has(n));
  L(`\n>>> VEREDICTO LOCAL: ${ok ? '✅ VERDE' : '❌ ROJO · no se toca nada'}`);
  fs.writeFileSync(new URL('./PAYLOAD-post-3-arreglos.json', DIR), JSON.stringify(post, null, 2));
  if (!ok) { fs.writeFileSync(new URL('./VERIFICACION.txt', DIR), rep.join('\n')); process.exit(1); }

  if (process.argv[3] !== '--ejecutar') { L('\n(ensayo · sin PUT · agregá --ejecutar)'); fs.writeFileSync(new URL('./VERIFICACION.txt', DIR), rep.join('\n')); return; }

  for (const s of ['waiting', 'running']) {
    const e = await (await fetch(`${B}/executions?status=${s}&limit=250`, { headers: H })).json();
    L(`portón · ${s}: ${e.data.length}`);
    if (e.data.length) throw new Error('PORTÓN ROJO · ejecuciones en vuelo');
  }
  const settings = { ...pre.settings }; delete settings.availableInMCP; delete settings.binaryMode;
  const r = await fetch(`${B}/workflows/${ID}`, { method: 'PUT', headers: H,
    body: JSON.stringify({ name: post.name, nodes: post.nodes, connections: post.connections, settings }) });
  const j = await r.json();
  L(`\nPUT · HTTP ${r.status} · nodos ${j.nodes?.length} · conexiones ${Object.keys(j.connections || {}).length} · versionId ${j.versionId} · active ${j.active}`);
  if (r.status !== 200) { L(JSON.stringify(j).slice(0, 300)); process.exit(1); }

  const vivo = await (await fetch(`${B}/workflows/${ID}`, { headers: H })).json();
  fs.writeFileSync(new URL('./POST-vivo.json', DIR), JSON.stringify(vivo, null, 2));
  const Av = alc(vivo, 'Webhook: Deal Won');
  L('\n=== CONTRA EL VIVO ===');
  L(`nodos ${vivo.nodes.length} · conexiones ${Object.keys(vivo.connections).length} · active ${vivo.active} · versionId ${vivo.versionId}`);
  L(`huella de los 71: ${huella(vivo.nodes.filter((n) => !EDITADOS.includes(n.name)))}`);
  L(`  ${huella(vivo.nodes.filter((n) => !EDITADOS.includes(n.name))) === hPre71 ? '✅ IDÉNTICA al baseline' : '❌ DISTINTA'}`);
  L(`alcanzables ${Av.size} · aristas colgando ${colg(vivo).length}`);
  L(`camino del manual ${MANUAL.every((n) => Av.has(n)) ? '✅' : '❌'} · externos ${EXTERNOS.every((n) => !Av.has(n)) ? '✅ frenados' : '❌'} · rama Wait ${RAMA_WAIT.every((n) => !Av.has(n)) ? '✅ fuera' : '❌'}`);
  const difS = Object.keys(pre.settings).filter((k) => JSON.stringify(pre.settings[k]) !== JSON.stringify(vivo.settings[k]));
  L(`settings vs baseline: ${difS.length ? difS.join(', ') : 'sin diferencias ✅'} · pausado ${vivo.active === false ? '✅' : '❌'}`);
  fs.writeFileSync(new URL('./VERIFICACION.txt', DIR), rep.join('\n') + '\n');
})().catch((e) => { console.log('ABORT:', e.message); fs.writeFileSync(new URL('./VERIFICACION.txt', DIR), rep.join('\n') + '\nABORT: ' + e.message + '\n'); process.exit(1); });
