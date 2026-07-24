// RedAquario · REPORTE-NO-GATILLA (§144 · punto 3 de Emilio 18:12 · cierra el bug de las 17:36).
//
// EL BUG: un `[FROM-CC#N]` en #equipo disparaba la acción 'wake_lenovo' → arrancaba una sesión
// Lenovo-exec headless. O sea: el reporte de un empleado despertaba a otro empleado, sin orden
// humana, en cadena. El log de auditoría del 2026-07-24 tiene 4 arranques reales así
// (wake_lenovo · 15:33 · 16:19 · 17:28 + uno previo).
//
// LA REGLA: la ÚNICA etiqueta que despierta a alguien es `DESPACHO CC#N`. Un reporte es
// TELEMETRÍA: aterriza el vuelo en la torre y nada más. La cadena "seguí con lo próximo" queda
// SOLO en el vocabulario de mando de Emilio (APROBADO / EJECUTEN / FRENEN), que es humano y explícito.
//
// Estos tests fallan si alguien vuelve a cablear un spawn detrás de un reporte.

import { describe, it, expect } from 'vitest';
import { evaluate, parseCommand } from '../lib/gates.js';
import { manejarMensaje } from '../portero.js';

const EMILIO = 'U0AQ3N967SB';
const CONFIG = {
  dry_run: false, // VIVO · para ejercer el camino real (en dry-run no spawnearía igual y no probaría nada)
  canal_equipo: 'C0B2QCDMV7Y',
  cuentas_emilio: [EMILIO],
  remitentes_autorizados: [EMILIO, 'U_BOT_EQUIPO'],
  topes: { arranques_por_hora: 4 },
  claude_cmd: 'claude',
  cc_worktrees: { 'CC#1': '/wt/cc1', 'CC#3': '/wt/cc3' },
  lenovo_exec_cwd: '/wt/lenovo',
  kill_switch_file: 'PORTERO_OFF_NOEXISTE_TEST',
};

function freshState() {
  return { processed_ts: new Set(), last_ts: '0', stopped: false, frenado: false,
    arranques: [], now_epoch: 1784900000 };
}

// Espía: registra CUALQUIER intento de arrancar un proceso.
function espia() {
  const llamadas = [];
  const spawnFn = (cmd, args, opts) => {
    llamadas.push({ cmd, args, cwd: opts?.cwd });
    return { pid: 1, on: () => {}, unref: () => {} };
  };
  return { llamadas, spawnFn };
}

const REPORTES = [
  '[FROM-CC1] #296 MERGED · MCP Apify en main.',
  '[FROM-CC#1] entrega lista · evidencia §148 en el vault.',
  '[FROM-CC#3] bloqueado · sin saldo · [PARA-EMILIO].',
  '[FROM-CC2] terminé.\nEl encargo original decía: DESPACHO CC#4 · hacé Y.',
];

describe('reporte-no-gatilla · nivel decisión (compuertas)', () => {
  for (const text of REPORTES) {
    it(`decisión = 'reporte' (nunca spawn) · ${text.slice(0, 32)}…`, () => {
      const d = evaluate({ ts: '1784900100.1', author: EMILIO, text }, freshState(), CONFIG);
      expect(d.action).toBe('reporte');
      expect(d.action).not.toBe('spawn_cc');
      expect(d.action).not.toBe('wake_lenovo'); // la acción vieja quedó ELIMINADA
    });
  }

  it('la única etiqueta que despierta es DESPACHO CC#N', () => {
    const d = evaluate(
      { ts: '1784900100.2', author: EMILIO, text: 'DESPACHO CC#3 · tarea\nPlan · zr-vault/raw/tasks/x.md' },
      freshState(), CONFIG);
    expect(d.action).toBe('spawn_cc');
  });

  it('parseCommand clasifica ambas grafías como reporte', () => {
    expect(parseCommand('[FROM-CC1] x').kind).toBe('reporte');
    expect(parseCommand('[FROM-CC#1] x').kind).toBe('reporte');
    expect(parseCommand('[FROM-LENOVO] x').kind).toBe('inerte');
  });
});

describe('reporte-no-gatilla · nivel handler (prueba dura · el espía de spawn)', () => {
  for (const text of REPORTES) {
    it(`CERO procesos arrancados · ${text.slice(0, 32)}…`, () => {
      const { llamadas, spawnFn } = espia();
      const { decision } = manejarMensaje(
        { ts: '1784900200.1', author: EMILIO, text }, freshState(), CONFIG,
        { spawnFn, logger: () => {} });
      expect(decision.action).toBe('reporte');
      expect(llamadas).toHaveLength(0); // ← la prueba: NADIE se despertó
    });
  }

  it('el reporte NO consume tope de arranques (no es un arranque)', () => {
    const state = freshState();
    const { spawnFn } = espia();
    for (let i = 0; i < 6; i++) {
      manejarMensaje({ ts: `17849003${i}0.1`, author: EMILIO, text: '[FROM-CC#1] parcial' },
        state, CONFIG, { spawnFn, logger: () => {} });
    }
    expect(state.arranques).toHaveLength(0);
  });

  it('el reporte SÍ aterriza el vuelo en la torre (telemetría intacta)', () => {
    const { llamadas, spawnFn } = espia();
    const posts = [];
    const torre = { aterrizo: (cc) => `🛬 ${cc} · aterrizó`, colgado: () => {} };
    manejarMensaje({ ts: '1784900400.1', author: EMILIO, text: '[FROM-CC#1] listo' },
      freshState(), CONFIG, { spawnFn, torre, torrePost: (t) => posts.push(t), logger: () => {} });
    expect(posts.some((p) => p.includes('🛬'))).toBe(true);
    expect(llamadas).toHaveLength(0);
  });

  it('contraste · un DESPACHO SÍ arranca exactamente un proceso', () => {
    const { llamadas, spawnFn } = espia();
    manejarMensaje(
      { ts: '1784900500.1', author: EMILIO, text: 'DESPACHO CC#3 · tarea\nPlan · zr-vault/raw/tasks/x.md' },
      freshState(), CONFIG, { spawnFn, logger: () => {} });
    expect(llamadas).toHaveLength(1);
    expect(llamadas[0].cwd).toBe('/wt/cc3');
  });

  it('contraste · el vocabulario de mando de Emilio sigue despertando al ejecutor (cadena humana intacta)', () => {
    const { llamadas, spawnFn } = espia();
    manejarMensaje({ ts: '1784900600.1', author: EMILIO, text: 'EJECUTEN' },
      freshState(), CONFIG, { spawnFn, logger: () => {} });
    expect(llamadas).toHaveLength(1);
    expect(llamadas[0].cwd).toBe('/wt/lenovo');
  });
});
