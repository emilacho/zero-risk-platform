// RedAquario · PILAR B · "gritar, no morir callado" (§144 · fix mínimo 2026-07-24).
// El post-mortem: la sesión despertada a las 18:19 murió MUDA y el portero no se enteró
// (stdio:'ignore' + detached + unref · CERO handler de salida → saldo agotado, crash, negativa
// y trabajo completo eran indistinguibles). Acá se congela el veredicto mecánico de salida.

import { describe, it, expect } from 'vitest';
import { clasificarSalida, execSpawn, planSpawn, nombreBitacora, cmdQuote } from '../lib/spawner.js';

const CONFIG = {
  claude_cmd: 'claude',
  cc_worktrees: { 'CC#3': '/wt/cc3' },
};
const ENCARGO = 'hacé X\nPlan · zr-vault/raw/tasks/x.md';

function fakeChild(pid = 4321) {
  const h = {};
  return { pid, on: (ev, cb) => { h[ev] = cb; }, unref: () => {}, _emit: (ev, ...a) => h[ev]?.(...a) };
}

describe('clasificarSalida · veredicto mecánico (cero LLM · cero criterio editorial)', () => {
  it('exit ≠ 0 → 🔴 muerto', () => {
    const v = clasificarSalida({ code: 3, ms: 120000, salida: '', umbralSeg: 45 });
    expect(v.nivel).toBe('🔴');
    expect(v.estado).toBe('muerto');
    expect(v.motivo).toMatch(/código 3/);
  });

  it('muerte por señal → 🔴 muerto (con la señal en el motivo)', () => {
    const v = clasificarSalida({ code: null, signal: 'SIGKILL', ms: 90000, salida: '', umbralSeg: 45 });
    expect(v.nivel).toBe('🔴');
    expect(v.motivo).toMatch(/SIGKILL/);
  });

  it('exit = 0 pero MUERTE-RÁPIDA (< umbral) → 🔴 · el caso del saldo en cero', () => {
    const v = clasificarSalida({ code: 0, ms: 1800, salida: '', umbralSeg: 45 });
    expect(v.nivel).toBe('🔴');
    expect(v.estado).toBe('muerte-rapida');
    expect(v.motivo).toMatch(/umbral 45s/);
  });

  it('muerte-rápida GANA aunque la salida traiga un [FROM-CC] (murió antes de trabajar)', () => {
    const v = clasificarSalida({ code: 0, ms: 900, salida: '[FROM-CC3] listo', umbralSeg: 45 });
    expect(v.nivel).toBe('🔴');
    expect(v.estado).toBe('muerte-rapida');
  });

  it('exit = 0 · duró · SIN [FROM-CC] → ⚠️ mudo · EL BUG DEL POST-MORTEM', () => {
    const v = clasificarSalida({ code: 0, ms: 600000, salida: 'trabajé un rato y me apagué', umbralSeg: 45 });
    expect(v.nivel).toBe('⚠️');
    expect(v.estado).toBe('mudo');
    expect(v.reporto).toBe(false);
    expect(v.motivo).toMatch(/NUNCA reportó/);
  });

  it('exit = 0 · duró · CON [FROM-CC] → ✅ aterrizó', () => {
    const v = clasificarSalida({ code: 0, ms: 600000, salida: '...\n[FROM-CC#3] entregado · evidencia §148', umbralSeg: 45 });
    expect(v.nivel).toBe('✅');
    expect(v.estado).toBe('aterrizo');
    expect(v.reporto).toBe(true);
  });

  it('acepta las dos grafías del reporte en la salida', () => {
    expect(clasificarSalida({ code: 0, ms: 60000, salida: '[FROM-CC1] ok' }).reporto).toBe(true);
    expect(clasificarSalida({ code: 0, ms: 60000, salida: '[FROM-CC#1] ok' }).reporto).toBe(true);
  });
});

describe('execSpawn · el despertar deja de ser CIEGO', () => {
  function correr({ code, signal, msTranscurridos, salida }) {
    const child = fakeChild(777);
    let t = 1_000_000;
    const visto = [];
    const r = execSpawn(planSpawn('CC#3', ENCARGO, CONFIG), {
      dryRun: false,
      spawnFn: () => child,
      logger: () => {},
      onExit: (v) => visto.push(v),
      logDir: '/fake/logs',
      umbralMuerteRapidaSeg: 45,
      nowMs: () => t,
      abrirLogFn: () => ({ path: '/fake/logs/x.log', fd: -1 }),
      leerColaFn: () => salida,
    });
    t += msTranscurridos;
    child._emit('exit', code, signal);
    return { r, visto };
  }

  it('registra on(exit) y emite veredicto ✅ cuando la sesión trabajó y reportó', () => {
    const { r, visto } = correr({ code: 0, msTranscurridos: 600000, salida: '[FROM-CC#3] listo' });
    expect(r.spawned).toBe(true);
    expect(visto).toHaveLength(1);
    expect(visto[0].nivel).toBe('✅');
    expect(visto[0].cc).toBe('CC#3');
    expect(visto[0].pid).toBe(777);
    expect(visto[0].bitacora).toBe('/fake/logs/x.log');
  });

  it('emite ⚠️ cuando la sesión termina OK pero NUNCA reporta (la muerte muda del 18:19)', () => {
    const { visto } = correr({ code: 0, msTranscurridos: 600000, salida: 'ruido sin reporte' });
    expect(visto[0].nivel).toBe('⚠️');
    expect(visto[0].estado).toBe('mudo');
  });

  it('emite 🔴 cuando la sesión muere rápido (saldo / crash / negativa)', () => {
    const { visto } = correr({ code: 0, msTranscurridos: 1500, salida: '' });
    expect(visto[0].nivel).toBe('🔴');
    expect(visto[0].estado).toBe('muerte-rapida');
  });

  it('emite 🔴 con el código cuando la sesión sale con error', () => {
    const { visto } = correr({ code: 137, msTranscurridos: 5000, salida: '' });
    expect(visto[0].nivel).toBe('🔴');
    expect(visto[0].code).toBe(137);
  });

  it('un onExit que explota NO tumba al portero (fallo-seguro se mantiene)', () => {
    const child = fakeChild();
    execSpawn(planSpawn('CC#3', ENCARGO, CONFIG), {
      dryRun: false, spawnFn: () => child, logger: () => {},
      onExit: () => { throw new Error('boom-onExit'); },
      nowMs: () => 0,
    });
    // Si execSpawn no blindara el callback, este emit propagaría y el test fallaría.
    expect(() => child._emit('exit', 0, null)).not.toThrow();
  });

  it('si la bitácora no se puede abrir, el despertar SIGUE (el aviso importa menos que el arranque)', () => {
    const child = fakeChild();
    const logs = [];
    const r = execSpawn(planSpawn('CC#3', ENCARGO, CONFIG), {
      dryRun: false, spawnFn: () => child, logger: (s) => logs.push(s), logDir: '/fake',
      abrirLogFn: () => { throw new Error('disco lleno'); }, nowMs: () => 0,
    });
    expect(r.spawned).toBe(true);
    expect(logs.join('\n')).toMatch(/bitácora del despacho no se pudo abrir/);
  });
});

// Hallazgo de la prueba viva 2026-07-24: con shell:true Node concatena SIN comillar y la ruta
// del repo tiene espacios → cmd.exe moría al instante (código 1) y hasta el PILAR B nadie se enteraba.
describe('camino degradado shell:true · comillado propio', () => {
  it('comilla rutas con espacios (la causa de la muerte instantánea)', () => {
    expect(cmdQuote('C:/Users/emili/Documents/Claude/Projects/Agentic Business Agency/x.cmd'))
      .toBe('"C:/Users/emili/Documents/Claude/Projects/Agentic Business Agency/x.cmd"');
  });
  it('deja intactas las rutas sin espacios', () => {
    expect(cmdQuote('C:\\bin\\claude.cmd')).toBe('C:\\bin\\claude.cmd');
  });
  it('escapa los saltos de línea (cmd.exe no los admite en la línea de comando)', () => {
    expect(cmdQuote('DESPACHO\nPlan · x.md')).toBe('"DESPACHO\\nPlan · x.md"');
  });
  it('duplica las comillas internas al estilo cmd.exe', () => {
    expect(cmdQuote('decí "hola" fuerte')).toBe('"decí ""hola"" fuerte"');
  });
  it('execSpawn comilla SOLO en el camino shell (sin shell van crudos)', () => {
    const capturado = [];
    const spawnFn = (cmd, args) => { capturado.push({ cmd, args }); return { pid: 1, on: () => {}, unref: () => {} }; };
    const plan = planSpawn('CC#3', ENCARGO, { ...CONFIG, claude_cmd: 'C:/con espacio/claude.cmd' });
    execSpawn(plan, { dryRun: false, spawnFn, shell: true, logger: () => {} });
    execSpawn(plan, { dryRun: false, spawnFn, shell: false, logger: () => {} });
    expect(capturado[0].cmd).toBe('"C:/con espacio/claude.cmd"');
    expect(capturado[0].args[1]).not.toContain('\n');
    expect(capturado[1].cmd).toBe('C:/con espacio/claude.cmd');
    expect(capturado[1].args[1]).toContain('\n'); // sin shell el encargo va tal cual
  });
});

describe('nombreBitacora · determinista y seguro para el filesystem', () => {
  it('sin dos puntos ni caracteres prohibidos en Windows', () => {
    const n = nombreBitacora('CC#3', Date.UTC(2026, 6, 24, 18, 19, 5));
    expect(n).toBe('2026-07-24T18-19-05-000Z-CC3.log');
    expect(n).not.toMatch(/[:*?"<>|]/);
  });
});
