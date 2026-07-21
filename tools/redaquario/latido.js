// RedAquario · LATIDO · el vigilante del vigilante (spec §Pieza C · §144: "usar el sistema que ya existe").
// El portero hace ping a Healthchecks (ya en el stack · Free) cada 5 min. Latido ausente →
// Healthchecks dispara la alerta por el camino de monitoreo EXISTENTE → Emilio se entera de la caída.
// El silencio deja de ser ambiguo: con pings + sin actividad = no pasó nada · sin pings = la torre murió.
//
// DRY-RUN: loguea el ping en vez de emitirlo (no necesita el check creado · Fase 2 lo cablea real).

import { setInterval as setNodeInterval } from 'node:timers';

/**
 * pingHealthchecks — pega un GET al ping URL. PURO respecto de fetch (se inyecta).
 * Devuelve { ok, dryRun, url }. En dry-run no toca red.
 */
async function pingHealthchecks({ url, dryRun, fetchFn, logger }) {
  const log = logger || ((s) => console.log(s));
  if (dryRun || !url || url.startsWith('REEMPLAZAR')) {
    log(`[DRY-RUN] latido · habría hecho ping a Healthchecks (${url || 'sin URL configurada'})`);
    return { ok: true, dryRun: true, url };
  }
  try {
    const f = fetchFn || fetch;
    await f(url, { method: 'GET' });
    log(`💓 latido enviado · ${new Date().toISOString()}`);
    return { ok: true, dryRun: false, url };
  } catch (e) {
    log(`⚠️ latido FALLÓ · ${e?.message ?? e}`);
    return { ok: false, dryRun: false, url, error: String(e?.message ?? e) };
  }
}

/**
 * arrancarLatido — programa el ping cada N minutos. Devuelve un handle con stop().
 */
function arrancarLatido({ url, intervaloMin = 5, dryRun = true, fetchFn, logger }) {
  const ms = Math.max(1, intervaloMin) * 60 * 1000;
  pingHealthchecks({ url, dryRun, fetchFn, logger }); // primer latido inmediato
  const handle = setNodeInterval(() => {
    pingHealthchecks({ url, dryRun, fetchFn, logger });
  }, ms);
  handle.unref?.();
  return { stop: () => clearInterval(handle) };
}

export { pingHealthchecks, arrancarLatido };
