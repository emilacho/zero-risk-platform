// FASE 1 v6 · compone los 2 payloads LOCALMENTE desde los baselines archivados.
// NO hace ningún PUT. Verifica antes de que nada salga a la red.
//   node componer-fase1-v6.mjs
import fs from 'node:fs';
import crypto from 'node:crypto';

const DIR = new URL('./', import.meta.url);
const rd = (f) => JSON.parse(fs.readFileSync(new URL(f, DIR), 'utf8'));
const wr = (f, o) => fs.writeFileSync(new URL(f, DIR), JSON.stringify(o, null, 2));

// ---------- huella (receta v2 · misma que Fase 1 v3) ----------
const CAMPOS = ['name', 'parameters', 'onError', 'retryOnFail', 'typeVersion', 'webhookId'];
const ordenar = (o) =>
  Array.isArray(o) ? o.map(ordenar)
    : (o && typeof o === 'object' ? Object.fromEntries(Object.keys(o).sort().map((k) => [k, ordenar(o[k])])) : o);
const huella = (nodos) => crypto.createHash('sha256').update(JSON.stringify(
  [...nodos].sort((a, b) => a.name.localeCompare(b.name))
    .map((n) => ordenar(Object.fromEntries(CAMPOS.map((k) => [k, n[k] === undefined ? null : n[k]]))))
)).digest('hex');

const ssPre = rd('./BASELINE-ssLtw-ssLtwYPt7zxuvnM2.json');
const lyPre = rd('./BASELINE-LyVoK-LyVoKcrypS5uLyuu.json');

// ============================================================
// PIEZA A + B + P3 · ssLtw
// ============================================================
const ss = JSON.parse(JSON.stringify(ssPre));
const N = (w, n) => { const x = w.nodes.find((y) => y.name === n); if (!x) throw new Error('no existe nodo: ' + n); return x; };
const TOCADOS_SS = [];

// A1 + A2 · re-encender los 2 nodos del escritor
for (const n of ['[BB] Promote prep', '[BB] Promote → canon']) {
  const nd = N(ss, n);
  if (nd.disabled !== true) throw new Error(n + ' no estaba deshabilitado · el baseline no es el esperado');
  delete nd.disabled;
  TOCADOS_SS.push(n);
}

// A3 · IF fidelidad PASS main#0 → Promote prep (hoy va a Return scores)
{
  const c = ss.connections['[BB] IF · fidelidad PASS'];
  const antes = c.main[0].map((x) => x.node).join(',');
  if (antes !== 'Return scores a parent (grade-cimiento gate)') throw new Error('A3 · destino inesperado: ' + antes);
  c.main[0] = [{ node: '[BB] Promote prep', type: 'main', index: 0 }];
}

// A4 (BLOQUEANTE) · Promote → canon main#0 REEMPLAZA Trigger Onboarding Report por Return scores
{
  const c = ss.connections['[BB] Promote → canon'];
  const antes = c.main[0].map((x) => x.node).join(',');
  if (antes !== '[BB] Trigger Onboarding Report') throw new Error('A4 · destino inesperado: ' + antes);
  c.main[0] = [{ node: 'Return scores a parent (grade-cimiento gate)', type: 'main', index: 0 }];
}

// B · website deja de ser obligatorio (+ marca provisional cuando falta)
{
  const nd = N(ss, 'Validate Deal Data');
  const LINEA = "if (!inp.website && !inp.domain) missing.push('website');";
  if (!nd.parameters.jsCode.includes(LINEA)) throw new Error('B · no encuentro la línea del website');
  nd.parameters.jsCode = nd.parameters.jsCode.replace(
    LINEA,
    "// Pieza B (Emilio 2026-07-30) · website OPCIONAL: sin web el cimiento sale PROVISIONAL, no se para.\n" +
    "const _sin_web = !inp.website && !inp.domain;"
  ).replace(
    'website: inp.website || inp.domain,',
    'website: inp.website || inp.domain || null, _sin_web,'
  );
  TOCADOS_SS.push('Validate Deal Data');
}

// P3 · precedencia del || invertida · lo validado manda sobre el borrador del modelo
for (const n of ['[BB] Promote prep', '[BB] Judge prep']) {
  const nd = N(ss, n);
  const VIEJA = "const clientId = draft.client_id || $('Validate Deal Data').first().json.client_id;";
  if (!nd.parameters.jsCode.includes(VIEJA)) throw new Error('P3 · no encuentro la línea en ' + n);
  nd.parameters.jsCode = nd.parameters.jsCode.replace(
    VIEJA,
    "// P3 (endurecido 2026-07-30) · la fuente VALIDADA manda · el borrador del modelo NUNCA\n" +
    "// controla la dirección de escritura. Antes era al revés (draft primero).\n" +
    "const clientId = $('Validate Deal Data').first().json.client_id || draft.client_id;"
  );
  if (!TOCADOS_SS.includes(n)) TOCADOS_SS.push(n);
}

// HOOK DE HONESTIDAD · dentro de brand_book (no top-level · el endpoint lo descartaría)
{
  const nd = N(ss, '[BB] Promote prep');
  const VIEJA = '  brand_book: draft,';
  if (!nd.parameters.jsCode.includes(VIEJA)) throw new Error('hook · no encuentro brand_book: draft');
  nd.parameters.jsCode = nd.parameters.jsCode.replace(VIEJA,
    "  // HOOK DE HONESTIDAD (Emilio 2026-07-30 · dentro de brand_book · top-level lo descarta el endpoint):\n" +
    "  // el registro dice QUÉ se calificó de verdad. voz/ángulo/retención NO están gateados.\n" +
    "  brand_book: Object.assign({}, draft, {\n" +
    "    gated_fields_only: true,\n" +
    "    provisional: !!$('Validate Deal Data').first().json._sin_web,\n" +
    "  }),");
}

// ============================================================
// PIEZA C · LyVoK
// ============================================================
const ly = JSON.parse(JSON.stringify(lyPre));
const QUITAR = [
  '[JEFATURA] grade-cimiento (gate único)', '[JEFATURA] Aserción identidad (ABORT si ≠ Peniche)',
  '[JEFATURA] IF promote (identidad OK + PASS)', '[JEFATURA] Promote → canon (gate único)',
  '[JEFATURA] log-invocation metadata.jefatura', '[JEF] IF · action==recorrect', '[JEF] Build recorrect input',
  '[JEF] Re-Execute Cimiento', '[JEF] grade-cimiento(2)', '[JEF] Aserción identidad (2)',
  '[JEF] IF promote (2)', '[JEF] Promote → canon (2)', 'Persist Canon · brand_book + ICP + analysis',
];
const q = new Set(QUITAR);
for (const n of QUITAR) N(ly, n); // existe o explota

// archivar el bloque [JEF] para la fusión (trabajo en vuelo, no chatarra)
wr('./ARCHIVO-bloque-JEF-para-fusion.json', {
  nota: 'Bloque [JEF] (lazo de recorrección) + gate del padre · sacados en Fase 1 v6 · se re-integran en la fusión JEFATURA.',
  fecha: '2026-07-30', origen: 'LyVoKcrypS5uLyuu', versionId_origen: lyPre.versionId,
  nodes: lyPre.nodes.filter((n) => q.has(n.name)),
  connections: Object.fromEntries(Object.entries(lyPre.connections).filter(([k]) => q.has(k))),
});

ly.nodes = ly.nodes.filter((n) => !q.has(n.name));
for (const k of QUITAR) delete ly.connections[k];

// E3 · la cascada no muere: IF Camino III main#0 pasa a apuntar a donde apuntaba Persist Canon
{
  const c = ly.connections['[APIFY-WIRE] IF · Camino III decision (PASS/REJECT)'];
  const antes = c.main[0].map((x) => x.node).join(',');
  if (antes !== 'Persist Canon · brand_book + ICP + analysis') throw new Error('E3 · destino inesperado: ' + antes);
  c.main[0] = [{ node: 'Spell Check Pass (in-cascade)', type: 'main', index: 0 }];
}

// 3 nodos nuevos · P4
const posECT = N(ly, '[JEFATURA] Execute Cimiento Track').position;
const emitOk = N(ly, '[MODELB] Emit · cimiento.promoted');
const IF_TRACK = 'IF track_pass (¿el cimiento pasó de verdad?)';
const EMIT_FAIL = '[MODELB] Emit · cimiento.failed (honesto)';
const STOP = 'Stop and Error · cimiento no promovido';

ly.nodes.push({
  parameters: {
    conditions: {
      options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 2 },
      conditions: [{
        id: 'track-pass-gate',
        leftValue: '={{ $json.track_pass }}',
        rightValue: true,
        operator: { type: 'boolean', operation: 'true', singleValue: true },
      }],
      combinator: 'and',
    },
    looseTypeValidation: true,
    options: {},
  },
  type: 'n8n-nodes-base.if', typeVersion: 2.2, position: [posECT[0] + 220, posECT[1]],
  id: crypto.randomUUID(), name: IF_TRACK,
});

ly.nodes.push({
  ...JSON.parse(JSON.stringify(emitOk)),
  id: crypto.randomUUID(), name: EMIT_FAIL,
  position: [emitOk.position[0], emitOk.position[1] + 200],
  parameters: {
    ...JSON.parse(JSON.stringify(emitOk.parameters)),
    jsonBody: emitOk.parameters.jsonBody
      .replace('"phase_name": "CIMIENTO_PROMOTED"', '"phase_name": "CIMIENTO_FAILED"')
      .replace('"phase_state": "completed"', '"phase_state": "failed"'),
  },
});

ly.nodes.push({
  parameters: {
    errorMessage: '=CIMIENTO NO PROMOVIDO · track_pass={{ $json.track_pass }} · ciclos_agotados={{ $json.track_exhausted }} · el manual NO se escribió · retención para revisión humana (NO se despacha nada).',
  },
  type: 'n8n-nodes-base.stopAndError', typeVersion: 1,
  position: [posECT[0] + 440, posECT[1] + 260], id: crypto.randomUUID(), name: STOP,
});

// P4 · el cableado
ly.connections['[JEFATURA] Execute Cimiento Track'] = {
  main: [
    [{ node: IF_TRACK, type: 'main', index: 0 }],
    [{ node: STOP, type: 'main', index: 0 }],   // error output · NUNCA a un Wait muerto
  ],
};
ly.connections[IF_TRACK] = {
  main: [
    [{ node: '[MODELB] Emit · cimiento.promoted', type: 'main', index: 0 }],
    [{ node: EMIT_FAIL, type: 'main', index: 0 }],
  ],
};
ly.connections[EMIT_FAIL] = { main: [[{ node: STOP, type: 'main', index: 0 }]] };

// ============================================================
// VERIFICACIÓN LOCAL (antes de que nada salga a la red)
// ============================================================
const rep = [];
const L = (s) => { console.log(s); rep.push(s); };

// Huérfano nuevo ACEPTADO a propósito · lo ordena el plan v6 Pieza A4 (rec. CC#3):
// la arista `[BB] Promote → canon main#0 → [BB] Trigger Onboarding Report` se REEMPLAZA
// (no se suma) por la que avisa al padre. El nodo ya está deshabilitado ⇒ queda apagado
// e inerte, que es lo pedido: mejor un nodo apagado sin entrada que una arista muerta.
const HUERFANOS_ESPERADOS = new Set(['[BB] Trigger Onboarding Report']);

function auditar(alias, pre, post, nuevos = []) {
  L(`\n===== ${alias} =====`);
  L(`nodos: ${pre.nodes.length} → ${post.nodes.length}`);
  L(`claves connections: ${Object.keys(pre.connections).length} → ${Object.keys(post.connections).length}`);
  const nombres = new Set(post.nodes.map((n) => n.name));

  // aristas colgando
  const colgando = [];
  for (const [src, c] of Object.entries(post.connections)) {
    if (!nombres.has(src)) colgando.push(`origen inexistente: ${src}`);
    (c.main || []).forEach((br, i) => (br || []).forEach((x) => {
      if (!nombres.has(x.node)) colgando.push(`${src} main#${i} → ${x.node} (inexistente)`);
    }));
  }
  L(`aristas colgando: ${colgando.length}` + (colgando.length ? '\n  ' + colgando.join('\n  ') : ''));

  // huérfanos (sin entrada) · comparados contra los que YA eran huérfanos antes
  const conEntrada = (w) => { const s = new Set(); for (const c of Object.values(w.connections)) (c.main || []).forEach((br) => (br || []).forEach((x) => s.add(x.node))); return s; };
  const TRIGGER = /trigger|webhook|executeWorkflowTrigger|scheduleTrigger/i;
  const huerf = (w) => w.nodes.filter((n) => !TRIGGER.test(n.type) && !conEntrada(w).has(n.name)).map((n) => n.name);
  const hPre = new Set(huerf(pre)), hPost = huerf(post);
  const todosNuevos = hPost.filter((n) => !hPre.has(n));
  const esperados = todosNuevos.filter((n) => HUERFANOS_ESPERADOS.has(n));
  const nuevosHuerf = todosNuevos.filter((n) => !HUERFANOS_ESPERADOS.has(n));
  L(`huérfanos preexistentes: ${[...hPre].join(' | ') || '(ninguno)'}`);
  if (esperados.length) {
    const apagados = esperados.every((n) => post.nodes.find((x) => x.name === n)?.disabled === true);
    L(`huérfanos nuevos ESPERADOS (plan v6 A4): ${esperados.join(' | ')} · ¿todos deshabilitados? ${apagados ? '✅ sí (inertes)' : '❌ NO · revisar'}`);
    if (!apagados) nuevosHuerf.push(...esperados);
  }
  L(`HUÉRFANOS NUEVOS NO PREVISTOS: ${nuevosHuerf.length}` + (nuevosHuerf.length ? ' → ' + nuevosHuerf.join(' | ') : ' ✅'));

  // huella sobre los NO tocados
  const tocados = new Set([...nuevos]);
  const preN = pre.nodes.filter((n) => nombres.has(n.name) && !tocados.has(n.name));
  const postN = post.nodes.filter((n) => !tocados.has(n.name) && pre.nodes.some((p) => p.name === n.name));
  L(`huella sobre ${preN.length} nodos NO tocados y sobrevivientes:`);
  L(`  pre : ${huella(preN)}`);
  L(`  post: ${huella(postN)}`);
  L(`  ${huella(preN) === huella(postN) ? '✅ IDÉNTICA · lo único que pasó fue el cambio intencional' : '❌ DISTINTA · algo se movió sin querer'}`);
  return { colgando: colgando.length, nuevosHuerf: nuevosHuerf.length, huellaOk: huella(preN) === huella(postN) };
}

const rSS = auditar('ssLtw (Pieza A + B + P3 + hook)', ssPre, ss, TOCADOS_SS);
const rLY = auditar('LyVoK (Pieza C)', lyPre, ly, [IF_TRACK, EMIT_FAIL, STOP]);

L(`\n===== CONTEO DERIVADO (no fijado a ojo) =====`);
L(`LyVoK: ${lyPre.nodes.length} − ${QUITAR.length} quitados + 3 nuevos = ${lyPre.nodes.length - QUITAR.length + 3}  (esperado 73)`);
L(`nodos nuevos: ${IF_TRACK} · ${EMIT_FAIL} · ${STOP}`);

const ok = rSS.colgando === 0 && rSS.nuevosHuerf === 0 && rSS.huellaOk &&
           rLY.colgando === 0 && rLY.nuevosHuerf === 0 && rLY.huellaOk &&
           (lyPre.nodes.length - QUITAR.length + 3) === 73;
L(`\n>>> VEREDICTO LOCAL: ${ok ? '✅ VERDE · listo para PUT' : '❌ ROJO · NO tocar nada'}`);

// payloads mínimos (solo lo que el PUT acepta)
wr('./PAYLOAD-ssLtw.json', { name: ss.name, nodes: ss.nodes, connections: ss.connections, settings: ss.settings });
wr('./PAYLOAD-LyVoK.json', { name: ly.name, nodes: ly.nodes, connections: ly.connections, settings: ly.settings });
fs.writeFileSync(new URL('./VERIFICACION-local.txt', DIR), rep.join('\n') + '\n');
process.exit(ok ? 0 : 1);
