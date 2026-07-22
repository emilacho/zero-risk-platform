// RedAquario · Fase 2a · ESCUCHA SUPERVISADA (dry-run conectado en vivo).
// Socket Mode conecta REAL · el portero ESCUCHA · TODO lo que "haría" va al log ·
// despertadas y pings DESACTIVADOS (config.dry_run=true). CERO posts salvo el test previo.
//
// Qué prueba, $0:
//   1. conexión Socket Mode viva (túnel saliente) ✓
//   2. acceso de LECTURA por canal (conversations.history) → revela el gap de #equipo privado
//   3. que "ve" el mensaje de prueba posteado a #torre-de-control
//   4. los 3 comandos de prueba EN FRÍO por el pipeline (con el log · sin efectos)
//
// Uso:  node tools/redaquario/escucha.js   (con .env presente)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { manejarMensaje } from './portero.js';
import { pingHealthchecks } from './latido.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── cargar .env local (sin dep dotenv) ──────────────────────────────────────
function cargarEnv() {
  const p = path.join(__dirname, '.env');
  if (!fs.existsSync(p)) return;
  for (const linea of fs.readFileSync(p, 'utf8').split('\n')) {
    const t = linea.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i === -1) continue;
    process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
}

const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));
cargarEnv();

const log = (s) => console.log(s);
const nowEpoch = Math.floor(Date.parse('2026-07-22T00:00:00Z') / 1000); // determinista para logs

async function main() {
  const appToken = process.env.SLACK_APP_TOKEN;
  const botToken = process.env.SLACK_BOT_TOKEN;
  if (!appToken || !botToken) {
    log('⛔ faltan SLACK_APP_TOKEN / SLACK_BOT_TOKEN en .env');
    process.exit(1);
  }

  log('════════════════════════════════════════════════════════════');
  log(' RedAquario · Fase 2a · ESCUCHA SUPERVISADA (dry-run conectado)');
  log(` MODO=${config.dry_run !== false ? 'DRY-RUN (escucha · despertadas OFF · posts OFF)' : 'VIVO'}`);
  log('════════════════════════════════════════════════════════════');

  const { App } = await import('@slack/bolt');
  const app = new App({ token: botToken, appToken, socketMode: true });

  // Log en vivo de CUALQUIER mensaje que Slack empuje durante la ventana (evidencia bonus).
  app.message(async ({ message }) => {
    if (message.subtype) return;
    const canal = message.channel === config.canal_equipo ? '#equipo'
      : message.channel === config.canal_torre ? '#torre-de-control' : message.channel;
    log(`👂 [push en vivo] canal=${canal} autor=${message.user} · "${(message.text || '').slice(0, 60)}"`);
  });

  // ── 1 · conexión Socket Mode viva ──
  await app.start();
  log('\n1 · CONEXIÓN · Socket Mode conectado ✓ (túnel saliente vivo · $0)');

  // ── 2 · acceso de lectura por canal (revela el gap de #equipo privado) ──
  log('\n2 · LECTURA por canal (conversations.history · limit 5):');
  const lectura = {};
  for (const [nombre, id] of [['#torre-de-control', config.canal_torre], ['#equipo', config.canal_equipo]]) {
    try {
      const r = await app.client.conversations.history({ channel: id, limit: 5 });
      lectura[nombre] = { ok: true, n: (r.messages || []).length };
      log(`   ✓ ${nombre} (${id}) · LEE · ${r.messages.length} msgs recientes`);
    } catch (e) {
      const err = e?.data?.error || e?.message || String(e);
      lectura[nombre] = { ok: false, error: err };
      log(`   ✗ ${nombre} (${id}) · NO LEE · error="${err}"`);
    }
  }

  // ── 3 · ¿vio el mensaje de prueba de #torre-de-control? ──
  log('\n3 · ¿VE el mensaje de prueba en #torre-de-control?');
  const state = {
    processed_ts: new Set(), last_ts: '0', stopped: false, frenado: false,
    arranques: [], now_epoch: nowEpoch, kill_switch: false,
  };
  if (lectura['#torre-de-control']?.ok) {
    const r = await app.client.conversations.history({ channel: config.canal_torre, limit: 10 });
    let visto = 0;
    for (const m of (r.messages || []).reverse()) {
      if (m.subtype || !m.text) continue;
      log(`   👂 escuchó · "${m.text.slice(0, 70)}"`);
      visto++;
    }
    log(`   → ${visto} mensaje(s) leído(s) del canal público · conexión+lectura CONFIRMADA`);
  } else {
    log('   (sin lectura del canal · ver gap arriba)');
  }

  // ── 4 · los 3 comandos de prueba EN FRÍO (con el log · sin efectos) ──
  log('\n4 · 3 COMANDOS EN FRÍO (por el pipeline · dry-run · sin efectos):');
  const cfgFrio = { ...config, cc_worktrees: { 'CC#2': '/frio/cc2' }, lenovo_exec_cwd: '/frio/lenovo' };
  const fresco = () => ({ processed_ts: new Set(), last_ts: '0', stopped: false, frenado: false,
    arranques: [], now_epoch: nowEpoch, kill_switch: false });

  log('   [a] DESPACHO CC#2 de autor autorizado → debe "habría despertado":');
  const a = manejarMensaje(
    { ts: '1784700001.0001', author: 'U0AQ3N967SB', text: 'DESPACHO CC#2 · prueba en frío · sos owner.\nplan · zr-vault/x.md' },
    fresco(), cfgFrio, { logger: (s) => log('       ' + s) });
  log(`       → acción=${a.decision.action}`);

  log('   [b] etiqueta CITADA en el medio del texto → inerte:');
  const b = manejarMensaje(
    { ts: '1784700002.0002', author: 'U0AQ3N967SB', text: 'Registro: el "DESPACHO CC#2" de ayer quedó en cola, lo cito.' },
    fresco(), cfgFrio, { logger: (s) => log('       ' + s) });
  log(`       → acción=${b.decision.action} · gate=${b.decision.gate}`);

  log('   [c] STOP de cuenta NO-Emilio → ignorado + alerta en log:');
  const c = manejarMensaje(
    { ts: '1784700003.0003', author: 'U_INTRUSO_999', text: 'STOP' },
    fresco(), cfgFrio, { logger: (s) => log('       ' + s) });
  log(`       → acción=${c.decision.action} · gate=${c.decision.gate}`);

  // ── 5 · latido (si hay key de Healthchecks) ──
  log('\n5 · LATIDO (Healthchecks):');
  const hcUrl = process.env.HEALTHCHECKS_PING_URL || config.healthchecks_ping_url;
  if (hcUrl && !String(hcUrl).startsWith('REEMPLAZAR')) {
    const res = await pingHealthchecks({ url: hcUrl, dryRun: false, logger: (s) => log('   ' + s) });
    log(`   → ping ${res.ok ? 'OK' : 'FALLÓ'}`);
  } else {
    log('   → sin key/URL de Healthchecks accesible · PENDIENTE-DE-KEY (check `redaquario-latido` no creado)');
  }

  await app.stop();
  log('\n✅ escucha completa · 0 despertadas · 0 posts · $0 · desconectado limpio.');

  // Resumen máquina-legible para el reporte.
  log('\n__RESUMEN__ ' + JSON.stringify({
    socket_mode: 'conectado',
    lee_torre: lectura['#torre-de-control']?.ok || false,
    lee_equipo: lectura['#equipo']?.ok || false,
    equipo_error: lectura['#equipo']?.error || null,
    frio: { a: a.decision.action, b: b.decision.action, c: c.decision.action },
    latido: (hcUrl && !String(hcUrl).startsWith('REEMPLAZAR')) ? 'cableado' : 'pendiente-de-key',
  }));
  process.exit(0);
}

// safety net: jamás colgar el proceso
setTimeout(() => { console.log('⏱️ timeout de seguridad · saliendo'); process.exit(0); }, 30000).unref?.();

main().catch((e) => { console.error('ERROR escucha:', e?.message || e); process.exit(1); });
