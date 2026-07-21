// RedAquario · PORTERO · entry point (spec §Pieza A).
// Slack Bolt Socket Mode (túnel saliente · sin puertos abiertos). Escucha #equipo,
// pasa cada mensaje por las 7 compuertas (lib/gates.js) y actúa. DRY-RUN por default:
// loguea lo que HARÍA · no despierta a nadie · no postea pings. Flip a vivo = Fase 2.
//
// JAMÁS toca run-sdk ni n8n (spec). Sólo Slack + child_process (en vivo) + log local.
//
// Uso:  node tools/redaquario/portero.js
// Requiere (SOLO en vivo · dry-run no los necesita para arrancar la lógica):
//   SLACK_APP_TOKEN=xapp-...   (app-level · connections:write)
//   SLACK_BOT_TOKEN=xoxb-...   (bot · lecturas del canal)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

import { evaluate } from './lib/gates.js';
import { planSpawn, planWakeLenovo, execSpawn } from './lib/spawner.js';
import { Torre, pingCosto } from './lib/torre.js';
import { appendAudit } from './lib/audit.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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

  switch (decision.action) {
    case 'ignore':
      // Silencio deliberado. No se audita (ruido) salvo comando bloqueado por gate duro.
      break;

    case 'alert':
      log(`${decision.emoji || '🔴'} ALERTA · ${decision.reason}`);
      break;

    case 'stop':
      state.stopped = true;
      log(`🛑 STOP de Emilio · portero FRENADO · se reactiva solo con GO de Emilio.`);
      state.processed_ts.add(msg.ts);
      state.last_ts = msg.ts;
      break;

    case 'go':
      state.stopped = false;
      log(`✅ GO de Emilio · portero REACTIVADO.`);
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
      if (deps.torre) log(deps.torre.despego(decision.cc, primeraLinea(decision.payload), now));
      registrarArranque(state, 'despacho', now);
      state.processed_ts.add(msg.ts);
      state.last_ts = msg.ts;
      break;
    }

    case 'wake_lenovo': {
      const plan = planWakeLenovo(decision.cc, config);
      execSpawn({ ...plan, cc: 'Lenovo-exec' }, { dryRun, logger: log, spawnFn });
      if (deps.torre) log(deps.torre.aterrizo(decision.cc, 'reporte recibido', 0, now));
      registrarArranque(state, 'reporte', now);
      state.processed_ts.add(msg.ts);
      state.last_ts = msg.ts;
      break;
    }
  }

  // Audit de toda acción no-ignorada (spec §Audit trail).
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
  const config = loadConfig();
  const dryRun = config.dry_run !== false;
  console.log(`RedAquario · PORTERO arrancando · MODO=${dryRun ? 'DRY-RUN (loguea, no despierta)' : 'VIVO'}`);

  const appToken = process.env.SLACK_APP_TOKEN;
  const botToken = process.env.SLACK_BOT_TOKEN;
  if (!appToken || !botToken) {
    console.error('Faltan SLACK_APP_TOKEN / SLACK_BOT_TOKEN en el entorno. Ver INSTRUCTIVO.md.');
    process.exit(1);
  }

  // Import dinámico: @slack/bolt SÓLO se carga en el camino vivo (dry-run demo/tests no lo tocan).
  const { App } = await import('@slack/bolt');
  const app = new App({ token: botToken, appToken, socketMode: true });

  const state = {
    processed_ts: new Set(),
    last_ts: String(Math.floor(Date.now() / 1000)), // marca de agua: sólo lo nuevo
    stopped: false,
    frenado: false,
    arranques: [],
  };
  const torre = new Torre(config);
  const auditPath = path.join(__dirname, config.audit_log ? path.basename(config.audit_log) : 'redaquario-audit.jsonl');

  app.message(async ({ message }) => {
    if (message.subtype) return; // ignora ediciones/joins/etc.
    if (message.channel !== config.canal_equipo) return;
    const msg = { ts: message.ts, author: message.user, text: message.text || '' };
    manejarMensaje(msg, { ...state, now_epoch: Math.floor(Date.now() / 1000) }, config, {
      torre, auditPath, logger: (s) => console.log(s),
    });
  });

  await app.start();
  console.log(`RedAquario · escuchando #equipo (${config.canal_equipo}). ${pingCosto('operación $0 · Socket Mode')}`);
}

// Ejecutar main() sólo si se corre el archivo directamente (no en import de tests).
const esEntry = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (esEntry) {
  main().catch((e) => { console.error(e); process.exit(1); });
}

export { manejarMensaje, loadConfig, killSwitchPresente };
