// RedAquario · tests de las 7 COMPUERTAS (spec §Filtros 1..7 · §144).
// $0 · lógica pura · sin llaves · sin red. Cada compuerta tiene su prueba + los
// escenarios exigidos por el despacho (no-autorizado · comando-en-medio · dedup ·
// tope · STOP-ajeno · STOP-Emilio · kill-switch · watermark).

import { describe, it, expect } from 'vitest';
import { parseCommand, evaluate } from '../lib/gates.js';

const EMILIO = 'U0AQ3N967SB';
const CONFIG = {
  remitentes_autorizados: [EMILIO, 'U_BOT_EQUIPO'],
  cuentas_emilio: [EMILIO],
  topes: { arranques_por_hora: 4 },
};
const NOW = 1784662200;

function baseState(over = {}) {
  return {
    processed_ts: new Set(),
    last_ts: '1784662100.000000',
    stopped: false,
    frenado: false,
    arranques: [],
    now_epoch: NOW,
    kill_switch: false,
    ...over,
  };
}
function msg(over = {}) {
  return { ts: '1784662150.000001', author: EMILIO, text: 'DESPACHO CC#3 · x\nplan', ...over };
}

describe('parseCommand · anclaje al inicio (compuerta 2)', () => {
  it('DESPACHO CC#N al inicio → despacho', () => {
    const c = parseCommand('DESPACHO CC#3 · tarea\nsegunda línea');
    expect(c.kind).toBe('despacho');
    expect(c.cc).toBe('CC#3');
    expect(c.payload).toContain('segunda línea');
  });
  it('[FROM-CC#N] al inicio → reporte', () => {
    expect(parseCommand('[FROM-CC1] #296 MERGED').kind).toBe('reporte');
  });
  it('etiqueta DENTRO del texto → inerte (no dispara)', () => {
    expect(parseCommand('Nota: "DESPACHO CC#2" quedó en cola.').kind).toBe('inerte');
  });
  it('vocabulario de Emilio anclado', () => {
    expect(parseCommand('APROBADO, EJECUTEN').signal).toBe('APROBADO_EJECUTEN');
    expect(parseCommand('FRENEN ya').signal).toBe('FRENEN');
    expect(parseCommand('STOP').signal).toBe('STOP');
    expect(parseCommand('GO PORTERO').signal).toBe('GO');
  });
});

describe('Compuerta 1 · lista blanca de remitentes', () => {
  it('remitente NO autorizado con etiqueta de comando → IGNORA + alerta 🔴', () => {
    const d = evaluate(msg({ author: 'U_INTRUSO' }), baseState(), CONFIG);
    expect(d.action).toBe('alert');
    expect(d.gate).toBe('whitelist');
    expect(d.emoji).toBe('🔴');
  });
  it('remitente autorizado (bot del equipo) pasa la compuerta 1', () => {
    const d = evaluate(msg({ author: 'U_BOT_EQUIPO' }), baseState(), CONFIG);
    expect(d.action).toBe('spawn_cc');
  });
});

describe('Compuerta 2 · comando anclado', () => {
  it('sin comando al inicio → ignore gate=comando', () => {
    const d = evaluate(msg({ text: 'hola equipo, buenos días' }), baseState(), CONFIG);
    expect(d.action).toBe('ignore');
    expect(d.gate).toBe('comando');
  });
});

describe('Compuerta 3 · dedup por message_ts', () => {
  it('mismo ts ya procesado → ignore gate=dedup', () => {
    const m = msg();
    const st = baseState({ processed_ts: new Set([m.ts]) });
    const d = evaluate(m, st, CONFIG);
    expect(d.action).toBe('ignore');
    expect(d.gate).toBe('dedup');
  });
});

describe('Compuerta 4 · tope de tasa por tipo', () => {
  it('5º despacho en la hora → alerta ⚠️ (tope 4)', () => {
    const arranques = Array.from({ length: 4 }, () => ({ type: 'despacho', ts_epoch: NOW - 100 }));
    const d = evaluate(msg(), baseState({ arranques }), CONFIG);
    expect(d.action).toBe('alert');
    expect(d.gate).toBe('tope-tasa');
    expect(d.emoji).toBe('⚠️');
  });
  it('el tope es POR TIPO · 4 reportes no frenan un despacho', () => {
    const arranques = Array.from({ length: 4 }, () => ({ type: 'reporte', ts_epoch: NOW - 100 }));
    const d = evaluate(msg(), baseState({ arranques }), CONFIG);
    expect(d.action).toBe('spawn_cc');
  });
  it('arranques fuera de la ventana de 1h no cuentan', () => {
    const arranques = Array.from({ length: 4 }, () => ({ type: 'despacho', ts_epoch: NOW - 4000 }));
    const d = evaluate(msg(), baseState({ arranques }), CONFIG);
    expect(d.action).toBe('spawn_cc');
  });
});

describe('Compuerta 5 · kill-switch local (PORTERO_OFF)', () => {
  it('kill-switch presente → ignore gate=kill-switch', () => {
    const d = evaluate(msg(), baseState({ kill_switch: true }), CONFIG);
    expect(d.action).toBe('ignore');
    expect(d.gate).toBe('kill-switch');
  });
});

describe('Compuerta 6 · STOP remoto (solo Emilio)', () => {
  it('STOP de Emilio → action=stop 🛑', () => {
    const d = evaluate(msg({ text: 'STOP' }), baseState(), CONFIG);
    expect(d.action).toBe('stop');
    expect(d.emoji).toBe('🛑');
  });
  it('STOP de cuenta AJENA autorizada (bot) → IGNORADO (solo Emilio frena)', () => {
    const d = evaluate(msg({ author: 'U_BOT_EQUIPO', text: 'STOP' }), baseState(), CONFIG);
    expect(d.action).toBe('ignore');
    expect(d.gate).toBe('stop-remoto');
  });
  it('con el sistema FRENADO, un DESPACHO queda inerte hasta el GO', () => {
    const d = evaluate(msg(), baseState({ stopped: true }), CONFIG);
    expect(d.action).toBe('ignore');
    expect(d.gate).toBe('stop-remoto');
  });
  it('GO de Emilio → action=go (reactiva)', () => {
    const d = evaluate(msg({ text: 'GO PORTERO' }), baseState({ stopped: true }), CONFIG);
    expect(d.action).toBe('go');
  });
});

describe('Compuerta 7 · marca de agua', () => {
  it('mensaje anterior a la marca de agua → ignore gate=watermark', () => {
    const d = evaluate(msg({ ts: '1784662000.000000' }), baseState(), CONFIG);
    expect(d.action).toBe('ignore');
    expect(d.gate).toBe('watermark');
  });
});

describe('Gobernanza · vocabulario de Emilio (solo su cuenta)', () => {
  it('EJECUTEN de Emilio → gobernanza', () => {
    const d = evaluate(msg({ text: 'EJECUTEN' }), baseState(), CONFIG);
    expect(d.action).toBe('gobernanza');
    expect(d.signal).toBe('EJECUTEN');
  });
  it('APROBADO de cuenta ajena → ignorado', () => {
    const d = evaluate(msg({ author: 'U_BOT_EQUIPO', text: 'APROBADO' }), baseState(), CONFIG);
    expect(d.action).toBe('ignore');
    expect(d.gate).toBe('gobernanza');
  });
});

describe('Orden de compuertas · precedencia', () => {
  it('watermark gana a todo (ni siquiera evalúa autor)', () => {
    const d = evaluate(msg({ ts: '1784660000.0', author: 'U_INTRUSO' }), baseState(), CONFIG);
    expect(d.gate).toBe('watermark');
  });
  it('whitelist gana a comando (autor malo + comando bueno → alert, no spawn)', () => {
    const d = evaluate(msg({ author: 'U_INTRUSO' }), baseState(), CONFIG);
    expect(d.action).toBe('alert');
  });
});
