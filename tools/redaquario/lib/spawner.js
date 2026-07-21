// RedAquario · SPAWNER · traduce una decisión en el comando que DESPERTARÍA a un empleado.
// planSpawn es PURO (arma el comando · no ejecuta). execSpawn respeta DRY-RUN.
// Acción canónica (spec §Pieza A):
//   claude -p "<encargo + línea de protocolo>" --dangerously-skip-permissions
//   con cwd = worktree del CC (mapa fijo en config).

// Línea de protocolo que se anexa a TODO encargo (spec §Acción CC).
const LINEA_PROTOCOLO =
  'Leé el doc del vault apuntado · reportá con prefijo [FROM-CC#N] · evidencia §148. Standby al reportar.';

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
 * planWakeLenovo — arma el plan de despertar al ejecutor Lenovo headless al recibir
 * un reporte [FROM-CC#N]. PURO. Mismos guardrails de gobernanza que el diseño (spec §Acción Lenovo-exec).
 */
function planWakeLenovo(cc, config) {
  const cwd = config?.lenovo_exec_cwd;
  if (!cwd) {
    return { ok: false, error: 'sin lenovo_exec_cwd en config' };
  }
  const encargo =
    `Llegó un reporte de ${cc} en #equipo. Registrá el reporte · decidí el paso siguiente DENTRO ` +
    `del plan aprobado · despachá la próxima carta (o esperá si no hay). Gasto nuevo/gerencial → ` +
    `[PARA-EMILIO], jamás decidas solo. Apagate al terminar.`;
  const cmd = config?.claude_cmd ?? 'claude';
  const args = ['-p', encargo, '--dangerously-skip-permissions'];
  return { ok: true, cwd, cmd, args, encargo };
}

/**
 * execSpawn — ejecuta (o loguea) un plan. En DRY-RUN escribe lo que HARÍA y NO spawnea.
 * `spawnFn` se inyecta (child_process.spawn en vivo · mock en tests).
 */
function execSpawn(plan, { dryRun, logger, spawnFn }) {
  if (!plan.ok) {
    logger?.(`⛔ plan inválido · ${plan.error}`);
    return { spawned: false, dryRun, error: plan.error };
  }
  if (dryRun) {
    logger?.(
      `[DRY-RUN] habría despertado a ${plan.cc ?? 'Lenovo-exec'} · cwd=${plan.cwd}\n` +
        `          ${plan.cmd} ${plan.args.map(shellQuote).join(' ')}`
    );
    return { spawned: false, dryRun: true, plan };
  }
  // Camino VIVO (Fase 2+ · sólo con GO explícito y config.dry_run=false).
  const child = spawnFn(plan.cmd, plan.args, { cwd: plan.cwd, detached: true, stdio: 'ignore' });
  child?.unref?.();
  logger?.(`🛫 despertado ${plan.cc ?? 'Lenovo-exec'} · pid=${child?.pid ?? '?'} · cwd=${plan.cwd}`);
  return { spawned: true, dryRun: false, pid: child?.pid, plan };
}

function shellQuote(s) {
  const str = String(s);
  if (/^[\w@%+=:,./-]+$/.test(str)) return str;
  return `"${str.replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`;
}

export { planSpawn, planWakeLenovo, execSpawn, LINEA_PROTOCOLO, shellQuote };
