// Verificación POST-OBRA · Fase 1 v6 · solo lectura contra el vivo.
import fs from 'node:fs';
import crypto from 'node:crypto';

const env = Object.fromEntries(
  fs.readFileSync(process.argv[2], 'utf8').split(/\r?\n/).filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()])
);
const B = env.N8N_BASE_URL + '/api/v1', H = { 'X-N8N-API-KEY': env.N8N_API_KEY };
const DIR = new URL('./', import.meta.url);
const rd = (f) => JSON.parse(fs.readFileSync(new URL(f, DIR), 'utf8'));

const CAMPOS = ['name', 'parameters', 'onError', 'retryOnFail', 'typeVersion', 'webhookId'];
const ordenar = (o) => Array.isArray(o) ? o.map(ordenar)
  : (o && typeof o === 'object' ? Object.fromEntries(Object.keys(o).sort().map((k) => [k, ordenar(o[k])])) : o);
const huella = (ns) => crypto.createHash('sha256').update(JSON.stringify(
  [...ns].sort((a, b) => a.name.localeCompare(b.name))
    .map((n) => ordenar(Object.fromEntries(CAMPOS.map((k) => [k, n[k] === undefined ? null : n[k]])))))).digest('hex');

const out = [];
const L = (s) => { console.log(s); out.push(s); };

const TOCADOS_SS = ['[BB] Promote prep', '[BB] Promote → canon', 'Validate Deal Data', '[BB] Judge prep'];
const NUEVOS_LY = ['IF track_pass (¿el cimiento pasó de verdad?)', '[MODELB] Emit · cimiento.failed (honesto)', 'Stop and Error · cimiento no promovido'];
const HUERF_OK = new Set(['[BB] Trigger Onboarding Report']);

(async () => {
  const casos = [
    ['ssLtw', 'ssLtwYPt7zxuvnM2', './BASELINE-ssLtw-ssLtwYPt7zxuvnM2.json', TOCADOS_SS, 20, 17],
    ['LyVoK', 'LyVoKcrypS5uLyuu', './BASELINE-LyVoK-LyVoKcrypS5uLyuu.json', NUEVOS_LY, 73, 58],
  ];
  let todoOk = true;
  for (const [alias, id, baseFile, excl, nEsp, cEsp] of casos) {
    const pre = rd(baseFile);
    const post = await (await fetch(B + '/workflows/' + id, { headers: H })).json();
    fs.writeFileSync(new URL(`./POST-${alias}-${id}.json`, DIR), JSON.stringify(post, null, 2));

    L(`\n===== ${alias} · POST-OBRA =====`);
    const okN = post.nodes.length === nEsp, okC = Object.keys(post.connections).length === cEsp;
    L(`V1 nodos            : ${post.nodes.length} (esperado ${nEsp}) ${okN ? '✅' : '❌'}`);
    L(`V2 claves connections: ${Object.keys(post.connections).length} (esperado ${cEsp}) ${okC ? '✅' : '❌'}`);

    const nombres = new Set(post.nodes.map((n) => n.name));
    const colg = [];
    for (const [src, c] of Object.entries(post.connections)) {
      if (!nombres.has(src)) colg.push('origen inexistente: ' + src);
      (c.main || []).forEach((br, i) => (br || []).forEach((x) => { if (!nombres.has(x.node)) colg.push(`${src} main#${i} → ${x.node}`); }));
    }
    L(`V3 aristas colgando  : ${colg.length} ${colg.length === 0 ? '✅' : '❌ ' + colg.join(' | ')}`);

    const entra = (w) => { const s = new Set(); for (const c of Object.values(w.connections)) (c.main || []).forEach((br) => (br || []).forEach((x) => s.add(x.node))); return s; };
    const TR = /trigger|webhook|executeWorkflowTrigger|scheduleTrigger/i;
    const hf = (w) => w.nodes.filter((n) => !TR.test(n.type) && !entra(w).has(n.name)).map((n) => n.name);
    const hPre = new Set(hf(pre)), nuevos = hf(post).filter((n) => !hPre.has(n) && !HUERF_OK.has(n));
    L(`V4 huérfanos nuevos  : ${nuevos.length} ${nuevos.length === 0 ? '✅' : '❌ ' + nuevos.join(' | ')}`);

    const ex = new Set(excl);
    const a = pre.nodes.filter((n) => nombres.has(n.name) && !ex.has(n.name));
    const b = post.nodes.filter((n) => !ex.has(n.name) && pre.nodes.some((p) => p.name === n.name));
    const hOk = huella(a) === huella(b);
    L(`V5 huella (${a.length} nodos intactos)`);
    L(`     pre : ${huella(a)}`);
    L(`     post: ${huella(b)}`);
    L(`     ${hOk ? '✅ IDÉNTICA' : '❌ DISTINTA'}`);

    L(`V6 settings          : ${JSON.stringify(post.settings)}`);
    const sPre = pre.settings, sPost = post.settings;
    const dif = Object.keys(sPre).filter((k) => JSON.stringify(sPre[k]) !== JSON.stringify(sPost[k]));
    L(`     diferencias vs baseline: ${dif.length ? dif.map((k) => `${k}: ${JSON.stringify(sPre[k])} → ${JSON.stringify(sPost[k])}`).join(' | ') : 'ninguna ✅'}`);
    L(`V7 active            : ${post.active} (debe ser false · pausado hasta la prueba) ${post.active === false ? '✅' : '❌'}`);
    todoOk = todoOk && okN && okC && colg.length === 0 && nuevos.length === 0 && hOk && post.active === false;
  }

  // el camino nuevo, explícito
  const ly = rd('./POST-LyVoK-LyVoKcrypS5uLyuu.json');
  L(`\n===== CAMINO P4 (el corazón de la honestidad) =====`);
  for (const n of ['[JEFATURA] Execute Cimiento Track', ...NUEVOS_LY]) {
    const c = ly.connections[n];
    if (!c) { L(`${n} → (terminal)`); continue; }
    (c.main || []).forEach((br, i) => L(`${n} main#${i} → ${(br || []).map((x) => x.node).join(', ') || '(vacío)'}`));
  }
  const ss = rd('./POST-ssLtw-ssLtwYPt7zxuvnM2.json');
  L(`\n===== CAMINO DEL ESCRITOR (Pieza A) =====`);
  for (const n of ['[BB] IF · fidelidad PASS', '[BB] Promote prep', '[BB] Promote → canon']) {
    const nd = ss.nodes.find((x) => x.name === n);
    const c = ss.connections[n];
    L(`${n} · ${nd.disabled ? 'APAGADO ❌' : 'ENCENDIDO ✅'} → ${(c ? (c.main || []).map((br, i) => 'main#' + i + ': ' + (br || []).map((x) => x.node).join(',')).join(' | ') : '(terminal)')}`);
  }

  // ventana del daño
  const ej = await (await fetch(B + '/executions?workflowId=LyVoKcrypS5uLyuu&limit=5', { headers: H })).json();
  L(`\n===== VENTANA DEL DAÑO (sonda que sí se aplicó) =====`);
  L(`últimas ejecuciones de LyVoK: ${(ej.data || []).map((e) => `${e.id}@${e.startedAt}(${e.status})`).join(' · ') || '(ninguna)'}`);

  L(`\n>>> VEREDICTO: ${todoOk ? '✅ VERDE' : '❌ ROJO'}`);
  fs.writeFileSync(new URL('./VERIFICACION-post-obra.txt', DIR), out.join('\n') + '\n');
})();
