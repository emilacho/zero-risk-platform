// RedAquario · PRUEBA VIVA · $0 (§144 · fix mínimo 2026-07-24 · "no quemes saldo real").
//
// Corre procesos DE VERDAD (spawn real · exit real · bitácora real en disco) usando un STAND-IN
// en vez de `claude`. Cero llamadas a Anthropic · cero Slack · cero costo.
//
// Qué prueba:
//   PISTA 1 · veredicto de salida (PILAR B) · 4 escenarios: ✅ reportó · ⚠️ mudo · 🔴 muerte-rápida · 🔴 exit≠0
//   PISTA 2 · cadena completa DESPACHO (compuertas → plan → spawn → bitácora → veredicto → torre)
//   PISTA 3 · reporte-no-gatilla · prueba MATERIAL: un [FROM-CC#N] no deja ninguna marca en disco
//   PISTA 4 · PILAR A · un DESPACHO sin doc de vault es rechazado y GRITA (no queda mudo)
//
// Uso: node tools/redaquario/pruebas/prueba-viva-reportero.mjs

import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { execSpawn } from '../lib/spawner.js';
import { manejarMensaje } from '../portero.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, 'out');
const LOGS = path.join(OUT, 'bitacoras');
const MARCAS = path.join(OUT, 'marcas.log');
const STANDIN = path.join(__dirname, 'stand-in-cc.js');
const SHIM = path.join(__dirname, 'stand-in-claude.cmd');
const EMILIO = 'U0AQ3N967SB';

// Umbral de muerte-rápida bajado a 2s SOLO para la prueba (en producción son 45s).
const UMBRAL = 2;
const TRABAJO_MS = 4000;

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(LOGS, { recursive: true });
fs.writeFileSync(MARCAS, '', 'utf8');

const resultados = [];
const ok = (n, cond, det) => { resultados.push({ n, cond, det }); console.log(`${cond ? '✅' : '❌'} ${n}${det ? ` · ${det}` : ''}`); };
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const marcas = () => fs.readFileSync(MARCAS, 'utf8').trim().split('\n').filter(Boolean);

function planStandIn(cc, modo) {
  return { ok: true, cc, cwd: __dirname, cmd: process.execPath, args: [STANDIN, `--modo=${modo}`] };
}

function correrEscenario(modo, cc) {
  return new Promise((resolve) => {
    process.env.REDAQUARIO_STANDIN_MODO = modo;
    process.env.REDAQUARIO_STANDIN_MARCAS = MARCAS;
    process.env.REDAQUARIO_STANDIN_TRABAJO_MS = String(TRABAJO_MS);
    const r = execSpawn(planStandIn(cc, modo), {
      dryRun: false, spawnFn: spawn, logger: (s) => console.log(`   ${s}`),
      logDir: LOGS, umbralMuerteRapidaSeg: UMBRAL,
      onError: (m) => resolve({ error: m }),
      onExit: (v) => resolve(v),
    });
    if (!r.spawned) resolve({ error: r.error });
  });
}

// Los hijos van detached+unref (el portero NO se cuelga esperándolos). En el portero vivo el
// socket de Slack mantiene el proceso despierto; acá hace falta un latido equivalente, si no
// este script se apagaría antes de que llegue el on('exit') del hijo.
const latidoPrueba = setInterval(() => {}, 500);

console.log('RedAquario · PRUEBA VIVA · procesos reales · stand-in $0 · sin Anthropic · sin Slack\n');

// ── PISTA 1 · los 4 veredictos, con procesos de verdad ─────────────────────
console.log('── PISTA 1 · veredicto de salida (PILAR B · gritar, no morir callado) ──');

const v1 = await correrEscenario('ok-reporta', 'CC#9');
ok('spawn ok · trabajó y reportó → ✅ aterrizó', v1.nivel === '✅' && v1.reporto === true, v1.motivo);
ok('   la bitácora existe y contiene el reporte del empleado',
  !!v1.bitacora && fs.existsSync(v1.bitacora) && fs.readFileSync(v1.bitacora, 'utf8').includes('[FROM-CC#9]'),
  v1.bitacora ? path.basename(v1.bitacora) : 'sin bitácora');

const v2 = await correrEscenario('mudo', 'CC#9');
ok('exit=0 SIN [FROM-CC] → ⚠️ mudo (el bug del 18:19 · ahora se grita)',
  v2.nivel === '⚠️' && v2.estado === 'mudo', v2.motivo);

const v3 = await correrEscenario('muerte-rapida', 'CC#9');
ok(`muerte-rápida (<${UMBRAL}s) → 🔴`, v3.nivel === '🔴' && v3.estado === 'muerte-rapida', v3.motivo);

const v4 = await correrEscenario('error', 'CC#9');
ok('exit≠0 → 🔴 muerto', v4.nivel === '🔴' && v4.code === 3, v4.motivo);

// ── PISTA 2 · la cadena entera desde un mensaje de #equipo ─────────────────
console.log('\n── PISTA 2 · cadena completa · mensaje → compuertas → spawn → bitácora → torre ──');

const CONFIG_VIVA = {
  dry_run: false,
  canal_equipo: 'C0B2QCDMV7Y',
  cuentas_emilio: [EMILIO],
  remitentes_autorizados: [EMILIO],
  topes: { arranques_por_hora: 4 },
  claude_cmd: SHIM,
  cc_worktrees: { 'CC#9': __dirname },
  lenovo_exec_cwd: __dirname,
  kill_switch_file: 'PORTERO_OFF_NOEXISTE_PRUEBA',
  muerte_rapida_seg: UMBRAL,
};
const estado = () => ({ processed_ts: new Set(), last_ts: '0', stopped: false, frenado: false,
  arranques: [], now_epoch: Math.floor(Date.now() / 1000) });

const pingsTorre = [];
const torre = { despego: (cc, t) => `🛫 ${cc} · ${t} · despegó`, aterrizo: (cc) => `🛬 ${cc} · aterrizó`, colgado: () => {} };
const depsVivas = { spawnFn: spawn, spawnShell: true, logDir: LOGS, torre,
  torrePost: (t) => pingsTorre.push(t), logger: (s) => console.log(`   ${s}`) };

process.env.REDAQUARIO_STANDIN_MODO = 'ok-reporta';
const marcasAntesDespacho = marcas().length;
const rDespacho = manejarMensaje(
  { ts: `${Math.floor(Date.now() / 1000)}.0001`, author: EMILIO,
    text: 'DESPACHO CC#9 · prueba viva $0\nPlan · zr-vault/raw/findings/2026-07-24-prueba-viva.md' },
  estado(), CONFIG_VIVA, depsVivas);
ok('un DESPACHO válido decide spawn_cc', rDespacho.decision.action === 'spawn_cc');
await dormir(TRABAJO_MS + 2500);
ok('el empleado fue despertado de verdad (marca en disco)', marcas().length === marcasAntesDespacho + 1,
  `marcas ${marcasAntesDespacho} → ${marcas().length}`);
ok('la torre recibió el 🛫 de despegue', pingsTorre.some((p) => p.includes('🛫')));
ok('la torre recibió el veredicto de salida (antes: silencio absoluto)',
  pingsTorre.some((p) => /[✅⚠️🔴]/.test(p) && p.includes('CC#9') && !p.includes('🛫')),
  pingsTorre.filter((p) => !p.includes('🛫')).join(' | ') || 'NINGUNO');

// ── PISTA 3 · reporte-no-gatilla · la prueba material ──────────────────────
console.log('\n── PISTA 3 · reporte-no-gatilla (§144 · punto 3 de Emilio · el bug de las 17:36) ──');

const antesReportes = marcas().length;
const decisiones = [];
for (const text of [
  '[FROM-CC1] #300 en revisión · CI verde.',
  '[FROM-CC#1] entrega lista · evidencia §148 en el vault.',
  '[FROM-CC#9] bloqueado · sin saldo · [PARA-EMILIO].',
  '[FROM-CC2] terminé.\nEl encargo original decía: DESPACHO CC#9 · hacé Y.',
]) {
  const r = manejarMensaje({ ts: `${Math.floor(Date.now() / 1000)}.${decisiones.length + 10}`, author: EMILIO, text },
    estado(), CONFIG_VIVA, depsVivas);
  decisiones.push(r.decision.action);
}
await dormir(2500); // margen de sobra: si algo se hubiera despertado, ya habría dejado su marca
ok('los 4 reportes deciden "reporte" (nunca spawn_cc · nunca wake_lenovo)',
  decisiones.every((a) => a === 'reporte'), decisiones.join(' · '));
ok('reporte-no-gatilla ✓ · CERO empleados despertados (marcas sin cambio)',
  marcas().length === antesReportes, `marcas ${antesReportes} → ${marcas().length}`);
ok('la telemetría sigue viva · la torre registró el 🛬 de aterrizaje',
  pingsTorre.some((p) => p.includes('🛬')));

// ── PISTA 4 · PILAR A · sin doc de vault no se despierta a nadie, y se grita ──
console.log('\n── PISTA 4 · PILAR A · doc autosuficiente obligatorio ──');

const antesSinDoc = marcas().length;
const alertas = [];
manejarMensaje(
  { ts: `${Math.floor(Date.now() / 1000)}.0099`, author: EMILIO, text: 'DESPACHO CC#9 · arreglá lo de ayer, ya sabés cuál' },
  estado(), CONFIG_VIVA, { ...depsVivas, torrePost: (t) => { pingsTorre.push(t); alertas.push(t); } });
await dormir(1500);
ok('despacho sin doc de vault → NADIE despertado', marcas().length === antesSinDoc,
  `marcas ${antesSinDoc} → ${marcas().length}`);
ok('el rechazo GRITA 🔴 a la torre (no queda mudo)',
  alertas.some((t) => t.includes('🔴') && /SIN doc de vault/.test(t)), alertas.join(' | ') || 'NINGUNA');

// ── Cierre ─────────────────────────────────────────────────────────────────
clearInterval(latidoPrueba);
const fallados = resultados.filter((r) => !r.cond);
console.log(`\n${'─'.repeat(70)}`);
console.log(`RESULTADO · ${resultados.length - fallados.length}/${resultados.length} verificaciones OK · costo $0 (stand-in · sin API)`);
console.log(`bitácoras · ${LOGS}`);
console.log(`marcas de despertar · ${MARCAS} (${marcas().length} invocaciones reales)`);
if (fallados.length) {
  console.log(`\n❌ FALLARON:\n${fallados.map((f) => `  · ${f.n} · ${f.det ?? ''}`).join('\n')}`);
  process.exit(1);
}
console.log('\n✅ TODO VERDE · reporte-no-gatilla ✓ · el despertar ya no es ciego.');
