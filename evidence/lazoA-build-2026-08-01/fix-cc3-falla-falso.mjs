// 2 arreglos $0 cazados por CC#3 · 🔴 falla-falso en Return scores · 🟡 reviewers_ok
import fs from 'node:fs';
import crypto from 'node:crypto';
import vm from 'node:vm';
const DIR = new URL('./', import.meta.url);
const env = Object.fromEntries(
  fs.readFileSync(process.argv[2], 'utf8').split(/\r?\n/).filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
const B = env.N8N_BASE_URL + '/api/v1', H = { 'X-N8N-API-KEY': env.N8N_API_KEY, 'Content-Type': 'application/json' };
const CAMPOS = ['name', 'parameters', 'onError', 'retryOnFail', 'typeVersion', 'webhookId'];
const ordenar = (o) => Array.isArray(o) ? o.map(ordenar)
  : (o && typeof o === 'object' ? Object.fromEntries(Object.keys(o).sort().map((k) => [k, ordenar(o[k])])) : o);
const huella = (ns) => crypto.createHash('sha256').update(JSON.stringify([...ns].sort((a, b) => a.name.localeCompare(b.name))
  .map((n) => ordenar(Object.fromEntries(CAMPOS.map((k) => [k, n[k] === undefined ? null : n[k]])))))).digest('hex');
const rep = []; const L = (s) => { console.log(s); rep.push(s); };
const rx = (s) => new RegExp(s.split('\n').map((l) => l.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\r?\\n'));
const swap = (c, v, n, et) => { const re = rx(v); if (!re.test(c)) throw new Error(et + ' · no encuentro el bloque'); return c.replace(re, () => n); };

const RET = 'Return scores a parent (grade-cimiento gate)';
const PREP = '[BBA] Re-síntesis prep', PARSE = '[BBA] Re-síntesis parse';

(async () => {
  const ss = await (await fetch(`${B}/workflows/ssLtwYPt7zxuvnM2`, { headers: H })).json();
  const la = await (await fetch(`${B}/workflows/kSSAvCbEfHs2Hoa0`, { headers: H })).json();
  fs.writeFileSync(new URL('./PRE-fix-ssLtw.json', DIR), JSON.stringify(ss, null, 2));
  fs.writeFileSync(new URL('./PRE-fix-LazoA.json', DIR), JSON.stringify(la, null, 2));
  L(`punto de retorno · ssLtw ${ss.versionId} (${ss.nodes.length}) · LazoA ${la.versionId} (${la.nodes.length})`);
  const hSSpre = huella(ss.nodes.filter((n) => n.name !== RET));
  const hLApre = huella(la.nodes.filter((n) => ![PREP, PARSE].includes(n.name)));

  // ───────── 🔴 Return scores · fuente directa del camino ─────────
  {
    const nd = ss.nodes.find((n) => n.name === RET);
    const VIEJO = `const fj = $('[BB] Faithfulness judge').first().json;
const fid = fj.fidelity || {};
const draft = fj.brand_book_draft || {};`;
    nd.parameters.jsCode = swap(nd.parameters.jsCode, VIEJO,
`// 2026-08-01 · CC#3 §2 · FALLA-FALSO. Con el ciclo, [BB] Faithfulness judge corre DOS veces
// (pasada 1 + pasada 2 tras la corrección) y este nodo corre UNA sola ⇒
// \`$('[BB] Faithfulness judge').first()\` puede resolver al runIndex 0 = LA PASADA 1 ⇒
// reportaría track_pass:false JUSTO CUANDO la corrección funcionó, con el manual ya escrito.
// Es el espejo del "listo falso": un FALLA-FALSO.
//
// Se prefiere la fuente DIRECTA del camino recorrido, que no depende de alinear runIndex:
//   · agotado → $json ES la salida del juez de la pasada 2 (viene por IF ciclos agotados out#0)
//   · PASS    → $('[BB] Promote prep') · corre UNA sola vez y emite \`fidelity\`
// El juez por referencia queda como ÚLTIMO recurso, no como fuente principal.
let src = null; let _return_source = 'ninguno';
if ($json && $json.fidelity) { src = $json; _return_source = 'json_directo'; }
if (!src) { try { const pp = $('[BB] Promote prep').first().json;
  if (pp && pp.fidelity) { src = pp; _return_source = 'promote_prep'; } } catch (e) {} }
if (!src) { try { src = $('[BB] Faithfulness judge').first().json; _return_source = 'juez_referencia'; }
  catch (e) { src = {}; _return_source = 'vacio'; } }
const fj = src;
const fid = fj.fidelity || {};
const draft = fj.brand_book_draft || (fj.promote_body && fj.promote_body.brand_book) || {};`, '🔴 Return-src');

    nd.parameters.jsCode = swap(nd.parameters.jsCode,
`  fidelity_cycle: Number(fj._fidelity_cycle || fid.fidelity_cycle || 1),
  _cimiento_return: true`,
`  fidelity_cycle: Number(fj._fidelity_cycle || fid.fidelity_cycle || 1),
  _return_source,        // observabilidad · de qué fuente salió el veredicto (chequeo #6 del humo)
  _cimiento_return: true`, '🔴 Return-ret');
    nd.parameters.jsCode = swap(nd.parameters.jsCode, '  client_id: draft.client_id || null,',
      '  client_id: draft.client_id || fj.client_id || null,', '🔴 Return-cid');
    L('🔴 Return scores → fuente directa ($json en agotado · Promote prep en PASS) + _return_source ✅');
  }

  // ───────── 🟡 reviewers_ok en el trío de re-síntesis ─────────
  {
    const p = la.nodes.find((n) => n.name === PREP);
    p.parameters.jsCode = swap(p.parameters.jsCode,
      `  cycle: nextCycle, corrections: inp.corrections || [], _fidelity_cycle: inp._fidelity_cycle } }];`,
      `  cycle: nextCycle, corrections: inp.corrections || [], _fidelity_cycle: inp._fidelity_cycle,
  // CC#3 §3 · reviewers_ok se perdía justo en el camino CORREGIDO
  reviewers_ok: inp.reviewers_ok } }];`, '🟡 prep');
    const q = la.nodes.find((n) => n.name === PARSE);
    q.parameters.jsCode = swap(q.parameters.jsCode, `  resynth_ok,
} }];`, `  resynth_ok,
  // CC#3 §3 · misma inversión de telemetría que ya se cerró para corrections
  reviewers_ok: src.reviewers_ok,
} }];`, '🟡 parse');
    L('🟡 reviewers_ok propagado en Re-síntesis prep y parse ✅');
  }

  // ───────── V12 + verificación ─────────
  L('\nV12 sintaxis:');
  let sx = true;
  for (const [al, w] of [['ssLtw', ss], ['LazoA', la]]) for (const n of w.nodes.filter((x) => x.type === 'n8n-nodes-base.code')) {
    // el \n final es OBLIGATORIO: sin él, el `})` del envoltorio cae DENTRO de un
    // comentario de línea final y el verificador da un FALSO ROJO (pasó hoy).
    try { new vm.Script('(async()=>{' + n.parameters.jsCode + '\n})'); }
    catch (e) { L(`  ❌ ${al}/${n.name}: ${e.message}`); sx = false; }
  }
  L(`  ${sx ? '✅ todos compilan' : '❌'}`);
  const hSSpost = huella(ss.nodes.filter((n) => n.name !== RET));
  const hLApost = huella(la.nodes.filter((n) => ![PREP, PARSE].includes(n.name)));
  L(`huella ssLtw (21 no editados): ${hSSpre === hSSpost ? '✅ idéntica' : '❌'}`);
  L(`huella LazoA (9 no editados) : ${hLApre === hLApost ? '✅ idéntica' : '❌'}`);
  const ok = sx && hSSpre === hSSpost && hLApre === hLApost;
  L(`\n>>> VEREDICTO: ${ok ? '✅ VERDE' : '❌ ROJO'}`);
  fs.writeFileSync(new URL('./PAYLOAD-fix-ssLtw.json', DIR), JSON.stringify(ss, null, 2));
  fs.writeFileSync(new URL('./PAYLOAD-fix-LazoA.json', DIR), JSON.stringify(la, null, 2));
  fs.writeFileSync(new URL('./VERIFICACION-fix.txt', DIR), rep.join('\n') + '\n');
  if (!ok) process.exit(1);
  if (process.argv[3] !== '--ejecutar') { L('\n(ensayo · sin PUT)'); return; }

  for (const [id, w, al] of [['ssLtwYPt7zxuvnM2', ss, 'ssLtw'], ['kSSAvCbEfHs2Hoa0', la, 'LazoA']]) {
    const settings = { ...w.settings }; delete settings.availableInMCP; delete settings.binaryMode;
    const r = await fetch(`${B}/workflows/${id}`, { method: 'PUT', headers: H,
      body: JSON.stringify({ name: w.name, nodes: w.nodes, connections: w.connections, settings }) });
    const j = await r.json();
    L(`PUT ${al} · HTTP ${r.status} · nodos ${j.nodes?.length} · versionId ${j.versionId} · active ${j.active}`);
    if (r.status !== 200) { L(JSON.stringify(j).slice(0, 300)); process.exit(1); }
  }
  fs.writeFileSync(new URL('./VERIFICACION-fix.txt', DIR), rep.join('\n') + '\n');
})().catch((e) => { console.log('ABORT:', e.message); process.exit(1); });
