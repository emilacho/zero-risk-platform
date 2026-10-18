// BUILD ssLtw · arreglos 6, 7, 8.b · cap=1 · plan FINAL v2 con las correcciones C1/C2/C3/C5 de CC#2
import fs from 'node:fs';
import crypto from 'node:crypto';
import vm from 'node:vm';

const DIR = new URL('./', import.meta.url);
const env = Object.fromEntries(
  fs.readFileSync(process.argv[2], 'utf8').split(/\r?\n/).filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
const B = env.N8N_BASE_URL + '/api/v1';
const H = { 'X-N8N-API-KEY': env.N8N_API_KEY, 'Content-Type': 'application/json' };
const ID = 'ssLtwYPt7zxuvnM2';

const CAMPOS = ['name', 'parameters', 'onError', 'retryOnFail', 'typeVersion', 'webhookId'];
const ordenar = (o) => Array.isArray(o) ? o.map(ordenar)
  : (o && typeof o === 'object' ? Object.fromEntries(Object.keys(o).sort().map((k) => [k, ordenar(o[k])])) : o);
const huella = (ns) => crypto.createHash('sha256').update(JSON.stringify(
  [...ns].sort((a, b) => a.name.localeCompare(b.name))
    .map((n) => ordenar(Object.fromEntries(CAMPOS.map((k) => [k, n[k] === undefined ? null : n[k]])))))).digest('hex');

const rep = []; const L = (s) => { console.log(s); rep.push(s); };
const rx = (s) => new RegExp(s.split('\n').map((l) => l.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\r?\\n'));
const swap = (code, viejo, nuevo, et) => { const re = rx(viejo);
  if (!re.test(code)) throw new Error(et + ' · no encuentro el bloque'); return code.replace(re, () => nuevo); };

const IFCICLOS = '[BB] IF · ciclos agotados';
const JUEZ = '[BB] Faithfulness judge';
const JUDGEPREP = '[BB] Judge prep';
const CONSOL = '[BB] Consolidador';
const LAZOPREP = '[BB] Lazo A prep';
const EXEC = '[BB] Execute Lazo A corrección';
const RETSCORES = 'Return scores a parent (grade-cimiento gate)';
const TOCADOS = [IFCICLOS, JUEZ, RETSCORES, LAZOPREP, EXEC];

(async () => {
  const pre = JSON.parse(fs.readFileSync(new URL('./BASELINE-ssLtw.json', DIR), 'utf8'));
  L(`=== BASELINE ssLtw · ${pre.nodes.length} nodos · versionId ${pre.versionId} · active ${pre.active} ===`);
  const hPre = huella(pre.nodes.filter((n) => !TOCADOS.includes(n.name)));
  L(`huella de los ${pre.nodes.filter((n) => !TOCADOS.includes(n.name)).length} NO tocados: ${hPre}`);

  const w = JSON.parse(JSON.stringify(pre));
  const N = (n) => { const x = w.nodes.find((y) => y.name === n); if (!x) throw new Error('falta ' + n); return x; };
  const posJ = N(JUEZ).position;

  // ─────────── ARREGLO 6 · el cable ───────────
  {
    const prep = { parameters: { jsCode:
`// [BB] Lazo A prep · code · SIN LLM · prepara la invocación del ciclo de corrección.
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
try { grounding = $('${JUDGEPREP}').first().json._grounding_refs || {}; } catch (e) { grounding = {}; }

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
} }];` },
      type: 'n8n-nodes-base.code', typeVersion: 2, position: [posJ[0] + 220, posJ[1] + 220], id: crypto.randomUUID(), name: LAZOPREP };

    const exec = { parameters: { workflowId: { __rl: true, value: 'kSSAvCbEfHs2Hoa0', mode: 'id' }, options: {} },
      type: 'n8n-nodes-base.executeWorkflow', typeVersion: 1, position: [posJ[0] + 440, posJ[1] + 220],
      id: crypto.randomUUID(), name: EXEC };

    w.nodes.push(prep, exec);
    const br = w.connections[IFCICLOS].main[1] || [];
    const antes = br.map((x) => x.node).join(',');
    if (antes !== CONSOL) throw new Error('A6 · out#1 no apunta al Consolidador · apunta a: ' + antes);
    w.connections[IFCICLOS].main[1] = [{ node: LAZOPREP, type: 'main', index: 0 }];  // ELIMINA la vieja (no suma)
    w.connections[LAZOPREP] = { main: [[{ node: EXEC, type: 'main', index: 0 }]] };
    w.connections[EXEC] = { main: [[{ node: JUDGEPREP, type: 'main', index: 0 }]] };  // REENTRADA por Judge prep
    L(`arreglo 6 · cable: IF ciclos out#1 ↛ ${CONSOL} → ${LAZOPREP} → ${EXEC} → ${JUDGEPREP} ✅`);
  }

  // ─────────── ARREGLO 7 · umbral >= 2 (cap=1) ───────────
  {
    const nd = N(IFCICLOS);
    const s = JSON.stringify(nd.parameters);
    if (!s.includes('>= 1')) throw new Error('A7 · no encuentro el umbral >= 1');
    nd.parameters = JSON.parse(s.replace(
      '{{ (Number($json._fidelity_cycle) || 0) >= 1 }}',
      '{{ (Number($json._fidelity_cycle) || 0) >= 2 || $json.no_progress === true }}'));
    L('arreglo 7 · umbral → >= 2 (cap=1 · exactamente 1 corrección) + no_progress (inerte hoy) ✅');
  }

  // ─────────── ARREGLO 8.b · progreso monótono + MAX=2 ───────────
  {
    const nd = N(JUEZ); let c = nd.parameters.jsCode;
    c = swap(c, 'const MAX_FIDELITY_CYCLES = 1;',
      'const MAX_FIDELITY_CYCLES = 2;   // pasadas de juez · cap=1 ⇒ 2 pasadas (CC#2 F2.1 · antes 1 mentía en `exhausted`)',
      'A8b-max');
    const ANCLA = 'const lowFields = GATED_FIELDS.filter((f) => norm[f] < THRESHOLD);';
    c = swap(c, ANCLA, ANCLA + `
// ADR-020 §7.6 · progreso monótono · una re-síntesis que NO sube la fidelidad → STOP + mejor versión.
// try/catch OBLIGATORIO (CC#2 F1): en la 1ª pasada '${LAZOPREP}' NO se ejecutó y referenciarlo
// LANZA · el || no salva (Number(undefined)=NaN ⇒ falsy ⇒ evalúa el 2º operando ⇒ lanza).
// Es el idioma que [BBA] Exit ya usa con el trigger.
const gated_mean = GATED_FIELDS.reduce((a, f) => a + (Number(norm[f]) || 0), 0) / GATED_FIELDS.length;
let prev_best = Number($json.best_gated_mean) || 0;
let prev_draft = null;
try {
  const lp = $('${LAZOPREP}').first().json || {};
  prev_best = prev_best || Number(lp.best_gated_mean) || 0;
  prev_draft = lp.best_draft || null;
} catch (e) { /* 1ª pasada · el nodo del reintento todavía no corrió · piso 0 */ }
const improved = gated_mean > prev_best;`, 'A8b-bloque');
    // inyectar los campos nuevos en el return (top level)
    const RET = 'return [{';
    const i = c.lastIndexOf(RET);
    if (i < 0) throw new Error('A8b · no encuentro el return');
    c = c.slice(0, i) +
`const no_progress = !pass && fidelityCycle > 1 && !improved;
const best_gated_mean_out = Math.max(gated_mean, prev_best);
const best_draft_out = improved ? draft : (prev_draft || draft);
` + c.slice(i);
    // agregar las claves al objeto json del return
    const RETJ = c.slice(c.lastIndexOf(RET));
    const m = RETJ.match(/json:\s*\{/);
    if (!m) throw new Error('A8b · no encuentro json: { del return');
    const abs = c.lastIndexOf(RET) + RETJ.indexOf(m[0]) + m[0].length;
    c = c.slice(0, abs) + `
    no_progress,
    best_gated_mean: best_gated_mean_out,
    best_draft: best_draft_out,
    gated_mean,` + c.slice(abs);
    nd.parameters.jsCode = c;
    L('arreglo 8.b · juez: MAX=2 + progreso monótono con try/catch (C1) ✅');
  }

  // ─────────── 8.b · Return scores devuelve la MEJOR versión ───────────
  {
    const nd = N(RETSCORES);
    const c = swap(nd.parameters.jsCode, '  brand_book_draft: draft,',
      '  brand_book_draft: fj.best_draft || draft,   // §7.6 · se devuelve la MEJOR versión registrada',
      'A8b-return');
    nd.parameters.jsCode = c;
    L('arreglo 8.b · Return scores → best_draft ✅');
  }

  // ─────────── VERIFICACIÓN ───────────
  const nombres = new Set(w.nodes.map((n) => n.name));
  const colg = [];
  for (const [src, c] of Object.entries(w.connections)) {
    if (!nombres.has(src)) colg.push('origen: ' + src);
    (c.main || []).forEach((br, i) => (br || []).forEach((x) => { if (!nombres.has(x.node)) colg.push(`${src} main#${i} → ${x.node}`); }));
  }
  const hPost = huella(w.nodes.filter((n) => !TOCADOS.includes(n.name)));
  const viejaFuera = !(w.connections[IFCICLOS].main[1] || []).some((x) => x.node === CONSOL);
  L('\n=== VERIFICACIÓN ssLtw ===');
  L(`V2 nodos            : ${pre.nodes.length} → ${w.nodes.length} (esperado 22) ${w.nodes.length === 22 ? '✅' : '❌'}`);
  L(`V5 aristas colgando : ${colg.length} ${colg.length === 0 ? '✅' : '❌ ' + colg.join(' | ')}`);
  L(`V6 arista vieja out#1→Consolidador ELIMINADA: ${viejaFuera ? '✅' : '❌'}`);
  L(`V7 Judge prep / Consolidador / lentes / Promote sin tocar: ${[JUDGEPREP, CONSOL, '[BB] Promote prep', '[BB] Promote → canon'].every((n) => !TOCADOS.includes(n)) ? '✅' : '❌'}`);
  L(`V8 umbral: ${JSON.stringify(N(IFCICLOS).parameters).includes('>= 2') ? '✅ >= 2' : '❌'}`);
  L(`V9 MAX_FIDELITY_CYCLES: ${N(JUEZ).parameters.jsCode.includes('MAX_FIDELITY_CYCLES = 2') ? '✅ 2' : '❌'}`);
  L(`V4 huella NO tocados: ${hPost}`);
  L(`     ${hPre === hPost ? '✅ IDÉNTICA' : '❌ DISTINTA'}`);
  L('V12 sintaxis:');
  let sx = true;
  for (const n of w.nodes.filter((x) => x.type === 'n8n-nodes-base.code' && TOCADOS.includes(x.name))) {
    try { new vm.Script('(async()=>{' + n.parameters.jsCode + '})'); L(`     ✅ ${n.name}`); }
    catch (e) { L(`     ❌ ${n.name} → ${e.message}`); sx = false; }
  }
  const ok = w.nodes.length === 22 && colg.length === 0 && hPre === hPost && viejaFuera && sx;
  L(`\n>>> VEREDICTO: ${ok ? '✅ VERDE' : '❌ ROJO'}`);
  fs.writeFileSync(new URL('./PAYLOAD-ssLtw.json', DIR), JSON.stringify(w, null, 2));
  fs.writeFileSync(new URL('./VERIFICACION-ssLtw.txt', DIR), rep.join('\n') + '\n');
  if (!ok) process.exit(1);
  if (process.argv[3] !== '--ejecutar') { L('\n(ensayo · sin PUT)'); return; }

  const settings = { ...pre.settings }; delete settings.availableInMCP; delete settings.binaryMode;
  const r = await fetch(`${B}/workflows/${ID}`, { method: 'PUT', headers: H,
    body: JSON.stringify({ name: w.name, nodes: w.nodes, connections: w.connections, settings }) });
  const j = await r.json();
  L(`\nPUT · HTTP ${r.status} · nodos ${j.nodes?.length} · versionId ${j.versionId} · active ${j.active}`);
  if (r.status !== 200) { L(JSON.stringify(j).slice(0, 400)); process.exit(1); }
  const vivo = await (await fetch(`${B}/workflows/${ID}`, { headers: H })).json();
  fs.writeFileSync(new URL('./POST-ssLtw.json', DIR), JSON.stringify(vivo, null, 2));
  L(`vivo: ${vivo.nodes.length} nodos · huella NO tocados ${huella(vivo.nodes.filter((n) => !TOCADOS.includes(n.name)))} · active ${vivo.active}`);
  fs.writeFileSync(new URL('./VERIFICACION-ssLtw.txt', DIR), rep.join('\n') + '\n');
})().catch((e) => { console.log('ABORT:', e.message); fs.writeFileSync(new URL('./VERIFICACION-ssLtw.txt', DIR), rep.join('\n') + '\nABORT: ' + e.message + '\n'); process.exit(1); });
