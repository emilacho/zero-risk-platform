// RedAquario · STAND-IN de empleado · $0 (NO es `claude` · NO gasta saldo · NO llama a ninguna API).
// Suplanta a una sesión headless para probar EN VIVO el veredicto de salida (PILAR B) sin quemar plata.
//
// Cada invocación deja una MARCA en disco (REDAQUARIO_STANDIN_MARCAS) → prueba material de que
// alguien fue despertado. Su ausencia es la prueba de que NADIE fue despertado (reporte-no-gatilla).
//
// Modo por env REDAQUARIO_STANDIN_MODO:
//   ok-reporta    → trabaja unos segundos · imprime [FROM-CC#9] · exit 0     → esperado ✅
//   mudo          → trabaja unos segundos · NO reporta      · exit 0         → esperado ⚠️  (el bug del 18:19)
//   muerte-rapida → se muere al instante                    · exit 0         → esperado 🔴 (saldo en cero)
//   error         → escribe a stderr                        · exit 3         → esperado 🔴

import fs from 'node:fs';

const modo = process.env.REDAQUARIO_STANDIN_MODO || 'ok-reporta';
const marcas = process.env.REDAQUARIO_STANDIN_MARCAS;
const trabajoMs = Number(process.env.REDAQUARIO_STANDIN_TRABAJO_MS || 3000);

if (marcas) {
  fs.appendFileSync(
    marcas,
    `${new Date().toISOString()} · STAND-IN INVOCADO · modo=${modo} · args=${process.argv.length - 2}\n`,
    'utf8'
  );
}

if (modo === 'error') {
  process.stderr.write('stand-in: fallo simulado · credenciales rechazadas\n');
  process.exit(3);
}
if (modo === 'muerte-rapida') {
  process.stdout.write('stand-in: arranqué y me morí (simula saldo en cero)\n');
  process.exit(0);
}

setTimeout(() => {
  if (modo === 'ok-reporta') {
    process.stdout.write('stand-in: trabajé\n[FROM-CC#9] encargo cumplido · evidencia §148 · stand-in $0\n');
  } else {
    process.stdout.write('stand-in: trabajé un rato y me apagué sin avisarle a nadie\n');
  }
  process.exit(0);
}, trabajoMs);
