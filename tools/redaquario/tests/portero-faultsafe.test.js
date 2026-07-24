// RedAquario · test de INTEGRACIÓN del fallo-seguro a nivel handler (manejarMensaje).
// Un DESPACHO cuyo spawn falla → manejarMensaje NO lanza · emite alerta 🔴 a la torre · el portero sigue.

import { describe, it, expect } from 'vitest';
import { manejarMensaje } from '../portero.js';

const EMILIO = 'U0AQ3N967SB';
const CONFIG = {
  dry_run: false, // VIVO · para ejercer el camino real de spawn
  canal_equipo: 'C0B2QCDMV7Y',
  cuentas_emilio: [EMILIO],
  remitentes_autorizados: [EMILIO],
  topes: { arranques_por_hora: 1 },
  claude_cmd: 'claude',
  cc_worktrees: { 'CC#3': '/wt/cc3' },
  kill_switch_file: 'PORTERO_OFF_NOEXISTE_TEST',
};

function freshState() {
  return { processed_ts: new Set(), last_ts: '0', stopped: false, frenado: false, arranques: [], now_epoch: 1784900000 };
}

describe('handler fallo-seguro', () => {
  it('DESPACHO con spawn que THROWS → NO propaga · alerta a la torre · procesa la decisión', () => {
    const torrePosts = [];
    const msg = { ts: '1784900100.1', author: EMILIO, text: 'DESPACHO CC#3 · x\nplan' };
    // Si manejarMensaje propagara la excepción del spawn, esta llamada lanzaría.
    const { decision } = manejarMensaje(msg, freshState(), CONFIG, {
      spawnFn: () => { throw new Error('exec-ausente'); },
      torrePost: (t) => torrePosts.push(t),
      logger: () => {},
    });
    expect(decision.action).toBe('spawn_cc');                 // la decisión se tomó
    expect(torrePosts.some((t) => t.includes('🔴') && t.includes('FALLÓ'))).toBe(true); // alertó
    // llegar hasta acá = el handler NO se cayó
  });

  it('tras un despertar fallido, el portero SIGUE procesando el próximo mensaje', () => {
    const state = freshState();
    manejarMensaje({ ts: '1784900200.1', author: EMILIO, text: 'DESPACHO CC#3 · a\np' }, state, CONFIG,
      { spawnFn: () => { throw new Error('boom'); }, torrePost: () => {}, logger: () => {} });
    // El siguiente mensaje (inerte) se procesa normal → prueba de vida.
    const r2 = manejarMensaje({ ts: '1784900300.1', author: EMILIO, text: 'hola equipo' }, state, CONFIG,
      { spawnFn: () => { throw new Error('boom'); }, logger: () => {} });
    expect(r2.decision.action).toBe('ignore');
    expect(r2.decision.gate).toBe('comando');
  });
});
