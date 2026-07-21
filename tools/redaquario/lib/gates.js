// RedAquario · PORTERO · las 7 compuertas (§144 · spec canónica 2026-07-20)
// Lógica PURA · sin I/O · sin llaves · sin Date.now (todo se inyecta) → 100% testeable a $0.
// El orden de las compuertas es VINCULANTE (spec §Filtros 1..7). No reordenar sin §144.

// ── Vocabulario de comando anclado al INICIO (spec §2) ──────────────────────
// Sólo dispara si la PRIMERA LÍNEA arranca con el comando exacto.
// Menciones dentro del texto (citas · colas · registros) = inertes.

const RE_DESPACHO = /^DESPACHO\s+CC#(\d+)\b/;
const RE_REPORTE = /^\[FROM-CC(\d+)\]/;
// Vocabulario §144 de Emilio (solo su cuenta · anclado al inicio):
const RE_APROBADO_EJECUTEN = /^APROBADO\s*,?\s*EJECUTEN\b/;
const RE_APROBADO = /^APROBADO\b/;
const RE_EJECUTEN = /^EJECUTEN\b/;
const RE_FRENEN = /^FRENEN\b/;
const RE_STOP = /^STOP\b/;
const RE_GO = /^GO(\s+PORTERO)?\b/;

/**
 * parseCommand — clasifica un mensaje SOLO por su primera línea (anclaje spec §2).
 * Devuelve { kind, ... }. kind='inerte' si la primera línea no arranca con comando.
 * NUNCA mira el cuerpo: una etiqueta citada más abajo no dispara nada.
 */
function parseCommand(text) {
  const firstLine = String(text ?? '').split('\n', 1)[0].trim();

  let m;
  if ((m = firstLine.match(RE_DESPACHO))) {
    const payload = String(text).replace(/^[^\n]*\n?/, ''); // todo menos la 1ª línea
    return { kind: 'despacho', cc: `CC#${m[1]}`, payload, firstLine };
  }
  if ((m = firstLine.match(RE_REPORTE))) {
    return { kind: 'reporte', cc: `CC#${m[1]}`, firstLine };
  }
  // Control / vocabulario de Emilio (el gate de autor los valida aparte).
  if (RE_APROBADO_EJECUTEN.test(firstLine)) return { kind: 'gobernanza', signal: 'APROBADO_EJECUTEN', firstLine };
  if (RE_APROBADO.test(firstLine)) return { kind: 'gobernanza', signal: 'APROBADO', firstLine };
  if (RE_EJECUTEN.test(firstLine)) return { kind: 'gobernanza', signal: 'EJECUTEN', firstLine };
  if (RE_FRENEN.test(firstLine)) return { kind: 'gobernanza', signal: 'FRENEN', firstLine };
  if (RE_STOP.test(firstLine)) return { kind: 'control', signal: 'STOP', firstLine };
  if (RE_GO.test(firstLine)) return { kind: 'control', signal: 'GO', firstLine };

  return { kind: 'inerte', firstLine };
}

// ── Compuertas individuales (predicados puros) ──────────────────────────────

// Compuerta 1 · lista blanca de REMITENTES (§144 · innegociable).
function checkWhitelist(msg, config) {
  return (config.remitentes_autorizados || []).includes(msg.author);
}

// ¿La cuenta es la de Emilio? (para control/gobernanza solo-Emilio · spec §2/§6).
function isEmilio(msg, config) {
  return (config.cuentas_emilio || []).includes(msg.author);
}

// Compuerta 7 · marca de agua: solo mensajes POSTERIORES al último procesado.
// (ts de Slack son strings decimales epoch · comparación numérica.)
function checkWatermark(msg, state) {
  if (!state.last_ts) return true;
  return Number(msg.ts) > Number(state.last_ts);
}

// Compuerta 3 · dedup por message_ts (un mensaje = un arranque).
function checkDedup(msg, state) {
  return !state.processed_ts.has(msg.ts);
}

// Compuerta 4 · tope de tasa: máx N arranques/hora POR TIPO.
function checkRateCap(type, state, config) {
  const capHora = config?.topes?.arranques_por_hora ?? 4;
  const desde = state.now_epoch - 3600; // ventana rodante de 1h
  const enVentana = (state.arranques || []).filter(
    (a) => a.type === type && a.ts_epoch > desde
  ).length;
  return enVentana < capHora;
}

// Compuerta 5 · kill-switch local (archivo PORTERO_OFF · presencia se inyecta).
function checkKillSwitch(state) {
  return state.kill_switch !== true;
}

// Compuerta 6 · STOP remoto: si el sistema quedó FRENADO por un STOP de Emilio,
// no se despierta a nadie hasta un GO explícito de Emilio.
function checkStopState(state) {
  return state.stopped !== true;
}

/**
 * evaluate — corre las 7 compuertas EN ORDEN y devuelve una DECISIÓN estructurada.
 * NO ejecuta nada: sólo decide qué haría el portero. El caller (portero.js) actúa.
 *
 * decision.action ∈
 *   'ignore'      → descartar en silencio (inerte · watermark · dedup)
 *   'alert'       → 🔴 ping de alerta a Emilio (autor desconocido · tope excedido)
 *   'stop'        → Emilio frenó todo (🛑) · setea state.stopped
 *   'go'          → Emilio reactivó · limpia state.stopped
 *   'gobernanza'  → señal de Emilio (APROBADO/EJECUTEN/FRENEN) → despierta a Lenovo-exec
 *   'spawn_cc'    → DESPACHO CC#N → despertaría al CC (dry-run lo loguea)
 *   'wake_lenovo' → [FROM-CC#N] → despertaría al ejecutor Lenovo headless
 */
function evaluate(msg, state, config) {
  const cmd = parseCommand(msg.text);

  // C7 · marca de agua (antes que nada: jamás re-procesar historial).
  if (!checkWatermark(msg, state)) {
    return { action: 'ignore', gate: 'watermark', reason: 'mensaje anterior a la marca de agua', cmd };
  }

  // C1 · lista blanca de remitentes.
  if (!checkWhitelist(msg, config)) {
    // Etiqueta de comando + autor desconocido = IGNORAR + alerta 🔴 (spec §1).
    if (cmd.kind === 'despacho' || cmd.kind === 'reporte' || cmd.kind === 'control' || cmd.kind === 'gobernanza') {
      return { action: 'alert', gate: 'whitelist', emoji: '🔴',
        reason: `remitente NO autorizado con etiqueta de comando · autor=${msg.author}`, cmd };
    }
    return { action: 'ignore', gate: 'whitelist', reason: `remitente no autorizado · autor=${msg.author}`, cmd };
  }

  // C2 · palabra de comando anclada al inicio.
  if (cmd.kind === 'inerte') {
    return { action: 'ignore', gate: 'comando', reason: 'sin comando anclado al inicio', cmd };
  }

  // Control STOP/GO · SOLO cuenta de Emilio (spec §2/§6). De otra cuenta → ignorado.
  if (cmd.kind === 'control') {
    if (!isEmilio(msg, config)) {
      return { action: 'ignore', gate: 'stop-remoto', reason: 'STOP/GO de cuenta ajena · ignorado', cmd };
    }
    if (cmd.signal === 'STOP') {
      return { action: 'stop', gate: 'stop-remoto', emoji: '🛑', reason: 'STOP de Emilio · frena a todos', cmd };
    }
    return { action: 'go', gate: 'stop-remoto', reason: 'GO de Emilio · reactiva el portero', cmd };
  }

  // Gobernanza (APROBADO/EJECUTEN/FRENEN) · SOLO cuenta de Emilio.
  if (cmd.kind === 'gobernanza') {
    if (!isEmilio(msg, config)) {
      return { action: 'ignore', gate: 'gobernanza', reason: 'vocabulario de mando de cuenta ajena · ignorado', cmd };
    }
    // C5 · kill-switch.
    if (!checkKillSwitch(state)) {
      return { action: 'ignore', gate: 'kill-switch', reason: 'PORTERO_OFF presente', cmd };
    }
    // C3 · dedup.
    if (!checkDedup(msg, state)) {
      return { action: 'ignore', gate: 'dedup', reason: 'message_ts ya procesado', cmd };
    }
    return { action: 'gobernanza', gate: null, signal: cmd.signal,
      reason: `señal de mando de Emilio: ${cmd.signal} → Lenovo-exec`, cmd };
  }

  // Despacho a CC · reporte de CC → requieren pasar C5·C6·C3·C4.
  const type = cmd.kind === 'despacho' ? 'despacho' : 'reporte';

  // C5 · kill-switch local.
  if (!checkKillSwitch(state)) {
    return { action: 'ignore', gate: 'kill-switch', reason: 'PORTERO_OFF presente', cmd };
  }
  // C6 · STOP remoto activo.
  if (!checkStopState(state)) {
    return { action: 'ignore', gate: 'stop-remoto', reason: 'sistema FRENADO por STOP de Emilio · espera GO', cmd };
  }
  // C3 · dedup.
  if (!checkDedup(msg, state)) {
    return { action: 'ignore', gate: 'dedup', reason: 'message_ts ya procesado', cmd };
  }
  // C4 · tope de tasa por tipo.
  if (!checkRateCap(type, state, config)) {
    return { action: 'alert', gate: 'tope-tasa', emoji: '⚠️',
      reason: `tope ${config?.topes?.arranques_por_hora ?? 4}/hora excedido para tipo=${type}`, cmd };
  }

  if (cmd.kind === 'despacho') {
    return { action: 'spawn_cc', gate: null, cc: cmd.cc, payload: cmd.payload,
      reason: `DESPACHO ${cmd.cc} · despertaría al empleado`, cmd };
  }
  return { action: 'wake_lenovo', gate: null, cc: cmd.cc,
    reason: `reporte de ${cmd.cc} · despertaría al ejecutor Lenovo`, cmd };
}

export {
  parseCommand,
  checkWhitelist,
  isEmilio,
  checkWatermark,
  checkDedup,
  checkRateCap,
  checkKillSwitch,
  checkStopState,
  evaluate,
};
