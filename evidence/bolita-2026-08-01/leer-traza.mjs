import fs from 'node:fs';
const env = Object.fromEntries(
  fs.readFileSync(process.argv[2], 'utf8').split(/\r?\n/).filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
const B = env.N8N_BASE_URL + '/api/v1', H = { 'X-N8N-API-KEY': env.N8N_API_KEY };
const VAR = process.argv[3] || 'A';
const ex = await (await fetch(`${B}/executions?workflowId=ssLtwYPt7zxuvnM2&limit=1&includeData=true`, { headers: H })).json();
const e = ex.data[0];
const rd = (e.data && e.data.resultData && e.data.resultData.runData) || {};
const out = (n, r = 0) => { try { return rd[n][r].data.main.flat().filter(Boolean)[0].json; } catch { return null; } };
const runs = (n) => (rd[n] ? rd[n].length : 0);
const R = []; const L = (s) => { console.log(s); R.push(s); };
const chk = (t, ok, val) => L(`  ${ok ? '✅' : '❌'} ${t}${val !== undefined ? ' → ' + JSON.stringify(val) : ''}`);

L(`════ VARIANTE ${VAR} · exec ${e.id} · ${e.status} · ${e.startedAt} ════`);
L(`nodos ejecutados: ${Object.keys(rd).length}\n`);
const j0 = out('[BB] Faithfulness judge', 0), j1 = out('[BB] Faithfulness judge', 1);
const lp = out('[BB] Lazo A prep'), rs = out('Return scores a parent (grade-cimiento gate)');
const ex2 = out('[BB] Execute Lazo A corrección');

chk('A2 · juez run0 · scores vacíos', j0 && Object.values(j0.fidelity.scores).every((v) => v === 0), j0 && j0.fidelity.scores);
chk('A2 · juez run0 · low_fields = los 2 gateados', j0 && j0.fidelity.low_fields.length === 2, j0 && j0.fidelity.low_fields);
chk('A2 · juez run0 · pass:false · exhausted:false', j0 && j0.fidelity.pass === false && j0.fidelity.exhausted === false);
chk('A2 · el try/catch NO lanzó (el nodo produjo salida)', !!j0);
chk('A4 · Lazo A prep · _fidelity_cycle = 2', lp && lp._fidelity_cycle === 2, lp && lp._fidelity_cycle);
chk('A11 · Promote → canon NUNCA alcanzado', runs('[BB] Promote → canon') === 0);
L(`\n  el sub-proceso devolvió: ${ex2 ? JSON.stringify(ex2).slice(0, 260) : '(sin datos)'}`);
if (ex2) {
  chk('A7 · Exit · _fidelity_cycle = 2 (del trigger)', ex2._fidelity_cycle === 2, ex2._fidelity_cycle);
  chk('A7 · Exit · _draft_preserved: false', ex2._draft_preserved === false, ex2._draft_preserved);
  chk('A6 · resynth_ok: false (el run-sdk estaba apagado)', ex2.resynth_ok === false, ex2.resynth_ok);
  chk('A5 · reviewers_ok = 0', ex2.reviewers_ok === 0, ex2.reviewers_ok);
}
chk('A8 · juez run1 existe (la reentrada funcionó)', runs('[BB] Faithfulness judge') === 2, runs('[BB] Faithfulness judge'));
if (j1) {
  chk('A8 · juez run1 · fidelity_cycle = 2', j1._fidelity_cycle === 2, j1._fidelity_cycle);
  chk('A8 · juez run1 · exhausted: true', j1.fidelity.exhausted === true, j1.fidelity.exhausted);
  chk('A8 · juez run1 · no_progress', j1.no_progress, j1.no_progress);
  chk('B · juez run1 · pass', j1.fidelity.pass, j1.fidelity.pass);
}
L('\n  🔑 A10 · Return scores a parent:');
if (rs) {
  chk('A10 · fidelity_cycle = 2', rs.fidelity_cycle === 2, rs.fidelity_cycle);
  chk("A10 · _return_source = 'json_directo'", rs._return_source === 'json_directo', rs._return_source);
  chk('track_pass', rs.track_pass !== undefined, rs.track_pass);
  chk('track_exhausted', rs.track_exhausted !== undefined, rs.track_exhausted);
} else L('  ❌ no ejecutó');
L(`\n  orden real: ${Object.keys(rd).join(' → ')}`);
fs.writeFileSync(new URL(`./TRAZA-variante-${VAR}.txt`, import.meta.url), R.join('\n') + '\n');
