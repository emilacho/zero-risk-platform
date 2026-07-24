// RedAquario · tests del SPAWNER · foco en el FALLO-SEGURO (§144 · el punto crítico):
// un despertar que falla NUNCA propaga ni tumba al portero.

import { describe, it, expect } from 'vitest';
import { planSpawn, planWakeLenovo, execSpawn, encargoTieneDoc, LINEA_PROTOCOLO } from '../lib/spawner.js';

const CONFIG = {
  claude_cmd: 'claude',
  cc_worktrees: { 'CC#3': '/wt/cc3' },
  lenovo_exec_cwd: '/wt/lenovo',
};
// Todo despacho válido apunta a un doc de vault (PILAR A · canon §4.1).
const ENCARGO = 'hacé X · sos owner\nPlan · zr-vault/raw/tasks/x.md';

function fakeChild(pid = 4321) {
  const h = {};
  return { pid, on: (ev, cb) => { h[ev] = cb; }, unref: () => {}, _emit: (ev, ...a) => h[ev]?.(...a) };
}

describe('planSpawn / planWakeLenovo', () => {
  it('planSpawn arma el comando con la línea de protocolo', () => {
    const p = planSpawn('CC#3', 'hacé X\nplan · vault/y.md', CONFIG);
    expect(p.ok).toBe(true);
    expect(p.cwd).toBe('/wt/cc3');
    expect(p.args[0]).toBe('-p');
    expect(p.args[2]).toBe('--dangerously-skip-permissions');
    expect(p.encargo).toContain(LINEA_PROTOCOLO);
  });
  it('planSpawn sin worktree mapeado → ok:false', () => {
    const p = planSpawn('CC#9', 'x', CONFIG);
    expect(p.ok).toBe(false);
    expect(p.error).toMatch(/sin worktree/);
  });
  it('planWakeLenovo usa lenovo_exec_cwd', () => {
    expect(planWakeLenovo('CC#3', CONFIG).cwd).toBe('/wt/lenovo');
  });
});

// ── PILAR A · doc autosuficiente (§144 · post-mortem "murió muda") ─────────
describe('PILAR A · un despacho SIN doc de vault no despierta a nadie', () => {
  it('encargoTieneDoc detecta el puntero .md', () => {
    expect(encargoTieneDoc('Plan · zr-vault/raw/findings/x.md')).toBe(true);
    expect(encargoTieneDoc('hacé la tarea y avisá')).toBe(false);
    expect(encargoTieneDoc('')).toBe(false);
    expect(encargoTieneDoc(null)).toBe(false);
  });
  it('planSpawn sin .md en el encargo → ok:false con el motivo canónico', () => {
    const p = planSpawn('CC#3', 'arreglá lo de ayer, ya sabés cuál', CONFIG);
    expect(p.ok).toBe(false);
    expect(p.error).toMatch(/SIN doc de vault/);
  });
  it('el rechazo GRITA · execSpawn lo manda a onError · nunca queda mudo', () => {
    let err = null;
    const r = execSpawn(planSpawn('CC#3', 'sin doc', CONFIG),
      { dryRun: false, spawnFn: () => fakeChild(), onError: (m) => { err = m; }, logger: () => {} });
    expect(r.spawned).toBe(false);
    expect(err).toMatch(/SIN doc de vault/);
  });
  it('exigir_doc_vault:false permite el bypass explícito (escape hatch documentado)', () => {
    const p = planSpawn('CC#3', 'sin doc', { ...CONFIG, exigir_doc_vault: false });
    expect(p.ok).toBe(true);
  });
  it('la línea de protocolo ordena leer el doc ANTES y reportar SIEMPRE', () => {
    expect(LINEA_PROTOCOLO).toMatch(/ANTES DE ACTUAR/);
    expect(LINEA_PROTOCOLO).toMatch(/autosuficiente/);
    expect(LINEA_PROTOCOLO).toMatch(/REPORTÁ SIEMPRE/);
    expect(LINEA_PROTOCOLO).toMatch(/bloqueado/);
    expect(LINEA_PROTOCOLO).toMatch(/\[FROM-CC#N\]/);
  });
});

describe('execSpawn · DRY-RUN', () => {
  it('no spawnea · loguea lo que HARÍA', () => {
    let spawned = false;
    const logs = [];
    const r = execSpawn(planSpawn('CC#3', ENCARGO, CONFIG),
      { dryRun: true, spawnFn: () => { spawned = true; }, logger: (s) => logs.push(s) });
    expect(spawned).toBe(false);
    expect(r.spawned).toBe(false);
    expect(logs.join('\n')).toContain('[DRY-RUN]');
  });
});

describe('execSpawn · VIVO éxito', () => {
  it('spawnea → spawned:true + pid · sin onError', () => {
    let err = null;
    const r = execSpawn(planSpawn('CC#3', ENCARGO, CONFIG),
      { dryRun: false, spawnFn: () => fakeChild(999), onError: (m) => { err = m; }, logger: () => {} });
    expect(r.spawned).toBe(true);
    expect(r.pid).toBe(999);
    expect(err).toBeNull();
  });
});

describe('execSpawn · FALLO-SEGURO (el crítico)', () => {
  it('spawnFn THROWS (sync) → capturado · onError · NO propaga · SIGUE', () => {
    let err = null;
    // Si execSpawn propagara, esta línea lanzaría y el test fallaría.
    const r = execSpawn(planSpawn('CC#3', ENCARGO, CONFIG),
      { dryRun: false, spawnFn: () => { throw new Error('boom-sync'); }, onError: (m) => { err = m; }, logger: () => {} });
    expect(r.spawned).toBe(false);
    expect(err).toContain('boom-sync');
  });

  it("child emite 'error' (ENOENT async) → onError con el código · NO tumba", () => {
    let err = null;
    const child = fakeChild();
    const r = execSpawn(planSpawn('CC#3', ENCARGO, CONFIG),
      { dryRun: false, spawnFn: () => child, onError: (m) => { err = m; }, logger: () => {} });
    expect(r.spawned).toBe(true); // el spawn "arrancó" · el fallo llega async
    const e = new Error('spawn claude ENOENT'); e.code = 'ENOENT';
    child._emit('error', e); // simula el ejecutable ausente
    expect(err).toContain('ENOENT');
  });

  it('plan inválido (sin worktree) → onError · NO throw', () => {
    let err = null;
    const r = execSpawn(planSpawn('CC#9', 'x', CONFIG),
      { dryRun: false, spawnFn: () => fakeChild(), onError: (m) => { err = m; }, logger: () => {} });
    expect(r.spawned).toBe(false);
    expect(err).toMatch(/plan inválido/);
  });
});
