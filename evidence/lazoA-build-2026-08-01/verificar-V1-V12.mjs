import fs from 'node:fs';
import crypto from 'node:crypto';
import vm from 'node:vm';
const DIR = new URL('./', import.meta.url);
const env = Object.fromEntries(
  fs.readFileSync(process.argv[2], 'utf8').split(/\r?\n/).filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
const B = env.N8N_BASE_URL + '/api/v1', H = { 'X-N8N-API-KEY': env.N8N_API_KEY };
const CAMPOS = ['name', 'parameters', 'onError', 'retryOnFail', 'typeVersion', 'webhookId'];
const ordenar = (o) => Array.isArray(o) ? o.map(ordenar)
  : (o && typeof o === 'object' ? Object.fromEntries(Object.keys(o).sort().map((k) => [k, ordenar(o[k])])) : o);
const huella = (ns) => crypto.createHash('sha256').update(JSON.stringify([...ns].sort((a, b) => a.name.localeCompare(b.name))
  .map((n) => ordenar(Object.fromEntries(CAMPOS.map((k) => [k, n[k] === undefined ? null : n[k]])))))).digest('hex');
const out = []; const L = (s) => { console.log(s); out.push(s); };
const colg = (w) => { const nom = new Set(w.nodes.map((n) => n.name)); const o = [];
  for (const [s, c] of Object.entries(w.connections)) { if (!nom.has(s)) o.push('origen ' + s);
    (c.main || []).forEach((br, i) => (br || []).forEach((x) => { if (!nom.has(x.node)) o.push(`${s} main#${i} → ${x.node}`); })); } return o; };
const sal = (w, n) => { const c = w.connections[n]; return c ? (c.main || []).flatMap((br) => (br || []).map((x) => x.node)) : []; };
const alc = (w, d) => { const by = new Map(w.nodes.map((n) => [n.name, n])); const v = new Set([d]); const q = [d];
  while (q.length) { const c = q.pop(); for (const t of sal(w, c)) { const nd = by.get(t); if (!nd || v.has(t) || nd.disabled) continue; v.add(t); q.push(t); } } return v; };

const TOC_LA = ['[BBA] Review prep', '[BBA] Merge corrections', '[BBA] Re-síntesis', '[BBA] Exit · borrador final',
  'Revisor · brand-strategist', 'Revisor · editor-en-jefe', 'Revisor · jefe-client-success',
  '[BBA] Re-síntesis prep', '[BBA] Re-síntesis · run-sdk', '[BBA] Re-síntesis parse'];
const TOC_SS = ['[BB] IF · ciclos agotados', '[BB] Faithfulness judge', 'Return scores a parent (grade-cimiento gate)',
  '[BB] Lazo A prep', '[BB] Execute Lazo A corrección'];

(async () => {
  const g = async (id) => (await (await fetch(`${B}/workflows/${id}`, { headers: H })).json());
  const la = await g('kSSAvCbEfHs2Hoa0'), ss = await g('ssLtwYPt7zxuvnM2'), ly = await g('LyVoKcrypS5uLyuu');
  const bLa = JSON.parse(fs.readFileSync(new URL('./BASELINE-LazoA.json', DIR), 'utf8'));
  const bSs = JSON.parse(fs.readFileSync(new URL('./BASELINE-ssLtw.json', DIR), 'utf8'));

  L('════ VERIFICACIÓN V1-V12 · contra el VIVO ════\n');
  L(`V1  Lazo A nodos          : ${la.nodes.length} (esperado 11) ${la.nodes.length === 11 ? '✅' : '❌'}`);
  L(`V2  ssLtw nodos           : ${ss.nodes.length} (esperado 22) ${ss.nodes.length === 22 ? '✅' : '❌'}`);
  L(`V3  LyVoK nodos/conexiones: ${ly.nodes.length}/${Object.keys(ly.connections).length} (73/58 · sin cambios) ${ly.nodes.length === 73 && Object.keys(ly.connections).length === 58 ? '✅' : '❌'}`);
  const h1p = huella(bLa.nodes.filter((n) => !TOC_LA.includes(n.name))), h1 = huella(la.nodes.filter((n) => !TOC_LA.includes(n.name)));
  const h2p = huella(bSs.nodes.filter((n) => !TOC_SS.includes(n.name))), h2 = huella(ss.nodes.filter((n) => !TOC_SS.includes(n.name)));
  L(`V4  huella NO editados    : Lazo A ${h1p === h1 ? '✅ idéntica' : '❌'} · ssLtw ${h2p === h2 ? '✅ idéntica' : '❌'}`);
  L(`       Lazo A: ${h1}`);
  L(`       ssLtw : ${h2}`);
  L(`V5  aristas colgando      : LazoA ${colg(la).length} · ssLtw ${colg(ss).length} · LyVoK ${colg(ly).length} ${colg(la).length + colg(ss).length + colg(ly).length === 0 ? '✅' : '❌'}`);
  const vieja = (ss.connections['[BB] IF · ciclos agotados'].main[1] || []).some((x) => x.node === '[BB] Consolidador');
  L(`V6  arista vieja out#1→Consolidador ELIMINADA: ${!vieja ? '✅' : '❌ SIGUE'}`);
  const intactos = ['[BB] Judge prep', '[BB] Consolidador', 'Lente · brand-strategist', 'Lente · editor-en-jefe',
    'Lente · jefe-client-success', '[BB] Promote prep', '[BB] Promote → canon'];
  const igual = intactos.every((n) => JSON.stringify(bSs.nodes.find((x) => x.name === n)) === JSON.stringify(ss.nodes.find((x) => x.name === n)));
  L(`V7  Judge prep · Consolidador · 3 lentes · Promote prep/canon SIN TOCAR: ${igual ? '✅' : '❌'}`);
  L(`V8  umbral del IF         : ${JSON.stringify(ss.nodes.find((n) => n.name === '[BB] IF · ciclos agotados').parameters).includes('>= 2') ? '✅ >= 2' : '❌'}`);
  L(`V9  MAX_FIDELITY_CYCLES   : ${ss.nodes.find((n) => n.name === '[BB] Faithfulness judge').parameters.jsCode.includes('MAX_FIDELITY_CYCLES = 2') ? '✅ 2' : '❌'}`);
  L(`V10 active (los tres)     : LazoA ${la.active} · ssLtw ${ss.active} · LyVoK ${ly.active} ${[la, ss, ly].every((w) => w.active === false) ? '✅ pausados' : '❌'}`);
  const A = alc(ly, 'Webhook: Deal Won');
  const MANUAL = ['[JEFATURA] Execute Cimiento Track', 'IF track_pass (¿el cimiento pasó de verdad?)', '[MODELB] Emit · cimiento.promoted'];
  const Ass = alc(ss, 'Execute Workflow Trigger (productivo · CC#3 F2.2)');
  L(`V11 camino del manual     : LyVoK ${MANUAL.every((n) => A.has(n)) ? '✅' : '❌'} (alcanzables ${A.size}) · ssLtw ciclo alcanzable ${['[BB] Lazo A prep', '[BB] Execute Lazo A corrección'].every((n) => Ass.has(n)) ? '✅' : '❌'} (${Ass.size}/${ss.nodes.length})`);
  let sx = true;
  for (const [al, w] of [['LazoA', la], ['ssLtw', ss]]) for (const n of w.nodes.filter((x) => x.type === 'n8n-nodes-base.code')) {
    try { new vm.Script('(async()=>{' + n.parameters.jsCode + String.fromCharCode(10) + '})'); } catch (e) { L(`V12 ❌ ${al} · ${n.name} → ${e.message}`); sx = false; }
  }
  L(`V12 sintaxis de TODOS los nodos Code de los 2 workflows: ${sx ? '✅ compilan' : '❌'}`);
  L(`\n════ CICLO COMPLETO (vivo) ════`);
  for (const n of ['[BB] IF · ciclos agotados', '[BB] Lazo A prep', '[BB] Execute Lazo A corrección']) {
    const c = ss.connections[n]; (c.main || []).forEach((br, i) => L(`  ${n} main#${i} → ${(br || []).map((x) => x.node).join(', ') || '(vacío)'}`));
  }
  fs.writeFileSync(new URL('./VERIFICACION-V1-V12.txt', DIR), out.join('\n') + '\n');
})();
