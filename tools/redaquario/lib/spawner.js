// RedAquario · SPAWNER · traduce una decisión en el comando que DESPERTARÍA a un empleado.
// planSpawn es PURO (arma el comando · no ejecuta). execSpawn respeta DRY-RUN y es FALLO-SEGURO:
// un despertar que falla (ejecutable ausente · spawn error · lo que sea) → captura + alerta,
// NUNCA propaga ni tumba al portero. (§144 · aislamiento de fallos · el crítico.)
//
// Acción canónica (spec §Pieza A):
//   claude -p "<encargo + línea de protocolo>" --dangerously-skip-permissions
//   con cwd = worktree del CC (mapa fijo en config).

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

// Línea de protocolo que se anexa a TODO encargo (spec §Acción CC).
const LINEA_PROTOCOLO =
  'Leé el doc del vault apuntado · reportá con prefijo [FROM-CC#N] · evidencia §148. Standby al reportar.';

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

/**
 * planSpawn — arma el plan de arranque de un CC. PURO.
 * Devuelve { ok, cc, cwd, cmd, args, encargo } o { ok:false, error } si falta el mapeo.
 */
function planSpawn(cc, payload, config) {
  const cwd = config?.cc_worktrees?.[cc];
  if (!cwd) {
    return { ok: false, cc, error: `sin worktree mapeado para ${cc} en config.cc_worktrees` };
  }
  const encargo = `${String(payload ?? '').trim()}\n\n${LINEA_PROTOCOLO}`;
  const cmd = config?.claude_cmd ?? 'claude';
  const args = ['-p', encargo, '--dangerously-skip-permissions'];
  return { ok: true, cc, cwd, cmd, args, encargo };
}

/**
 * planWakeLenovo — arma el plan de despertar al ejecutor Lenovo headless (spec §Acción Lenovo-exec).
 */
function planWakeLenovo(cc, config) {
  const cwd = config?.lenovo_exec_cwd;
  if (!cwd) return { ok: false, error: 'sin lenovo_exec_cwd en config' };
  const encargo =
    `Llegó un reporte de ${cc} en #equipo. Registrá el reporte · decidí el paso siguiente DENTRO ` +
    `del plan aprobado · despachá la próxima carta (o esperá si no hay). Gasto nuevo/gerencial → ` +
    `[PARA-EMILIO], jamás decidas solo. Apagate al terminar.`;
  const cmd = config?.claude_cmd ?? 'claude';
  const args = ['-p', encargo, '--dangerously-skip-permissions'];
  return { ok: true, cwd, cmd, args, encargo };
}

/**
 * execSpawn — ejecuta (o loguea) un plan. FALLO-SEGURO por diseño:
 *  - DRY-RUN → escribe lo que HARÍA · no spawnea.
 *  - VIVO → try/catch (error síncrono) + child.on('error') (ENOENT async) → onError(alerta) ·
 *    NUNCA propaga la excepción. Un despertar fallido jamás tumba al portero.
 * opts: { dryRun, logger, spawnFn, shell, onError }.
 */
function execSpawn(plan, { dryRun, logger, spawnFn, shell = false, onError } = {}) {
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
  try {
    const child = spawnFn(plan.cmd, plan.args, {
      cwd: plan.cwd,
      detached: true,
      stdio: 'ignore',
      shell,
      windowsHide: true,
    });
    // ENOENT / ejecutable ausente llega como evento async 'error' → sin handler, TUMBA el proceso.
    child?.on?.('error', (err) => {
      logger?.(`🔴 despertar FALLÓ (async) · ${who} · ${err?.code || ''} ${err?.message || err}`);
      onError?.(`spawn error · ${who} · ${err?.code || ''} ${err?.message || err}`);
    });
    child?.unref?.();
    logger?.(`🛫 despertado ${who} · pid=${child?.pid ?? '?'} · cwd=${plan.cwd}`);
    return { spawned: true, dryRun: false, pid: child?.pid, plan };
  } catch (err) {
    logger?.(`🔴 despertar FALLÓ (sync) · ${who} · ${err?.message || err}`);
    onError?.(`spawn threw · ${who} · ${err?.message || err}`);
    return { spawned: false, dryRun: false, error: String(err?.message || err) };
  }
}

function shellQuote(s) {
  const str = String(s);
  if (/^[\w@%+=:,./-]+$/.test(str)) return str;
  return `"${str.replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`;
}

export { planSpawn, planWakeLenovo, execSpawn, resolveExecutable, LINEA_PROTOCOLO, shellQuote };
