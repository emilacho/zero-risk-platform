// RedAquario · SPAWNER · traduce una decisión en el comando que DESPERTARÍA a un empleado.
// planSpawn es PURO (arma el comando · no ejecuta). execSpawn respeta DRY-RUN y es FALLO-SEGURO:
// un despertar que falla (ejecutable ausente · spawn error · lo que sea) → captura + alerta,
// NUNCA propaga ni tumba al portero. (§144 · aislamiento de fallos · el crítico.)
//
// Acción canónica (spec §Pieza A):
//   claude -p "<encargo + línea de protocolo>" --dangerously-skip-permissions
//   con cwd = worktree del CC (mapa fijo en config).
//
// ── FIX MÍNIMO §144 · 2026-07-24 (post-mortem "la sesión despertada murió muda") ──
// PILAR A · doc autosuficiente: un despacho SIN puntero a doc de vault NO se despierta (canon §4.1,
//   cero excepciones). El encargo ordena leer el doc ANTES de actuar y reportar SIEMPRE, aun si falla.
// PILAR B · gritar, no morir callado: el despertar deja de ser CIEGO. Cada despacho tiene su
//   bitácora propia (stdout+stderr a archivo) + `on('exit')` + veredicto mecánico:
//   exit≠0 → 🔴 · muerte-rápida (<umbral) → 🔴 · exit=0 sin `[FROM-CC]` → ⚠️ · exit=0 con reporte → ✅.
//   Antes: `stdio:'ignore'` + detached + unref y CERO handler de salida → saldo agotado, excepción,
//   negativa y trabajo completo eran INDISTINGUIBLES. El diseño garantizaba el silencio.

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

// Línea de protocolo que se anexa a TODO encargo (spec §Acción CC · reforzada por PILAR A+B).
const LINEA_PROTOCOLO =
  'ANTES DE ACTUAR · leé completo el doc del vault apuntado arriba: es autosuficiente y es tu única ' +
  'fuente de contexto (no asumas nada de ninguna conversación previa · no la tenés). ' +
  'REPORTÁ SIEMPRE en #equipo con prefijo [FROM-CC#N] · evidencia §148 · aunque quedes bloqueado, ' +
  'sin saldo o sin poder empezar: un bloqueo reportado sirve · morir callado NO. Standby al reportar.';

// Un despacho debe apuntar a un doc de vault (canon §4.1 · "ZERO EXCEPCIONES · toda tarea
// dispatchada a CC requiere vault doc"). Sin doc, la sesión headless arranca a ciegas.
const RE_DOC_VAULT = /\S+\.md\b/i;

// Marca de vida del empleado en su propia salida (ambas grafías · igual que las compuertas).
const RE_REPORTO = /\[FROM-CC#?\d+\]/;

/**
 * resolveExecutable — resuelve el ejecutable de forma robusta en Windows.
 * En Windows `claude` es un `.cmd`/`.exe`; Node.spawn sin shell NO resuelve `.cmd` en el PATH
 * (ENOENT). Estrategia: preferir el `.exe` (corre directo · sin shell · args limpios),
 * si no hay → usar el `.cmd`/`.bat` con shell:true (fallback). Override por env para tests.
 * Devuelve { file, shell }.
 */
function resolveExecutable(cmd) {
  const override = process.env.REDAQUARIO_CLAUDE_CMD;
  const target = override || cmd || 'claude';

  if (path.isAbsolute(target)) {
    return { file: target, shell: /\.(cmd|bat)$/i.test(target) };
  }
  if (process.platform !== 'win32') return { file: target, shell: false };

  try {
    const out = execSync(`where ${target}`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    const hits = out.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
    // 1) .exe en el PATH → corre directo · args multilínea limpios · sin shell.
    const exe = hits.find((p) => /\.exe$/i.test(p));
    if (exe) return { file: exe, shell: false };
    // 2) shim npm (.cmd / sin ext) → buscar el .exe hermano en node_modules (args limpios).
    for (const hit of hits) {
      const cand = path.join(path.dirname(hit), 'node_modules', '@anthropic-ai', 'claude-code', 'bin', 'claude.exe');
      if (fs.existsSync(cand)) return { file: cand, shell: false };
    }
    // 3) fallback: el .cmd/.bat con shell (args multilínea frágiles · el fallo-seguro cubre).
    const cmdHit = hits.find((p) => /\.(cmd|bat)$/i.test(p)) || hits[0];
    if (cmdHit) return { file: cmdHit, shell: true };
  } catch {
    // `where` no lo encontró → dejamos que el spawn falle y el fallo-seguro alerte.
  }
  return { file: target, shell: true };
}

/** encargoTieneDoc — PURO. ¿El despacho apunta a un doc de vault (PILAR A)? */
function encargoTieneDoc(payload) {
  return RE_DOC_VAULT.test(String(payload ?? ''));
}

/**
 * planSpawn — arma el plan de arranque de un CC. PURO.
 * Devuelve { ok, cc, cwd, cmd, args, encargo } o { ok:false, error } si falta el mapeo
 * o si el despacho no apunta a un doc de vault (PILAR A · no se despierta a nadie a ciegas).
 */
function planSpawn(cc, payload, config) {
  const cwd = config?.cc_worktrees?.[cc];
  if (!cwd) {
    return { ok: false, cc, error: `sin worktree mapeado para ${cc} en config.cc_worktrees` };
  }
  if (config?.exigir_doc_vault !== false && !encargoTieneDoc(payload)) {
    return { ok: false, cc,
      error: `despacho a ${cc} SIN doc de vault (canon §4.1) · no se despierta a nadie a ciegas` };
  }
  const encargo = `${String(payload ?? '').trim()}\n\n${LINEA_PROTOCOLO}`;
  const cmd = config?.claude_cmd ?? 'claude';
  const args = ['-p', encargo, '--dangerously-skip-permissions'];
  return { ok: true, cc, cwd, cmd, args, encargo };
}

/**
 * planWakeLenovo — arma el plan de despertar al ejecutor Lenovo headless (spec §Acción Lenovo-exec).
 * OJO: desde el fix reporte-no-gatilla, esto SÓLO lo dispara el vocabulario de mando de Emilio
 * (APROBADO / EJECUTEN / FRENEN). Un `[FROM-CC#N]` ya NO despierta a nadie.
 */
function planWakeLenovo(cc, config) {
  const cwd = config?.lenovo_exec_cwd;
  if (!cwd) return { ok: false, error: 'sin lenovo_exec_cwd en config' };
  const encargo =
    `Llegó una señal de mando de Emilio sobre ${cc} en #equipo. Registrá el estado · decidí el paso ` +
    `siguiente DENTRO del plan aprobado · despachá la próxima carta (o esperá si no hay). Gasto ` +
    `nuevo/gerencial → [PARA-EMILIO], jamás decidas solo. Apagate al terminar.`;
  const cmd = config?.claude_cmd ?? 'claude';
  const args = ['-p', encargo, '--dangerously-skip-permissions'];
  return { ok: true, cwd, cmd, args, encargo };
}

// ── PILAR B · bitácora por despacho + veredicto de salida ───────────────────

/** nombreBitacora — PURO. Nombre de archivo determinista y seguro para un despacho. */
function nombreBitacora(who, epochMs) {
  const iso = new Date(Number(epochMs) || 0).toISOString().replace(/[:.]/g, '-');
  const slug = String(who ?? 'desconocido').replace(/[^\w#]+/g, '').replace('#', '');
  return `${iso}-${slug || 'desconocido'}.log`;
}

/**
 * abrirBitacora — crea el archivo de salida del despacho y devuelve { path, fd }.
 * El fd se le pasa al hijo como stdout+stderr: la sesión headless escribe DIRECTO al archivo
 * (sin buffers en el padre · sobrevive al unref · legible en vivo mientras trabaja).
 */
function abrirBitacora(dir, who, epochMs) {
  fs.mkdirSync(dir, { recursive: true });
  const p = path.join(dir, nombreBitacora(who, epochMs));
  return { path: p, fd: fs.openSync(p, 'a') };
}

/** leerCola — últimos N caracteres de la bitácora (para el veredicto y el ping). Fallo-seguro. */
function leerCola(p, max = 4000) {
  try {
    const txt = fs.readFileSync(p, 'utf8');
    return txt.length > max ? txt.slice(-max) : txt;
  } catch {
    return '';
  }
}

/**
 * clasificarSalida — PURO · el veredicto mecánico de un despertar (cero LLM · cero criterio editorial).
 *   exit ≠ 0 · o señal            → 🔴 muerto
 *   exit = 0 pero murió < umbral  → 🔴 muerte-rápida (no alcanzó ni a arrancar · saldo/refusal/crash)
 *   exit = 0 · duró · sin [FROM]  → ⚠️ mudo (trabajó pero nunca reportó)
 *   exit = 0 · duró · con [FROM]  → ✅ aterrizó
 */
function clasificarSalida({ code, signal, ms, salida, umbralSeg = 45 } = {}) {
  const seg = Number(ms) > 0 ? Number(ms) / 1000 : 0;
  const s = seg.toFixed(1);
  const reporto = RE_REPORTO.test(String(salida ?? ''));
  if (signal) {
    return { nivel: '🔴', estado: 'muerto', reporto, seg,
      motivo: `terminado por señal ${signal} a los ${s}s` };
  }
  if (code !== 0) {
    return { nivel: '🔴', estado: 'muerto', reporto, seg,
      motivo: `salió con código ${code} a los ${s}s` };
  }
  if (seg < umbralSeg) {
    return { nivel: '🔴', estado: 'muerte-rapida', reporto, seg,
      motivo: `murió a los ${s}s (umbral ${umbralSeg}s) · ni alcanzó a trabajar` };
  }
  if (!reporto) {
    return { nivel: '⚠️', estado: 'mudo', reporto, seg,
      motivo: `terminó OK a los ${s}s pero NUNCA reportó [FROM-CC]` };
  }
  return { nivel: '✅', estado: 'aterrizo', reporto, seg,
    motivo: `terminó OK a los ${s}s y reportó [FROM-CC]` };
}

/**
 * execSpawn — ejecuta (o loguea) un plan. FALLO-SEGURO por diseño:
 *  - DRY-RUN → escribe lo que HARÍA · no spawnea.
 *  - VIVO → try/catch (error síncrono) + child.on('error') (ENOENT async) → onError(alerta) ·
 *    NUNCA propaga la excepción. Un despertar fallido jamás tumba al portero.
 *  - VIVO → child.on('exit') → veredicto mecánico → onExit(veredicto) (PILAR B · gritar).
 * opts: { dryRun, logger, spawnFn, shell, onError, onExit, logDir, umbralMuerteRapidaSeg,
 *         nowMs, abrirLogFn, leerColaFn }.
 */
function execSpawn(plan, opts = {}) {
  const {
    dryRun, logger, spawnFn, shell = false, onError, onExit,
    logDir, umbralMuerteRapidaSeg = 45,
    nowMs = () => Date.now(), abrirLogFn = abrirBitacora, leerColaFn = leerCola,
  } = opts;
  const who = plan?.cc ?? 'Lenovo-exec';
  if (!plan?.ok) {
    logger?.(`⛔ plan inválido · ${plan?.error}`);
    onError?.(`plan inválido · ${who} · ${plan?.error}`);
    return { spawned: false, dryRun, error: plan?.error };
  }
  if (dryRun) {
    logger?.(
      `[DRY-RUN] habría despertado a ${who} · cwd=${plan.cwd}\n` +
        `          ${plan.cmd} ${plan.args.map(shellQuote).join(' ')}`
    );
    return { spawned: false, dryRun: true, plan };
  }
  // Camino VIVO · blindado. Cualquier fallo → alerta + return, jamás throw hacia arriba.
  const t0 = nowMs();
  let bitacora = null;
  try {
    if (logDir) bitacora = abrirLogFn(logDir, who, t0);
  } catch (err) {
    // Sin bitácora se sigue igual (el despertar importa más que el log) · pero se avisa.
    logger?.(`⚠️ bitácora del despacho no se pudo abrir · ${who} · ${err?.message || err}`);
  }
  try {
    // Camino degradado (.cmd sin .exe): comillamos nosotros · Node NO lo hace con shell:true.
    const cmdReal = shell ? cmdQuote(plan.cmd) : plan.cmd;
    const argsReal = shell ? plan.args.map(cmdQuote) : plan.args;
    const child = spawnFn(cmdReal, argsReal, {
      cwd: plan.cwd,
      detached: true,
      // PILAR B · la salida del empleado va a SU bitácora (antes: 'ignore' → punto ciego total).
      stdio: bitacora ? ['ignore', bitacora.fd, bitacora.fd] : 'ignore',
      shell,
      windowsHide: true,
    });
    // ENOENT / ejecutable ausente llega como evento async 'error' → sin handler, TUMBA el proceso.
    child?.on?.('error', (err) => {
      logger?.(`🔴 despertar FALLÓ (async) · ${who} · ${err?.code || ''} ${err?.message || err}`);
      onError?.(`spawn error · ${who} · ${err?.code || ''} ${err?.message || err}`);
    });
    // PILAR B · el despertar deja de ser ciego: toda salida emite veredicto.
    child?.on?.('exit', (code, signal) => {
      let veredicto;
      try {
        const salida = bitacora ? leerColaFn(bitacora.path) : '';
        veredicto = clasificarSalida({ code, signal, ms: nowMs() - t0, salida, umbralSeg: umbralMuerteRapidaSeg });
      } catch (err) {
        veredicto = { nivel: '🔴', estado: 'veredicto-falló', reporto: false, seg: 0,
          motivo: `no se pudo clasificar la salida · ${err?.message || err}` };
      }
      const detalle = { ...veredicto, cc: who, code, signal, pid: child?.pid, bitacora: bitacora?.path };
      logger?.(`${veredicto.nivel} ${who} · ${veredicto.motivo}${bitacora ? ` · bitácora ${bitacora.path}` : ''}`);
      try { onExit?.(detalle); } catch (err) { logger?.(`⚠️ onExit falló · ${err?.message || err}`); }
    });
    child?.unref?.();
    logger?.(`🛫 despertado ${who} · pid=${child?.pid ?? '?'} · cwd=${plan.cwd}${bitacora ? ` · bitácora ${bitacora.path}` : ''}`);
    return { spawned: true, dryRun: false, pid: child?.pid, plan, bitacora: bitacora?.path };
  } catch (err) {
    logger?.(`🔴 despertar FALLÓ (sync) · ${who} · ${err?.message || err}`);
    onError?.(`spawn threw · ${who} · ${err?.message || err}`);
    return { spawned: false, dryRun: false, error: String(err?.message || err) };
  } finally {
    // El hijo ya heredó su copia del descriptor · el padre suelta el suyo.
    if (bitacora) { try { fs.closeSync(bitacora.fd); } catch { /* ya cerrado */ } }
  }
}

function shellQuote(s) {
  const str = String(s);
  if (/^[\w@%+=:,./-]+$/.test(str)) return str;
  return `"${str.replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`;
}

/**
 * cmdQuote — comillas para el camino DEGRADADO `shell:true` (cuando el ejecutable es un `.cmd`
 * y no hay `.exe`). Node con shell:true CONCATENA cmd+args SIN comillar: la ruta del repo tiene
 * espacios ("Agentic Business Agency") → cmd.exe cortaba en el primer espacio y el hijo moría
 * al instante con código 1. Hasta el PILAR B eso era INVISIBLE (bitácora real de la prueba viva:
 * "'C:\\Users\\...\\Agentic' is not recognized as an internal or external command").
 * cmd.exe además no admite saltos de línea reales dentro de la línea de comando → se escapan
 * como `\n` literal (el encargo se lee igual · es texto para un prompt).
 */
function cmdQuote(s) {
  const str = String(s).replace(/\r?\n/g, '\\n');
  if (/^[\w@%+=:,./\\-]+$/.test(str)) return str;
  return `"${str.replace(/"/g, '""')}"`;
}

export {
  planSpawn, planWakeLenovo, execSpawn, resolveExecutable,
  clasificarSalida, encargoTieneDoc, nombreBitacora, abrirBitacora, leerCola,
  LINEA_PROTOCOLO, shellQuote, cmdQuote,
};
