// RedAquario · DEMO dry-run · corre 3 mensajes de ejemplo por el pipeline COMPLETO
// y muestra QUÉ HARÍA (sin despertar a nadie · sin postear · sin llaves · $0).
//
// Uso:  node tools/redaquario/demo.js
//
// Prueba: (1) un DESPACHO real → habría despertado al CC · (2) un reporte [FROM-CC#N] →
// habría despertado a Lenovo-exec · (3) una etiqueta DENTRO del texto → inerte (no dispara).

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

import { manejarMensaje } from './portero.js';
import { Torre } from './lib/torre.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));
// Config de demo con worktrees de juguete (para que planSpawn no falle en la demostración).
const demoConfig = {
  ...config,
  dry_run: true,
  cc_worktrees: { 'CC#1': '/demo/cc1', 'CC#2': '/demo/cc2', 'CC#3': '/demo/cc3' },
  lenovo_exec_cwd: '/demo/lenovo',
};

const AHORA = 1784662200; // epoch fijo (demo determinista · sin Date.now)

const ejemplos = [
  {
    titulo: '1 · DESPACHO CC#3 (autorizado · comando anclado al inicio)',
    msg: {
      ts: '1784662101.000001',
      author: 'U0AQ3N967SB',
      text: 'DESPACHO CC#3 · RedAquario Fase 2 · sos owner.\nPlan · zr-vault/raw/tasks/ejemplo.md\nWorktree · ../zero-risk-platform-cc3-redaquario\nStandby al reportar.',
    },
  },
  {
    titulo: '2 · [FROM-CC1] reporte (despertaría al ejecutor Lenovo)',
    msg: {
      ts: '1784662102.000002',
      author: 'U0AQ3N967SB',
      text: '[FROM-CC1] #296 MERGED · MCP Apify en main. GO Lenovo cumplido · CI-gated.',
    },
  },
  {
    titulo: '3 · etiqueta DENTRO del texto (inerte · no dispara · spec §2)',
    msg: {
      ts: '1784662103.000003',
      author: 'U0AQ3N967SB',
      text: 'Registro de la cola: el mensaje "DESPACHO CC#2" quedó pendiente ayer, lo cito acá.',
    },
  },
];

const state = {
  processed_ts: new Set(),
  last_ts: '1784662100.000000',
  stopped: false,
  frenado: false,
  arranques: [],
};
const torre = new Torre(demoConfig);

console.log('════════════════════════════════════════════════════════════');
console.log(' RedAquario · DEMO DRY-RUN · nada se despierta · $0');
console.log('════════════════════════════════════════════════════════════\n');

for (const ej of ejemplos) {
  console.log(`── ${ej.titulo}`);
  const { decision } = manejarMensaje(ej.msg, state, demoConfig, {
    torre,
    now_epoch: AHORA,
    logger: (s) => console.log(`   ${s}`),
  });
  console.log(`   → acción=${decision.action}  gate=${decision.gate ?? '—'}  (${decision.reason})\n`);
}

console.log('── cronómetros de la torre (tick a +35 min · vuelo demorado):');
for (const p of torre.tick(AHORA + 35 * 60)) console.log(`   ${p.texto}`);

console.log('\n✅ demo completa · 0 arranques reales · 0 posts · 0 gasto.');
