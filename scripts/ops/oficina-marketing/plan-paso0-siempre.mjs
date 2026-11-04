/**
 * 04-nov · ENCARGO Lenovo «el plan como se diseñó» punto 2 · flujo del plan `X9F0zp6LQ2xGEYVS` · paso 0 (informe de mercado, aprobado por Emilio el 31-oct).
 * Hoy «elegir brazos» solo lo pedía si el disparo traía `con_mercado === true` y el botón de aprobar el manual no lo manda: la corrida 2c0d2236 salió sin paso 0.
 * Ahora CORRE SIEMPRE, salvo que el disparo diga `con_mercado: false` o `null` (la reescritura lo manda en false a propósito: no vuelve a investigar el mercado).
 * Ausente = corre. En ensayo (dry_run) la puerta contesta «sin_respuesta» declarado y no llama al modelo (US$ 0). Un disparo que no es webhook (cron) sigue sin pedirlo.
 */
import { cambiarCodigo } from './lib.mjs'

const VIEJO = "try { con_mercado = $('Webhook · planeacion').first().json.body.con_mercado === true; } catch (e) { con_mercado = false; }"
const NUEVO = "try { const _cm = $('Webhook · planeacion').first().json.body.con_mercado; con_mercado = _cm === true || _cm === undefined; } catch (e) { con_mercado = false; }"

export function construirPlanPaso0Siempre(f) {
  cambiarCodigo(f, 'elegir brazos', VIEJO, NUEVO)
}
