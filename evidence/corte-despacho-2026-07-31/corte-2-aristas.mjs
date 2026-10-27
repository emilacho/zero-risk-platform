// CORTE DE 2 ARISTAS · despacho falso · $0 · reversible
// Compone LOCALMENTE, verifica, y recién entonces hace UN ÚNICO PUT con el payload COMPLETO.
// (Lección del incidente del 30-jul: nunca un payload recortado contra el proceso vivo.)
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

const ARISTAS = [
  { src: 'Validate Deal Data', out: 0, dst: 'Create Notion Client Workspace', id: 'A' },
  { src: '[APIFY-WIRE] IF · Camino III decision (PASS/REJECT)', out: 0, dst: 'Spell Check Pass (in-cascade)', id: 'B' },
];

const alcanzables = (w, desde) => {
  const byName = new Map(w.nodes.map((n) => [n.name, n]));
  const vis = new Set([desde]); const q = [desde];
  while (q.length) { const cur = q.pop(); const c = w.connections[cur]; if (!c) continue;
    for (const br of (c.main || [])) for (const x of (br || [])) {
      const nd = byName.get(x.node); if (!nd || vis.has(x.node) || nd.disabled) continue;
      vis.add(x.node); q.push(x.node);
    } }
  return vis;
};
const colgantes = (w) => {
  const nom = new Set(w.nodes.map((n) => n.name)); const out = [];
  for (const [src, c] of Object.entries(w.connections)) {
    if (!nom.has(src)) out.push('origen inexistente: ' + src);
    (c.main || []).forEach((br, i) => (br || []).forEach((x) => { if (!nom.has(x.node)) out.push(`${src} main#${i} → ${x.node}`); }));
  } return out;
};
const CAMINO_MANUAL = ['[JEFATURA] Load landscape_summary (canon)', '[JEFATURA] Transform discovery→package',
  '[JEFATURA] Execute Cimiento Track', 'IF track_pass (¿el cimiento pasó de verdad?)',
  '[MODELB] Emit · cimiento.promoted', '[MODELB] Emit · cimiento.failed (honesto)',
  'Stop and Error · cimiento no promovido', 'Call Onboarding Specialist: Auto-Discovery Dispatch (fire+forget)'];
const EXTERNOS = ['Create Notion Client Workspace', 'Create Success Plan in Notion', 'Schedule Kickoff Call (Cal.com)',
  'Alert Slack: Onboarding Initiated', 'Notify MC Inbox', 'AM Handoff → SALA event (am_handoff)',
  '[MODELB] Phase-boundary Emit · journey_completed', 'Trigger Master Journey ugK3'];

const rep = []; const L = (s) => { console.log(s); rep.push(s); };

(async () => {
  // ---------- 1 · baseline del vivo ----------
  const pre = await (await fetch(`${B}/workflows/${ID}`, { headers: H })).json();
  fs.writeFileSync(new URL('./BASELINE-pre-corte.json', DIR), JSON.stringify(pre, null, 2));
  L(`=== BASELINE (punto de retorno) ===`);
  L(`nodos ${pre.nodes.length} · conexiones ${Object.keys(pre.connections).length} · active ${pre.active} · versionId ${pre.versionId}`);
  if (pre.nodes.length !== 73) throw new Error('el vivo no tiene 73 nodos · ABORTO');
  if (pre.active !== false) throw new Error('el onboarding NO está pausado · ABORTO');

  const hPre = huella(pre.nodes);
  const alcPre = alcanzables(pre, 'Webhook: Deal Won');
  L(`huella de los 73: ${hPre}`);
  L(`alcanzables desde el disparador: ${alcPre.size}`);

  // ---------- 2 · componer el corte ----------
  const post = JSON.parse(JSON.stringify(pre));
  for (const a of ARISTAS) {
    const c = post.connections[a.src];
    if (!c) throw new Error(`no existe la clave ${a.src}`);
    const br = c.main[a.out] || [];
    if (!br.some((x) => x.node === a.dst)) throw new Error(`la arista ${a.id} ya no existe: ${a.src} main#${a.out} → ${a.dst}`);
    c.main[a.out] = br.filter((x) => x.node !== a.dst);
    L(`\ncorte ${a.id} · ${a.src} main#${a.out} ↛ ${a.dst}  (quedan ${c.main[a.out].length} destinos)`);
  }

  // ---------- 3 · verificación LOCAL ----------
  const hPost = huella(post.nodes);
  const alcPost = alcanzables(post, 'Webhook: Deal Won');
  const colg = colgantes(post);
  L(`\n=== VERIFICACIÓN LOCAL ===`);
  L(`V1 nodos            : ${post.nodes.length} (73) ${post.nodes.length === 73 ? '✅' : '❌'}`);
  L(`V2 claves conexiones: ${Object.keys(post.connections).length} (58) ${Object.keys(post.connections).length === 58 ? '✅' : '❌'}`);
  L(`V3 aristas colgando : ${colg.length} ${colg.length === 0 ? '✅' : '❌ ' + colg.join(' | ')}`);
  L(`V4 HUELLA de los 73 : ${hPost}`);
  L(`     ${hPre === hPost ? '✅ IDÉNTICA · NINGÚN nodo fue tocado' : '❌ DISTINTA · se tocó un nodo'}`);
  L(`V5 alcanzables      : ${alcPre.size} → ${alcPost.size}`);
  L(`V6 camino del MANUAL intacto:`);
  let manualOk = true;
  for (const n of CAMINO_MANUAL) { const ok = alcPost.has(n); if (!ok) manualOk = false; L(`     ${ok ? '✅' : '❌'} ${n}`); }
  L(`V7 efectos EXTERNOS frenados:`);
  let extOk = true;
  for (const n of EXTERNOS) { const frenado = !alcPost.has(n); if (!frenado) extOk = false; L(`     ${frenado ? '✅ frenado' : '❌ SIGUE CORRIENDO'} · ${n}`); }

  const ok = post.nodes.length === 73 && Object.keys(post.connections).length === 58 && colg.length === 0
    && hPre === hPost && manualOk && extOk;
  L(`\n>>> VEREDICTO LOCAL: ${ok ? '✅ VERDE' : '❌ ROJO · no se toca nada'}`);
  fs.writeFileSync(new URL('./PAYLOAD-post-corte.json', DIR), JSON.stringify(post, null, 2));
  if (!ok) { fs.writeFileSync(new URL('./VERIFICACION.txt', DIR), rep.join('\n')); process.exit(1); }

  if (process.argv[3] !== '--ejecutar') {
    L('\n(modo ensayo · no se hizo ningún PUT · agregá --ejecutar para aplicar)');
    fs.writeFileSync(new URL('./VERIFICACION.txt', DIR), rep.join('\n')); return;
  }

  // ---------- 4 · portón + PUT ÚNICO con payload COMPLETO ----------
  for (const s of ['waiting', 'running']) {
    const e = await (await fetch(`${B}/executions?status=${s}&limit=250`, { headers: H })).json();
    L(`portón · ${s}: ${e.data.length}`);
    if (e.data.length) throw new Error('PORTÓN ROJO · ejecuciones en vuelo · NO se toca');
  }
  const settings = { ...pre.settings };
  delete settings.availableInMCP; delete settings.binaryMode;   // el esquema público los rechaza
  const r = await fetch(`${B}/workflows/${ID}`, { method: 'PUT', headers: H,
    body: JSON.stringify({ name: post.name, nodes: post.nodes, connections: post.connections, settings }) });
  const j = await r.json();
  L(`\nPUT · HTTP ${r.status} · nodos ${j.nodes?.length} · conexiones ${Object.keys(j.connections || {}).length} · versionId ${j.versionId} · active ${j.active}`);
  if (r.status !== 200) { L(JSON.stringify(j).slice(0, 300)); process.exit(1); }

  // ---------- 5 · verificación contra el VIVO ----------
  const vivo = await (await fetch(`${B}/workflows/${ID}`, { headers: H })).json();
  fs.writeFileSync(new URL('./POST-corte-vivo.json', DIR), JSON.stringify(vivo, null, 2));
  const hVivo = huella(vivo.nodes); const alcVivo = alcanzables(vivo, 'Webhook: Deal Won');
  L(`\n=== VERIFICACIÓN CONTRA EL VIVO ===`);
  L(`nodos ${vivo.nodes.length} · conexiones ${Object.keys(vivo.connections).length} · active ${vivo.active} · versionId ${vivo.versionId}`);
  L(`huella: ${hVivo}`);
  L(`  ${hVivo === hPre ? '✅ IDÉNTICA al baseline · ningún nodo tocado' : '❌ DISTINTA'}`);
  L(`alcanzables: ${alcVivo.size}`);
  L(`aristas colgando: ${colgantes(vivo).length}`);
  L(`settings: ${JSON.stringify(vivo.settings)}`);
  const difS = Object.keys(pre.settings).filter((k) => JSON.stringify(pre.settings[k]) !== JSON.stringify(vivo.settings[k]));
  L(`settings vs baseline: ${difS.length ? difS.join(', ') : 'sin diferencias ✅'}`);
  L(`camino del manual   : ${CAMINO_MANUAL.every((n) => alcVivo.has(n)) ? '✅ intacto' : '❌ ROTO'}`);
  L(`efectos externos    : ${EXTERNOS.every((n) => !alcVivo.has(n)) ? '✅ todos frenados' : '❌ alguno sigue vivo'}`);
  L(`onboarding pausado  : ${vivo.active === false ? '✅' : '❌'}`);
  fs.writeFileSync(new URL('./VERIFICACION.txt', DIR), rep.join('\n') + '\n');
})().catch((e) => { console.log('ABORT:', e.message); fs.writeFileSync(new URL('./VERIFICACION.txt', DIR), rep.join('\n') + '\nABORT: ' + e.message + '\n'); process.exit(1); });
