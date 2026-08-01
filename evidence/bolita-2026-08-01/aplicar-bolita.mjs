// BOLITA DE JUGUETE v2 · apagar los 9 pagos + las 3 líneas TOY · $0
// uso: node aplicar-bolita.mjs <.env> [--ejecutar] [--variante=B]
import fs from 'node:fs';
import crypto from 'node:crypto';
import vm from 'node:vm';
const DIR = new URL('./', import.meta.url);
const env = Object.fromEntries(
  fs.readFileSync(process.argv[2], 'utf8').split(/\r?\n/).filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
const B = env.N8N_BASE_URL + '/api/v1', H = { 'X-N8N-API-KEY': env.N8N_API_KEY, 'Content-Type': 'application/json' };
const VAR_B = process.argv.includes('--variante=B');
const rep = []; const L = (s) => { console.log(s); rep.push(s); };
const rx = (s) => new RegExp(s.split('\n').map((l) => l.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\r?\\n'));
const swap = (c, v, n, et) => { const re = rx(v); if (!re.test(c)) throw new Error(et + ' · no encuentro: ' + v.slice(0, 60)); return c.replace(re, () => n); };

const APAGAR_SS = ['Lente · brand-strategist', 'Lente · editor-en-jefe', 'Lente · jefe-client-success',
  '[BB] Judge · run-sdk', '[BB] Promote → canon'];
const APAGAR_LA = ['Revisor · brand-strategist', 'Revisor · editor-en-jefe', 'Revisor · jefe-client-success',
  '[BBA] Re-síntesis · run-sdk'];

(async () => {
  const ss = JSON.parse(fs.readFileSync(new URL('./BASELINE-ssLtw.json', DIR), 'utf8'));
  const la = JSON.parse(fs.readFileSync(new URL('./BASELINE-LazoA.json', DIR), 'utf8'));
  L(`=== BOLITA v2 · variante ${VAR_B ? 'B (TOY_PASS_ON_2=true)' : 'A'} ===`);

  // ── apagar los 9 ──
  let n = 0;
  for (const [w, lista, al] of [[ss, APAGAR_SS, 'ssLtw'], [la, APAGAR_LA, 'LazoA']])
    for (const nom of lista) {
      const nd = w.nodes.find((x) => x.name === nom);
      if (!nd) throw new Error('falta ' + nom);
      if (nd.type !== 'n8n-nodes-base.httpRequest') throw new Error(nom + ' no es httpRequest');
      nd.disabled = true; n++;
      L(`  apagado · ${al} · ${nom}`);
    }
  L(`  >>> ${n} nodos apagados (esperado 9) ${n === 9 ? '✅' : '❌'}`);

  // ── T1 · Merge corrections ──
  {
    const nd = la.nodes.find((x) => x.name === '[BBA] Merge corrections');
    let c = nd.parameters.jsCode;
    c = swap(c, 'const keepGoing = bloqueantes_top.length > 0;',
`// ⚠️⚠️ TEMPORAL · BOLITA DE JUGUETE 2026-08-01 · QUITAR ANTES DE CUALQUIER CORRIDA PAGA ⚠️⚠️
const TOY_MODE = true;   // fuerza la rama de re-síntesis sin revisores reales
const keepGoing = bloqueantes_top.length > 0;
const keepGoingFinal = TOY_MODE ? true : keepGoing;`, 'T1-const');
    c = swap(c, '  keep_going: keepGoing,\n  reviewers_ok,', '  keep_going: keepGoingFinal,   // ← el que RUTEA (juguete)\n  reviewers_ok,', 'T1-ruteo');
    c = swap(c, 'keep_going: keepGoing, reviewers_ok },', 'keep_going: keepGoing, toy_forced: TOY_MODE, reviewers_ok },', 'T1-telemetria');
    nd.parameters.jsCode = c;
    L('  T1 · Merge: keep_going ruteado + _lazo_a con el valor REAL + toy_forced ✅');
  }

  // ── T2/T3 · Faithfulness judge ──
  {
    const nd = ss.nodes.find((x) => x.name === '[BB] Faithfulness judge');
    let c = nd.parameters.jsCode;
    c = swap(c, 'const pass = lowFields.length === 0;',
`// ⚠️⚠️ TEMPORAL · BOLITA DE JUGUETE · QUITAR ANTES DE CUALQUIER CORRIDA PAGA ⚠️⚠️
const TOY_PASS_ON_2 = ${VAR_B};   // variante B: true · abre el PASS tras corrección
const pass = lowFields.length === 0;
const passFinal = (TOY_PASS_ON_2 && fidelityCycle >= 2) ? true : pass;`, 'T2-const');
    c = swap(c, 'const no_progress = !pass && fidelityCycle > 1 && !improved;',
      'const no_progress = !passFinal && fidelityCycle > 1 && !improved;', 'T2-noprog');
    c = swap(c, '    pass,', '    pass: passFinal,', 'T3-fidelity');
    c = swap(c, 'exhausted: !pass && fidelityCycle >= MAX_FIDELITY_CYCLES,',
      'exhausted: !passFinal && fidelityCycle >= MAX_FIDELITY_CYCLES,', 'T3-exhausted');
    nd.parameters.jsCode = c;
    L(`  T2/T3 · juez: TOY_PASS_ON_2=${VAR_B} + passFinal en los 3 usos ✅`);
  }

  // ── V12 sintaxis + V-pre ──
  let sx = true;
  for (const [al, w] of [['ssLtw', ss], ['LazoA', la]]) for (const x of w.nodes.filter((y) => y.type === 'n8n-nodes-base.code')) {
    try { new vm.Script('(async()=>{' + x.parameters.jsCode + '\n})'); } catch (e) { L(`  ❌ sintaxis ${al}/${x.name}: ${e.message}`); sx = false; }
  }
  const hab = [...ss.nodes, ...la.nodes].filter((x) => x.type === 'n8n-nodes-base.httpRequest' && !x.disabled);
  L(`\nV12 sintaxis: ${sx ? '✅' : '❌'}`);
  L(`V-pre httpRequest HABILITADOS: ${hab.length} ${hab.length === 0 ? '✅ CERO · $0 por construcción' : '🔴 ' + hab.map((x) => x.name).join(', ')}`);
  const ok = sx && hab.length === 0 && n === 9;
  L(`>>> ${ok ? '✅ VERDE' : '❌ ROJO'}`);
  fs.writeFileSync(new URL(`./PAYLOAD-toy-${VAR_B ? 'B' : 'A'}-ssLtw.json`, DIR), JSON.stringify(ss, null, 2));
  fs.writeFileSync(new URL(`./PAYLOAD-toy-${VAR_B ? 'B' : 'A'}-LazoA.json`, DIR), JSON.stringify(la, null, 2));
  if (!ok) process.exit(1);
  if (!process.argv.includes('--ejecutar')) { L('\n(ensayo · sin PUT)'); fs.writeFileSync(new URL('./VERIF-aplicar.txt', DIR), rep.join('\n')); return; }

  for (const [id, w, al] of [['ssLtwYPt7zxuvnM2', ss, 'ssLtw'], ['kSSAvCbEfHs2Hoa0', la, 'LazoA']]) {
    const st = { ...w.settings }; delete st.availableInMCP; delete st.binaryMode;
    const r = await fetch(`${B}/workflows/${id}`, { method: 'PUT', headers: H,
      body: JSON.stringify({ name: w.name, nodes: w.nodes, connections: w.connections, settings: st }) });
    const j = await r.json();
    L(`PUT ${al} · HTTP ${r.status} · versionId ${j.versionId}`);
    if (r.status !== 200) { L(JSON.stringify(j).slice(0, 300)); process.exit(1); }
  }
  // V-pre contra el VIVO
  const v1 = await (await fetch(`${B}/workflows/ssLtwYPt7zxuvnM2`, { headers: H })).json();
  const v2 = await (await fetch(`${B}/workflows/kSSAvCbEfHs2Hoa0`, { headers: H })).json();
  const habV = [...v1.nodes, ...v2.nodes].filter((x) => x.type === 'n8n-nodes-base.httpRequest' && !x.disabled);
  L(`V-pre CONTRA EL VIVO · httpRequest habilitados: ${habV.length} ${habV.length === 0 ? '✅' : '🔴'}`);
  fs.writeFileSync(new URL('./VERIF-aplicar.txt', DIR), rep.join('\n') + '\n');
})().catch((e) => { console.log('ABORT:', e.message); process.exit(1); });
