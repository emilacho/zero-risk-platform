// RedAquario · TORRE DE CONTROL · telemetría de estados (§144 · spec §Pieza B)
// PRINCIPIO (Emilio · §144): cero juicio de "importancia". Cada TRANSICIÓN DE ESTADO
// emite su mensaje diseñado, SIEMPRE. Detección 100% mecánica · cero LLM en los pings.
// La silueta de mensajes NO se toca sin §144 explícito (spec firma).

// ── Catálogo de pings (uno por estado · formato fijo) ───────────────────────

function pingDespego(cc, tarea, hhmm) {
  return `🛫 ${cc} · ${tarea} · despegó ${hhmm}`;
}
function pingAterrizo(cc, tarea, resultado, costoUsd) {
  return `🛬 ${cc} · ${tarea} · aterrizó OK · ${resultado} · $${fmtUsd(costoUsd)}`;
}
function pingTodosEnTierra(vuelos, proximo) {
  const lineas = vuelos.map((v) => `  · ${v.cc} · ${v.resumen}`).join('\n');
  return `✅ TODOS EN TIERRA · ${vuelos.length} vuelos\n${lineas}\npróximo: ${proximo || '—'}`;
}
function pingDemorado(cc, sinSenalMin) {
  return `⚠️ ${cc} · demorado · sin señal hace ${sinSenalMin} min`;
}
function pingColgado(cc, esperandoQue, accion) {
  return `🔴 ${cc} · colgado · ${esperandoQue} · requiere ${accion}`;
}
function pingDecision(que, opciones) {
  return `🔔 DECISIÓN · ${que} · ${opciones || 'A/B'}`;
}
function pingCosto(detalle) {
  return `💰 ${detalle}`;
}

function fmtUsd(x) {
  const n = Number(x);
  if (!Number.isFinite(n)) return '0.00';
  return n.toFixed(2);
}

function hhmm(epochSec) {
  // Formato HH:MM local mecánico (sin dependencias). epoch en segundos.
  const d = new Date(epochSec * 1000);
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

/**
 * Torre — registro de vuelos abiertos + cronómetros.
 * Estado en memoria (persistible por el caller). Toda detección es mecánica:
 * presencia/ausencia de reporte + relojes + exit codes. Ningún criterio editorial.
 */
class Torre {
  constructor(config = {}) {
    this.demoraMin = config?.cronometro_demora_min ?? 30; // umbral ⚠️ por despacho
    this.vuelos = new Map(); // cc → { cc, tarea, despego_epoch, ultimo_ping_epoch, avisado_demora }
  }

  // 🛫 Un CC despegó (spawn confirmado o [FROM] esperado). Abre el vuelo + cronómetro.
  despego(cc, tarea, nowEpoch) {
    this.vuelos.set(cc, { cc, tarea, despego_epoch: nowEpoch, avisado_demora: false });
    return pingDespego(cc, tarea, hhmm(nowEpoch));
  }

  // 🛬 Un CC aterrizó (reportó [FROM-CC#N]). Cierra el vuelo.
  aterrizo(cc, resultado, costoUsd, nowEpoch) {
    const v = this.vuelos.get(cc);
    const tarea = v?.tarea ?? '—';
    this.vuelos.delete(cc);
    void nowEpoch;
    return pingAterrizo(cc, tarea, resultado, costoUsd);
  }

  /**
   * tick — barrido de cronómetros (lo llama el latido cada N min).
   * Devuelve la lista de pings ⚠️/🔴 que DEBEN emitirse ahora (una sola vez por vuelo).
   * ⚠️ demorado: sin señal > demoraMin. 🔴 colgado lo emite el caller cuando el proceso
   * terminó sin reporte (exit code) — la torre expone el candidato por tiempo.
   */
  tick(nowEpoch) {
    const pings = [];
    for (const v of this.vuelos.values()) {
      const sinSenal = Math.floor((nowEpoch - v.despego_epoch) / 60);
      if (sinSenal >= this.demoraMin && !v.avisado_demora) {
        v.avisado_demora = true;
        pings.push({ cc: v.cc, sinSenalMin: sinSenal, texto: pingDemorado(v.cc, sinSenal) });
      }
    }
    return pings;
  }

  // 🔴 El caller marca un vuelo como colgado (proceso murió sin reporte / "standby a X").
  colgado(cc, esperandoQue, accion) {
    this.vuelos.delete(cc);
    return pingColgado(cc, esperandoQue, accion);
  }

  vuelosAbiertos() {
    return [...this.vuelos.values()];
  }
}

export {
  Torre,
  pingDespego,
  pingAterrizo,
  pingTodosEnTierra,
  pingDemorado,
  pingColgado,
  pingDecision,
  pingCosto,
  hhmm,
  fmtUsd,
};
