// RedAquario · GOLDEN · mensajes reales del canal #equipo → decisión esperada.
// Si un cambio de código altera estas decisiones, este test rojo lo caza (silueta §144 congelada).

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluate } from '../lib/gates.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(readFileSync(path.join(__dirname, 'fixtures', 'mensajes-golden.json'), 'utf8'));

const EMILIO = 'U0AQ3N967SB';
const CONFIG = {
  remitentes_autorizados: [EMILIO, 'U_BOT_EQUIPO'],
  cuentas_emilio: [EMILIO],
  topes: { arranques_por_hora: 4 },
};

function freshState() {
  return {
    processed_ts: new Set(),
    last_ts: '0', // sin marca de agua: todos los golden son "nuevos"
    stopped: false,
    frenado: false,
    arranques: [],
    now_epoch: 1784700000,
    kill_switch: false,
  };
}

describe('Golden · mensajes reales del canal → decisión mecánica', () => {
  for (const caso of fixture.casos) {
    it(caso.titulo, () => {
      const d = evaluate(caso.msg, freshState(), CONFIG);
      expect(d.action).toBe(caso.esperado.action);
      if (caso.esperado.gate !== undefined) expect(d.gate).toBe(caso.esperado.gate);
      if (caso.esperado.cc !== undefined) expect(d.cc).toBe(caso.esperado.cc);
      if (caso.esperado.signal !== undefined) expect(d.signal).toBe(caso.esperado.signal);
    });
  }
});
