// RedAquario · PORTERO · entry point (spec §Pieza A).
// Slack Bolt Socket Mode (túnel saliente · sin puertos abiertos). Escucha #equipo,
// pasa cada mensaje por las 7 compuertas (lib/gates.js) y actúa.
//
// MODO por default = DRY-RUN (config.dry_run=true en el repo · loguea, no despierta).
// LIVE se activa por ENV explícito (REDAQUARIO_LIVE=1) → el default committeado queda SEGURO:
// ningún arranque accidental sin la intención explícita + GO. (spec: "flip a vivo = config explícita + GO").
//
// JAMÁS toca run-sdk ni n8n (spec). Sólo Slack + child_process (en vivo) + log local + latido.
//
// Uso:
//   node tools/redaquario/portero.js                 (DRY-RUN · escucha, no despierta)
//   REDAQUARIO_LIVE=1 REDAQUARIO_CAP_HORA=1 node tools/redaquario/portero.js   (VIVO supervisado)
// Requiere en vivo (.env): SLACK_APP_TOKEN=xapp-… · SLACK_BOT_TOKEN=xoxb-… · HEALTHCHECKS_PING_URL=…

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

import { evaluate } from './lib/gates.js';
import { planSpawn, planWakeLenovo, execSpawn } from './lib/spawner.js';
import { Torre, pingCosto } from './lib/torre.js';
import { arrancarLatido } from './latido.js';
import { appendAudit } from './lib/audit.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function cargarEnv() {
  const p = path.join(__dirname, '.env');
  if (!fs.existsSync(p)) return;
  for (const linea of fs.readFileSync(p, 'utf8').split('\n')) {
    const t = linea.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i === -1) continue;
    const k = t.slice(0, i).trim();
    if (process.env[k] === undefined) process.env[k] = t.slice(i + 1).trim();
  }
}

function loadConfig() {
  const p = path.join(__dirname, 'config.json');
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function killSwitchPresente(config) {
  const f = path.join(__dirname, config.kill_switch_file || 'PORTERO_OFF');
  return fs.existsSync(f);
}

/**
 * manejarMensaje — el núcleo reutilizable (lo comparten portero vivo, demo y tests).
 * Corre evaluate() y ejecuta la acción respetando dry_run. Devuelve la decisión + logs.
 * deps.torrePost(texto) → postea el ping de telemetría a #torre-de-control (solo en vivo).
 */
function manejarMensaje(msg, state, config, deps = {}) {
  const logger = deps.logger || ((s) => console.log(s));
  const dryRun = config.dry_run !== false;
  const spawnFn = deps.spawnFn || spawn;
  const now = deps.now_epoch ?? state.now_epoch;

  state.now_epoch = now;
  state.kill_switch = killSwitchPresente(config);

  const decision = evaluate(msg, state, config);
  const logs = [];
  const log = (s) => { logs.push(s); logger(s); };
  const torrePost = deps.torrePost;

  switch (decision.action) {
    case 'ignore':
      break;

    case 'alert':
      log(`${decision.emoji || '🔴'} ALERTA · ${decision.reason}`);
      torrePost?.(`${decision.emoji || '🔴'} RedAquario · ${decision.reason}`);
      break;

    case 'stop':
      state.stopped = true;
      log('🛑 STOP de Emilio · portero FRENADO · se reactiva solo con GO de Emilio.');
      torrePost?.('🛑 RedAquario · STOP de Emilio · despertadas FRENADAS hasta GO.');
      state.processed_ts.add(msg.ts);
      state.last_ts = msg.ts;
      break;

    case 'go':
      state.stopped = false;
      log('✅ GO de Emilio · portero REACTIVADO.');
      torrePost?.('✅ RedAquario · GO de Emilio · despertadas REACTIVADAS.');
      state.processed_ts.add(msg.ts);
      state.last_ts = msg.ts;
      break;

    case 'gobernanza':
      if (decision.signal === 'FRENEN') state.frenado = true;
      if (decision.signal === 'EJECUTEN' || decision.signal === 'APROBADO_EJECUTEN') state.frenado = false;
      {
        const plan = planWakeLenovo('Lenovo-exec', config);
        execSpawn({ ...plan, cc: 'Lenovo-exec' }, { dryRun, logger: log, spawnFn });
        log(`   ↳ señal de mando: ${decision.signal}`);
      }
      registrarArranque(state, 'gobernanza', now);
      state.processed_ts.add(msg.ts);
      state.last_ts = msg.ts;
      break;

    case 'spawn_cc': {
      if (state.frenado) {
        log(`⏸️ FRENEN activo · no se abren despachos nuevos · ${decision.cc} en espera.`);
        state.processed_ts.add(msg.ts);
        state.last_ts = msg.ts;
        break;
      }
      const plan = planSpawn(decision.cc, decision.payload, config);
      execSpawn(plan, { dryRun, logger: log, spawnFn });
      if (deps.torre) { const p = deps.torre.despego(decision.cc, primeraLinea(decision.payload), now); log(p); torrePost?.(p); }
      registrarArranque(state, 'despacho', now);
      state.processed_ts.add(msg.ts);
      state.last_ts = msg.ts;
      break;
    }

    case 'wake_lenovo': {
      const plan = planWakeLenovo(decision.cc, config);
      execSpawn({ ...plan, cc: 'Lenovo-exec' }, { dryRun, logger: log, spawnFn });
      if (deps.torre) { const p = deps.torre.aterrizo(decision.cc, 'reporte recibido', 0, now); log(p); torrePost?.(p); }
      registrarArranque(state, 'reporte', now);
      state.processed_ts.add(msg.ts);
      state.last_ts = msg.ts;
      break;
    }
  }

  if (decision.action !== 'ignore' && deps.auditPath) {
    appendAudit(deps.auditPath, { action: decision.action, ts: msg.ts, author: msg.author,
      gate: decision.gate, cc: decision.cc, signal: decision.signal, dryRun }, isoDe(now));
  }

  return { decision, logs };
}

function registrarArranque(state, type, nowEpoch) {
  state.arranques = state.arranques || [];
  state.arranques.push({ type, ts_epoch: nowEpoch });
}
function primeraLinea(txt) {
  return String(txt ?? '').split('\n', 1)[0].trim().slice(0, 60) || 'tarea';
}
function isoDe(epochSec) {
  return new Date(epochSec * 1000).toISOString();
}

// ── Arranque vivo (Socket Mode) · sólo se ejecuta si se corre el archivo directo ──
async function main() {
  cargarEnv();
  const config = loadConfig();

  // LIVE sólo con intención EXPLÍCITA por env · el default committeado (dry_run:true) queda seguro.
  const liveEnv = process.env.REDAQUARIO_LIVE === '1';
  const dryRun = liveEnv ? false : config.dry_run !== false;
  const capHora = process.env.REDAQUARIO_CAP_HORA
    ? Number(process.env.REDAQUARIO_CAP_HORA)
    : (config.topes?.arranques_por_hora ?? 4);

  console.log(`RedAquario · PORTERO arrancando · MODO=${dryRun ? 'DRY-RUN (escucha · no despierta)' : 'VIVO'} · tope=${capHora}/hora`);

  const appToken = process.env.SLACK_APP_TOKEN;
  const botToken = process.env.SLACK_BOT_TOKEN;
  if (!appToken || !botToken) {
    console.error('Faltan SLACK_APP_TOKEN / SLACK_BOT_TOKEN. Ver INSTRUCTIVO.md.');
    process.exit(1);
  }

  const { App } = await import('@slack/bolt');
  const app = new App({ token: botToken, appToken, socketMode: true });

  // Config de corrida: aplica el tope de esta fase + el modo (sin mutar config.json).
  const runCfg = { ...config, dry_run: dryRun, topes: { ...config.topes, arranques_por_hora: capHora } };

  // Estado PERSISTENTE entre mensajes (NO spread · para que STOP/dedup/cap sobrevivan).
  const state = {
    processed_ts: new Set(),
    last_ts: String(Math.floor(Date.now() / 1000)), // marca de agua: sólo lo nuevo
    stopped: false,
    frenado: false,
    arranques: [],
    now_epoch: Math.floor(Date.now() / 1000),
  };
  const torre = new Torre(runCfg);
  const auditPath = path.join(__dirname, 'logs', 'redaquario-audit.jsonl');

  // Telemetría → #torre-de-control (solo en vivo · mecánica · cero LLM).
  const torrePost = dryRun
    ? undefined
    : async (texto) => {
        try { await app.client.chat.postMessage({ channel: runCfg.canal_torre, text: texto }); }
        catch (e) { console.error('torre post fail ·', e?.data?.error || e?.message); }
      };

  app.message(async ({ message }) => {
    if (message.subtype) return; // ignora ediciones/joins/etc.
    if (message.channel !== runCfg.canal_equipo) return; // comandos solo desde #equipo
    console.log(`👂 oído #equipo · autor=${message.user} · "${(message.text || '').slice(0, 55)}"`);
    const msg = { ts: message.ts, author: message.user, text: message.text || '' };
    state.now_epoch = Math.floor(Date.now() / 1000);
    manejarMensaje(msg, state, runCfg, { torre, auditPath, torrePost, spawnFn: spawn, logger: (s) => console.log(s) });
  });

  await app.start();

  // LATIDO · ping a Healthchecks cada N min (dead-man switch · spec §Pieza C).
  const hcUrl = process.env.HEALTHCHECKS_PING_URL || config.healthchecks_ping_url;
  arrancarLatido({
    url: hcUrl,
    intervaloMin: config.latido_intervalo_min ?? 5,
    dryRun,
    logger: (s) => console.log(s),
  });

  console.log(`RedAquario · VIVO=${!dryRun} · escuchando #equipo (${runCfg.canal_equipo}) · latido→${hcUrl ? 'ON' : 'sin-URL'} · ${pingCosto('operación $0 · Socket Mode')}`);
}

const esEntry = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (esEntry) {
  main().catch((e) => { console.error(e); process.exit(1); });
}

export { manejarMensaje, loadConfig, killSwitchPresente, cargarEnv };
